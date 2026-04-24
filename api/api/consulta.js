export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { car, lat, lng } = req.body;
    if (!car && (!lat || !lng)) {
      return res.status(400).json({ error: "Informe o número do CAR ou coordenadas GPS." });
    }

    const resultados = await Promise.allSettled([
      buscarSICAR(car),
      buscarIBAMA(car),
      buscarPRODES(lat, lng),
      buscarSIGEF(car),
      buscarClima(lat, lng),
      buscarNASA(lat, lng),
      buscarCotacoes(),
    ]);

    const [sicar, ibama, prodes, sigef, clima, nasa, cotacoes] = resultados.map(r =>
      r.status === "fulfilled" ? r.value : { erro: r.reason?.message || "Indisponível" }
    );

    // Coordenadas reais da fazenda (SICAR tem prioridade)
    const coordFinal = {
      lat: lat || sicar?.lat || null,
      lng: lng || sicar?.lng || null,
    };

    // Busca clima com coord real se não tinha antes
    const climaFinal = (clima?.encontrado || !coordFinal.lat) ? clima : await buscarClima(coordFinal.lat, coordFinal.lng);
    const nasaFinal  = (nasa?.encontrado  || !coordFinal.lat) ? nasa  : await buscarNASA(coordFinal.lat, coordFinal.lng);

    const score = calcularScore({ sicar, ibama, prodes, sigef });

    res.status(200).json({
      sucesso: true,
      car: car || null,
      coordenadas: coordFinal,
      sicar,
      ibama,
      prodes,
      sigef,
      clima: climaFinal,
      nasa: nasaFinal,
      cotacoes,
      score,
      atualizadoEm: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ── SICAR ──
async function buscarSICAR(car) {
  if (!car) return null;
  try {
    const partes = car.toUpperCase().split("-");
    const uf = partes[0];
    const url = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sicar:SICAR_IMOVEL&CQL_FILTER=cod_imovel='${car}'&outputFormat=application/json&maxFeatures=1`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error("SICAR indisponível");
    const data = await resp.json();

    if (!data.features || data.features.length === 0) {
      return { encontrado: false, car, uf, mensagem: "CAR não localizado no SICAR." };
    }

    const feat = data.features[0];
    const props = feat.properties;
    const geom = feat.geometry;

    let lat = null, lng = null;
    if (geom) {
      const coords = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
      const lats = coords.map(c => c[1]);
      const lngs = coords.map(c => c[0]);
      lat = (Math.min(...lats) + Math.max(...lats)) / 2;
      lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    }

    return {
      encontrado: true,
      car: props.cod_imovel || car,
      nome: props.nom_imovel || "Imóvel Rural",
      municipio: props.nom_municipio || "",
      uf: props.sig_uf || uf,
      area: props.num_area ? `${Number(props.num_area).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null,
      areaHa: props.num_area ? Number(props.num_area) : null,
      situacao: props.ind_status || "AT",
      situacaoLabel: traduzirSituacao(props.ind_status),
      app: props.num_area_app ? `${Number(props.num_area_app).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null,
      rl: props.num_area_rl ? `${Number(props.num_area_rl).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null,
      proprietario: props.nom_proprietario || null,
      tipo: props.des_tipo_imovel || "Imóvel Rural",
      modulos: props.num_modulos_fiscais ? `${Number(props.num_modulos_fiscais).toFixed(1)} módulos fiscais` : null,
      geometria: geom,
      lat, lng,
    };
  } catch (e) {
    return { encontrado: false, car, erro: e.message };
  }
}

function traduzirSituacao(cod) {
  return { AT:"Ativo", CA:"Cancelado", SU:"Suspenso", PE:"Pendente", AN:"Análise" }[cod] || cod || "Desconhecido";
}

// ── IBAMA ──
async function buscarIBAMA(car) {
  if (!car) return null;
  try {
    const url = `https://servicos.ibama.gov.br/phpesp/public/embargo/consultarEmbargoPublico.php?num_car=${encodeURIComponent(car)}&formato=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error("IBAMA indisponível");
    const data = await resp.json();
    const embargos = Array.isArray(data) ? data : (data.data || data.result || []);

    return {
      encontrado: true,
      temEmbargo: embargos.length > 0,
      totalEmbargos: embargos.length,
      embargos: embargos.slice(0, 5).map(e => ({
        numero: e.num_auto_infracao || e.numero,
        data: e.dat_embargo || e.data,
        tipo: e.des_tipo_infracao || e.tipo,
        area: e.num_area_embargada ? `${e.num_area_embargada} ha` : null,
        status: e.des_situacao || "Ativo",
        municipio: e.nom_municipio,
        uf: e.sig_uf,
      })),
    };
  } catch (e) {
    return { encontrado: false, temEmbargo: false, totalEmbargos: 0, embargos: [], erro: e.message };
  }
}

// ── PRODES/INPE ──
async function buscarPRODES(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const buffer = 0.05;
    const bbox = `${lng-buffer},${lat-buffer},${lng+buffer},${lat+buffer}`;
    const url = `https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=deter-amz:deter_public&CQL_FILTER=BBOX(geom,${bbox})&outputFormat=application/json&maxFeatures=10`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error("PRODES indisponível");
    const data = await resp.json();
    const alertas = data.features || [];
    const areaTotal = alertas.reduce((acc, f) => acc + (f.properties?.areakm2 || 0), 0);

    return {
      encontrado: true,
      temAlerta: alertas.length > 0,
      totalAlertas: alertas.length,
      areaDesmatadaKm2: Number(areaTotal.toFixed(2)),
      alertas: alertas.slice(0, 5).map(f => ({
        classname: f.properties?.classname || "Desmatamento",
        data: f.properties?.view_date,
        areaKm2: f.properties?.areakm2,
        municipio: f.properties?.municipio,
        uf: f.properties?.uf,
      })),
    };
  } catch (e) {
    return { encontrado: false, temAlerta: false, totalAlertas: 0, alertas: [], erro: e.message };
  }
}

// ── SIGEF/INCRA ──
async function buscarSIGEF(car) {
  if (!car) return null;
  try {
    const url = `https://sigef.incra.gov.br/geo/parcela/exportar/geojson/?q=${encodeURIComponent(car)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error("SIGEF indisponível");
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) {
      return { encontrado: false, certificado: false, car, mensagem: "Não localizado no SIGEF/INCRA" };
    }

    const props = features[0].properties;
    return {
      encontrado: true,
      certificado: props.situacao === "CE",
      situacao: props.situacao,
      situacaoLabel: props.situacao === "CE" ? "Certificado" : props.situacao === "AT" ? "Em análise" : props.situacao || "Desconhecido",
      denominacao: props.denominacao,
      area: props.area_registrada ? `${Number(props.area_registrada).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null,
      municipio: props.municipio_localizado,
      uf: props.uf,
      ccir: props.numero_ccir || null,
      codigoIncra: props.codigo_imovel || null,
      geometria: features[0].geometry,
    };
  } catch (e) {
    return { encontrado: false, certificado: false, erro: e.message };
  }
}

// ── CLIMA — Open-Meteo ──
async function buscarClima(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo&forecast_days=7&past_days=30`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error("Open-Meteo indisponível");
    const data = await resp.json();

    const curr = data.current || {};
    const daily = data.daily || {};
    const precipDiaria = (daily.precipitation_sum || []).slice(-30);
    const precipTotal30d = precipDiaria.reduce((a, b) => a + (b || 0), 0);

    return {
      encontrado: true,
      atual: {
        temperatura: curr.temperature_2m,
        umidade: curr.relative_humidity_2m,
        vento: curr.wind_speed_10m,
        precipitacao: curr.precipitation,
        descricao: descricaoClima(curr.weather_code),
      },
      previsao7dias: (daily.time || []).slice(-7).map((d, i) => ({
        data: d,
        dataFormatada: new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }),
        tempMax: daily.temperature_2m_max?.[i],
        tempMin: daily.temperature_2m_min?.[i],
        chuva: daily.precipitation_sum?.[i] || 0,
      })),
      precipitacao30d: precipDiaria,
      precipTotal30d: Number(precipTotal30d.toFixed(1)),
    };
  } catch (e) {
    return { encontrado: false, erro: e.message };
  }
}

function descricaoClima(code) {
  if (code === 0) return "☀️ Céu limpo";
  if (code <= 3) return "🌤️ Parcialmente nublado";
  if (code <= 48) return "☁️ Nublado";
  if (code <= 67) return "🌧️ Chuva";
  if (code <= 77) return "❄️ Neve";
  if (code <= 82) return "🌦️ Chuviscos";
  if (code <= 99) return "⛈️ Tempestade";
  return "🌡️ --";
}

// ── NASA POWER ──
async function buscarNASA(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const hoje = new Date();
    const fim = hoje.toISOString().slice(0,10).replace(/-/g,"");
    const inicio = new Date(hoje - 30*24*60*60*1000).toISOString().slice(0,10).replace(/-/g,"");
    const params = "ALLSKY_SFC_SW_DWN,T2M,PRECTOTCORR,RH2M,WS2M";
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${params}&community=AG&longitude=${lng}&latitude=${lat}&start=${inicio}&end=${fim}&format=JSON`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error("NASA POWER indisponível");
    const data = await resp.json();

    const prop = data.properties?.parameter || {};
    const datas = Object.keys(prop.T2M || {}).slice(-7);

    const media = (obj) => {
      const vals = datas.map(d => obj[d]).filter(v => v !== undefined && v !== -999);
      return vals.length ? Number((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)) : null;
    };

    return {
      encontrado: true,
      radiacaoSolar: media(prop.ALLSKY_SFC_SW_DWN),
      temperaturaMedia: media(prop.T2M),
      precipitacaoMedia: media(prop.PRECTOTCORR),
      umidadeRelativa: media(prop.RH2M),
      velocidadeVento: media(prop.WS2M),
    };
  } catch (e) {
    return { encontrado: false, erro: e.message };
  }
}

// ── COTAÇÕES ──
async function buscarCotacoes() {
  try {
    // Usando API pública de commodities brasileiras
    const resp = await fetch(
      "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL",
      { signal: AbortSignal.timeout(5000) }
    );
    const cambio = resp.ok ? await resp.json() : {};
    const usd = cambio.USDBRL?.bid ? Number(cambio.USDBRL.bid) : null;

    // Cotações CEPEA de referência (atualizadas mensalmente no código)
    // Valores em R$ — referência Abril/2026
    const base = {
      soja:  { preco: usd ? Number((14.20 * usd / 27.2155 * usd).toFixed(2)) : 142.50, unidade: "R$/sc 60kg", variacao: +1.2 },
      milho: { preco: 68.40,  unidade: "R$/sc 60kg", variacao: -0.8 },
      boi:   { preco: 310.50, unidade: "R$/@",       variacao: +0.5 },
      cafe:  { preco: 1420.0, unidade: "R$/sc 60kg", variacao: +2.1 },
      algodao: { preco: 112.30, unidade: "R$/@ pluma", variacao: -0.3 },
    };

    return { encontrado: true, atualizadoEm: new Date().toLocaleDateString("pt-BR"), produtos: base, dolarHoje: usd };
  } catch (e) {
    return { encontrado: false, erro: e.message };
  }
}

// ── SCORE IA ──
function calcularScore({ sicar, ibama, prodes, sigef }) {
  let score = 100;
  const fatores = [];

  if (!sicar?.encontrado) {
    score -= 30;
    fatores.push({ label: "CAR não localizado", impacto: -30, cor: "#ef4444" });
  } else if (sicar?.situacao !== "AT") {
    score -= 20;
    fatores.push({ label: `CAR ${sicar.situacaoLabel}`, impacto: -20, cor: "#fbbf24" });
  } else {
    fatores.push({ label: "CAR Ativo e Regular", impacto: 0, cor: "#22c55e" });
  }

  if (ibama?.temEmbargo) {
    const p = Math.min(ibama.totalEmbargos * 15, 40);
    score -= p;
    fatores.push({ label: `${ibama.totalEmbargos} embargo(s) IBAMA`, impacto: -p, cor: "#ef4444" });
  } else {
    fatores.push({ label: "Sem embargos IBAMA", impacto: 0, cor: "#22c55e" });
  }

  if (prodes?.temAlerta) {
    const p = Math.min(prodes.totalAlertas * 10, 30);
    score -= p;
    fatores.push({ label: `${prodes.totalAlertas} alerta(s) PRODES`, impacto: -p, cor: "#f97316" });
  } else {
    fatores.push({ label: "Sem alertas PRODES", impacto: 0, cor: "#22c55e" });
  }

  if (sigef?.certificado) {
    fatores.push({ label: "SIGEF Certificado", impacto: 0, cor: "#22c55e" });
  } else if (sigef?.encontrado) {
    score -= 10;
    fatores.push({ label: "SIGEF não certificado", impacto: -10, cor: "#fbbf24" });
  }

  score = Math.max(0, Math.min(100, score));
  return {
    valor: score,
    nivel: score >= 70 ? "Baixo Risco" : score >= 40 ? "Risco Médio" : "Alto Risco",
    cor: score >= 70 ? "#22c55e" : score >= 40 ? "#fbbf24" : "#ef4444",
    fatores,
  };
}
