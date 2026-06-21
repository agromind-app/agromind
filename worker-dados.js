/**
 * AGROMIND — Worker de Enriquecimento de Dados
 * Deploy: Cloudflare Workers
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function norm(str) {
  if (!str) return "";
  return str.toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase().trim();
}

async function fetchComTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 8000);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function buscarSICARGeo(car) {
  try {
    const carNorm = car.toUpperCase().replace(/\./g, "-").trim();
    const uf = carNorm.match(/^([A-Z]{2})-/i)?.[1]?.toLowerCase();
    if (!uf) return null;
    const url = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sicar:sicar_imoveis_${uf}&CQL_FILTER=${encodeURIComponent(`cod_imovel = '${carNorm}'`)}&outputFormat=application%2Fjson&maxFeatures=1`;
    const resp = await fetchComTimeout(url, { timeout: 12000, headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://consultapublica.car.gov.br/" } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const f = data.features?.[0];
    if (!f) return null;
    const p = f.properties || {};
    const geom = f.geometry;
    let lat = null, lng = null;
    if (geom) {
      try {
        const coords = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
        lat = (Math.min(...coords.map(c=>c[1])) + Math.max(...coords.map(c=>c[1]))) / 2;
        lng = (Math.min(...coords.map(c=>c[0])) + Math.max(...coords.map(c=>c[0]))) / 2;
      } catch {}
    }
    const fmt = v => v ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null;
    return {
      fonte: "SICAR_GEO",
      car: p.cod_imovel || car,
      nome: p.nom_imovel || null,
      municipio: p.nom_municipio || null,
      uf: p.sig_uf || uf.toUpperCase(),
      area: fmt(p.num_area || p.area || p.area_imovel),
      areaHa: p.num_area ? Number(p.num_area) : null,
      situacao: p.ind_status || "AT",
      situacaoLabel: ({AT:"Ativo",CA:"Cancelado",SU:"Suspenso",PE:"Pendente",AN:"Análise"})[p.ind_status] || "Ativo",
      app: fmt(p.num_area_app || p.area_app),
      rl: fmt(p.num_area_rl || p.area_rl),
      proprietario: p.nom_proprietario || null,
      ccir: p.num_ccir || null,
      nirf: p.num_nirf || null,
      modulos: p.num_modulos_fiscais ? `${Number(p.num_modulos_fiscais).toFixed(1)} módulos fiscais` : null,
      geometria: geom, lat, lng,
    };
  } catch { return null; }
}

async function buscarSICARPublico(car) {
  const endpoints = [
    `https://consultapublica.car.gov.br/publico/imoveis/buscarImovel?num_car=${encodeURIComponent(car)}`,
    `https://consultapublica.car.gov.br/publico/municipios/buscarImovel?num_car=${encodeURIComponent(car)}`,
  ];
  for (const url of endpoints) {
    try {
      const resp = await fetchComTimeout(url, { timeout: 6000, headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": "https://consultapublica.car.gov.br/", "Origin": "https://consultapublica.car.gov.br" } });
      if (!resp.ok) continue;
      const ct = resp.headers.get("content-type") || "";
      if (!ct.includes("json")) continue;
      const data = await resp.json();
      if (!data || data.erro) continue;
      const nome = data.nom_imovel || data.nome || data.denominacao || null;
      const prop = data.nom_proprietario || data.proprietario || null;
      const ccir = data.num_ccir || data.ccir || null;
      const nirf = data.num_nirf || data.nirf || null;
      if (nome || prop || ccir) return { fonte: "SICAR_PUBLICO", nome, proprietario: prop, ccir, nirf };
    } catch {}
  }
  return null;
}

async function buscarSIGEF(car, ccir) {
  const q = car || ccir;
  if (!q) return null;
  try {
    const resp = await fetchComTimeout(`https://sigef.incra.gov.br/geo/parcela/exportar/geojson/?q=${encodeURIComponent(q)}`, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const f = data.features?.[0];
    if (!f) return null;
    const p = f.properties || {};
    const geom = f.geometry;
    let lat = null, lng = null;
    if (geom?.coordinates) {
      try {
        const coords = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
        lat = (Math.min(...coords.map(c=>c[1])) + Math.max(...coords.map(c=>c[1]))) / 2;
        lng = (Math.min(...coords.map(c=>c[0])) + Math.max(...coords.map(c=>c[0]))) / 2;
      } catch {}
    }
    return {
      fonte: "SIGEF", encontrado: true,
      certificado: p.situacao === "CE",
      situacaoLabel: p.situacao === "CE" ? "Certificado" : p.situacao === "AT" ? "Em análise" : p.situacao || "Desconhecido",
      denominacao: p.denominacao || null, nome: p.denominacao || null,
      area: p.area_registrada ? `${Number(p.area_registrada).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null,
      municipio: p.municipio_localizado || null, uf: p.uf || null,
      ccir: p.numero_ccir || ccir || null, codigoIncra: p.codigo_imovel || null,
      proprietario: p.detentores?.[0]?.nome || null,
      geometria: geom, lat, lng,
    };
  } catch { return null; }
}

async function buscarSNCR(ccir, car) {
  if (!ccir && !car) return null;
  try {
    const urls = [
      ccir ? `https://sncr.serpro.gov.br/sncr/publico/externo/consultarImovel?numCCIR=${encodeURIComponent(ccir.replace(/[.\-\s]/g,""))}` : null,
      car ? `https://sncr.serpro.gov.br/sncr/publico/externo/consultarImovelPorCar?numCar=${encodeURIComponent(car)}` : null,
    ].filter(Boolean);
    for (const url of urls) {
      try {
        const resp = await fetchComTimeout(url, { timeout: 6000, headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
        if (!resp.ok) continue;
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("json")) continue;
        const data = await resp.json();
        if (data && !data.erro) return { fonte: "SNCR", nome: data.denominacao || data.nome || null, proprietario: data.proprietario || data.nome_proprietario || null, ccir: data.numCCIR || data.ccir || ccir || null, municipio: data.municipio || null, uf: data.uf || null, area: data.area ? `${Number(data.area).toLocaleString("pt-BR")} ha` : null, nirf: data.nirf || null };
      } catch {}
    }
    return null;
  } catch { return null; }
}

async function buscarIBGE(municipio, uf) {
  if (!municipio || !uf) return null;
  try {
    const resp = await fetchComTimeout(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf.toLowerCase()}/municipios`, { timeout: 4000 });
    if (!resp.ok) return null;
    const lista = await resp.json();
    const normMun = norm(municipio);
    const match = lista.find(m => norm(m.nome) === normMun || norm(m.nome).includes(normMun.substring(0,8)));
    if (!match) return null;
    return { ibgeCodigo: match.id, ibgeNome: match.nome, microrregiao: match.microrregiao?.nome || null, mesorregiao: match.microrregiao?.mesorregiao?.nome || null };
  } catch { return null; }
}

async function detectarEstadoPorGPS(latNum, lngNum) {
  try {
    const resp = await fetchComTimeout(
      `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lngNum}&format=json&addressdetails=1`,
      { timeout: 5000, headers: { "User-Agent": "AgroMind/1.0" } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const estado = data.address?.state_code || data.address?.["ISO3166-2-lvl4"];
    if (estado) {
      const uf = estado.replace("BR-", "").toLowerCase().trim();
      const UFS = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe","pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to"];
      if (UFS.includes(uf)) return uf;
    }
    const mapaEstados = { "Maranhão":"ma","Mato Grosso":"mt","Pará":"pa","Bahia":"ba","Goiás":"go","Minas Gerais":"mg","São Paulo":"sp","Paraná":"pr","Tocantins":"to","Mato Grosso do Sul":"ms","Piauí":"pi","Rondônia":"ro","Amazonas":"am","Roraima":"rr","Acre":"ac","Amapá":"ap","Rio de Janeiro":"rj","Espírito Santo":"es","Santa Catarina":"sc","Rio Grande do Sul":"rs","Paraíba":"pb","Pernambuco":"pe","Ceará":"ce","Rio Grande do Norte":"rn","Alagoas":"al","Sergipe":"se","Distrito Federal":"df" };
    return mapaEstados[data.address?.state] || null;
  } catch { return null; }
}

async function buscarCARporGPS(latNum, lngNum) {
  const uf = await detectarEstadoPorGPS(latNum, lngNum);
  if (!uf) return null;

  const buffers = [0.009, 0.04, 0.09];
  const tentativas = buffers.map(async (buffer) => {
    try {
      const bbox = `${lngNum-buffer},${latNum-buffer},${lngNum+buffer},${latNum+buffer}`;
      const url = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sicar:sicar_imoveis_${uf}&CQL_FILTER=${encodeURIComponent(`BBOX(geom,${bbox})`)}&outputFormat=application%2Fjson&maxFeatures=1`;
      const resp = await fetchComTimeout(url, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://consultapublica.car.gov.br/" } });
      if (!resp.ok) return null;
      const data = await resp.json();
      const f = data.features?.[0];
      if (!f) return null;
      const p = f.properties || {};
      const car = p.cod_imovel || p.num_car || null;
      return car ? { car, uf, fonte: "GPS_BBOX", buffer } : null;
    } catch { return null; }
  });

  const resultados = await Promise.all(tentativas);
  return resultados.find(r => r !== null) || null;
}

function mesclarFontes(geo, publico, sigef, sncr, ibge) {
  const resultado = { car: geo?.car || null, nome: null, proprietario: null, ccir: null, nirf: null, municipio: null, uf: null, area: null, areaHa: null, app: null, rl: null, modulos: null, situacao: null, situacaoLabel: null, geometria: null, lat: null, lng: null, sigefCertificado: false, sigefSituacao: null, codigoIncra: null, ibgeCodigo: null, microrregiao: null, mesorregiao: null, fontes: [] };
  const fontes = [geo, sigef, publico, sncr].filter(Boolean);
  for (const f of fontes) {
    if (!f) continue;
    if (f.fonte) resultado.fontes.push(f.fonte);
    if (!resultado.nome && (f.nome || f.denominacao)) resultado.nome = f.nome || f.denominacao;
    if (!resultado.proprietario && f.proprietario) resultado.proprietario = f.proprietario;
    if (!resultado.ccir && f.ccir) resultado.ccir = f.ccir;
    if (!resultado.nirf && f.nirf) resultado.nirf = f.nirf;
    if (!resultado.municipio && f.municipio) resultado.municipio = f.municipio;
    if (!resultado.uf && f.uf) resultado.uf = f.uf;
    if (!resultado.area && f.area) resultado.area = f.area;
    if (!resultado.areaHa && f.areaHa) resultado.areaHa = f.areaHa;
    if (!resultado.app && f.app) resultado.app = f.app;
    if (!resultado.rl && f.rl) resultado.rl = f.rl;
    if (!resultado.modulos && f.modulos) resultado.modulos = f.modulos;
    if (!resultado.situacao && f.situacao) resultado.situacao = f.situacao;
    if (!resultado.situacaoLabel && f.situacaoLabel) resultado.situacaoLabel = f.situacaoLabel;
    if (!resultado.geometria && f.geometria) resultado.geometria = f.geometria;
    if (!resultado.lat && f.lat) resultado.lat = f.lat;
    if (!resultado.lng && f.lng) resultado.lng = f.lng;
  }
  if (sigef) { resultado.sigefCertificado = sigef.certificado || false; resultado.sigefSituacao = sigef.situacaoLabel || null; resultado.codigoIncra = sigef.codigoIncra || null; }
  if (ibge) { resultado.ibgeCodigo = ibge.ibgeCodigo; resultado.microrregiao = ibge.microrregiao; resultado.mesorregiao = ibge.mesorregiao; }
  if (!resultado.nome) resultado.nome = "Imóvel Rural";
  return resultado;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ erro: "Use POST" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    try {
      // Lê o body como texto primeiro para debug
      const bodyText = await request.text();
      let bodyJson = {};
      try { bodyJson = JSON.parse(bodyText); } catch(e) {
        return new Response(JSON.stringify({ sucesso: false, erro: "JSON inválido: " + e.message, bodyRecebido: bodyText }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // Extrai campos explicitamente
      const car = bodyJson.car || null;
      const ccir = bodyJson.ccir || null;
      const itr = bodyJson.itr || null;
      const latRaw = bodyJson.lat;
      const lngRaw = bodyJson.lng;
      const latNum = latRaw !== undefined && latRaw !== null ? parseFloat(latRaw) : null;
      const lngNum = lngRaw !== undefined && lngRaw !== null ? parseFloat(lngRaw) : null;

      // Validação
      const temGPS = latNum !== null && lngNum !== null && !isNaN(latNum) && !isNaN(lngNum);
      if (!car && !ccir && !itr && !temGPS) {
        return new Response(JSON.stringify({
          sucesso: false,
          erro: "Informe CAR, CCIR, ITR ou coordenadas GPS.",
          debug: { bodyRecebido: bodyJson, latRaw, lngRaw, latNum, lngNum, temGPS }
        }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // GPS: resolve CAR primeiro
      let carFinal = car || null;
      let gpsResult = null;

      if (!carFinal && temGPS) {
        gpsResult = await buscarCARporGPS(latNum, lngNum);
        if (gpsResult?.car) carFinal = gpsResult.car;
      }

      // Se GPS não achou CAR mas tem coordenadas, retorna resultado parcial com as coordenadas
      if (!carFinal && !ccir && !itr) {
        return new Response(JSON.stringify({
          sucesso: true,
          encontrado: false,
          car: null,
          gps: gpsResult,
          dados: { nome: "Imóvel não localizado no SICAR", lat: latNum, lng: lngNum },
          debug: { temGPS, latNum, lngNum, gpsResult }
        }), { headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // Busca em PARALELO todas as fontes
      const [geo, publico, sigef, sncr] = await Promise.allSettled([
        carFinal ? buscarSICARGeo(carFinal) : Promise.resolve(null),
        carFinal ? buscarSICARPublico(carFinal) : Promise.resolve(null),
        buscarSIGEF(carFinal, ccir),
        buscarSNCR(ccir || itr, carFinal),
      ]);

      const geoData = geo.status === "fulfilled" ? geo.value : null;
      const publicoData = publico.status === "fulfilled" ? publico.value : null;
      const sigefData = sigef.status === "fulfilled" ? sigef.value : null;
      const sncrData = sncr.status === "fulfilled" ? sncr.value : null;

      const mun = geoData?.municipio || sigefData?.municipio || sncrData?.municipio;
      const ufFinal = geoData?.uf || sigefData?.uf || sncrData?.uf;
      const ibgeData = mun && ufFinal ? await buscarIBGE(mun, ufFinal) : null;

      const dados = mesclarFontes(geoData, publicoData, sigefData, sncrData, ibgeData);
      const encontrado = !!(geoData || sigefData || sncrData);

      return new Response(JSON.stringify({
        sucesso: true,
        encontrado,
        car: carFinal || dados.car,
        gps: gpsResult || null,
        dados,
        debug: { fontes: dados.fontes, sicar: !!geoData, sicarPublico: !!publicoData, sigef: !!sigefData, sncr: !!sncrData, ibge: !!ibgeData }
      }), { headers: { ...CORS, "Content-Type": "application/json" } });

    } catch (e) {
      return new Response(JSON.stringify({ sucesso: false, erro: e.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }
};