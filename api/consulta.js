import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { credential } from "firebase-admin";

export const config = { maxDuration: 30 };

const PROXY_URL = "https://agromind-proxy.agromindpro.workers.dev";
const CACHE_DIAS = 7;

function getAdmin() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

function getDB() {
  getAdmin();
  return getFirestore();
}

function chaveCache(body) {
  if (body.car)          return `car_${body.car.toUpperCase().replace(/[\s\.]/g, "")}`;
  if (body.ccir)         return `ccir_${body.ccir.replace(/[.\-\s]/g, "")}`;
  if (body.itr)          return `itr_${body.itr.replace(/[.\-\s]/g, "")}`;
  if (body.proprietario) return `prop_${body.proprietario.trim().toLowerCase()}`;
  if (body.nomeFazenda)  return `faz_${body.nomeFazenda.trim().toLowerCase()}`;
  if (body.lat && body.lng) return `gps_${Number(body.lat).toFixed(4)}_${Number(body.lng).toFixed(4)}`;
  return null;
}

async function lerCache(chave) {
  try {
    const db = getDB();
    const doc = await db.collection("cache_car").doc(chave).get();
    if (!doc.exists) return null;
    const data = doc.data();
    const agora = Date.now();
    const salvoEm = data.salvoEm?.toMillis?.() || 0;
    const diasPassados = (agora - salvoEm) / (1000 * 60 * 60 * 24);
    if (diasPassados > CACHE_DIAS) return null;
    return data.resultado;
  } catch { return null; }
}

async function salvarCache(chave, resultado) {
  try {
    const db = getDB();
    await db.collection("cache_car").doc(chave).set({ resultado, salvoEm: new Date(), chave });
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { car, lat, lng, ccir, itr, proprietario, nomeFazenda } = req.body;

    if (!car && !ccir && !itr && !proprietario && !nomeFazenda && (!lat || !lng)) {
      return res.status(400).json({ sucesso: false, error: "Informe CAR, CCIR, ITR, GPS ou outro critério de busca." });
    }

    const chave = chaveCache(req.body);
    if (chave) {
      const cached = await lerCache(chave);
      if (cached) {
        console.log(`[CACHE HIT] ${chave}`);
        return res.status(200).json({ ...cached, fromCache: true });
      }
    }

    // ✅ APENAS SICAR + SIGEF aqui — IBAMA/PRODES/Clima/NASA/Cotações ficam no frontend
    const [sicar, sigef] = await Promise.all([
      buscarSICAR({ car, ccir, itr, proprietario, nomeFazenda }),
      buscarSIGEF({ car, ccir }),
    ]);

    const coordLat = lat || sicar?.lat || sigef?.lat || null;
    const coordLng = lng || sicar?.lng || sigef?.lng || null;

    const score = calcularScore({ sicar, sigef });

    const resultado = {
      sucesso: true,
      car: car || sicar?.car || null,
      coordenadas: { lat: coordLat, lng: coordLng },
      sicar,
      sigef,
      score,
      atualizadoEm: new Date().toISOString(),
    };

    if (chave && sicar?.encontrado) {
      await salvarCache(chave, resultado);
      console.log(`[CACHE SAVED] ${chave}`);
    }

    res.status(200).json(resultado);

  } catch (error) {
    console.error("[CONSULTA ERROR]", error.message);
    res.status(500).json({ sucesso: false, error: "Erro ao consultar. Tente novamente em instantes." });
  }
}

const HEADERS_BR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "Origin": "https://www.car.gov.br",
  "Referer": "https://www.car.gov.br/publico/imoveis/index",
};

const UFS_BR = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe","pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to"];

async function consultarSICAR(typeName, filtro) {
  const sicarUrl = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${typeName}&CQL_FILTER=${encodeURIComponent(filtro)}&outputFormat=application%2Fjson&maxFeatures=1`;
  const resp = await fetch(`${PROXY_URL}?url=${encodeURIComponent(sicarUrl)}`, {
    signal: AbortSignal.timeout(22000),
  });
  if (!resp.ok) throw new Error(`SICAR HTTP ${resp.status}`);
  const data = await resp.json();
  return data.features || [];
}

function parsearFeatureSICAR(feat, car, ccir, itr) {
  const props = feat.properties;
  const geom = feat.geometry;
  let latC = null, lngC = null;
  if (geom) {
    try {
      const coords = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
      const lats = coords.map(c => c[1]);
      const lngs = coords.map(c => c[0]);
      latC = (Math.min(...lats) + Math.max(...lats)) / 2;
      lngC = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    } catch {}
  }
  const areaVal = props.num_area || props.area || props.area_imovel || null;
  const appVal  = props.num_area_app || props.area_app || null;
  const rlVal   = props.num_area_rl  || props.area_rl  || null;
  const modVal  = props.num_modulos_fiscais || props.m_fiscal || null;
  const sitVal  = props.ind_status || props.status_imovel || "AT";
  const formatarHa = (v) => v ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null;
  return {
    encontrado: true,
    car:          props.cod_imovel || car,
    nome:         props.nom_imovel || props.nome_imovel || "Imóvel Rural",
    municipio:    props.nom_municipio || props.municipio || "",
    uf:           props.sig_uf || props.uf || "",
    area:         formatarHa(areaVal),
    areaHa:       areaVal ? Number(areaVal) : null,
    situacao:     sitVal,
    situacaoLabel: traduzirSituacao(sitVal),
    condicao:     props.condicao || null,
    app:          formatarHa(appVal),
    rl:           formatarHa(rlVal),
    proprietario: props.nom_proprietario || props.proprietario || null,
    tipo:         props.des_tipo_imovel || props.tipo_imovel || "Imóvel Rural",
    modulos:      modVal ? `${Number(modVal).toFixed(1)} módulos fiscais` : null,
    ccir:         props.num_ccir || props.ccir || ccir || null,
    nirf:         props.num_nirf || props.nirf || itr || null,
    geometria:    geom,
    lat:          latC,
    lng:          lngC,
  };
}

async function buscarSICAR({ car, ccir, itr, proprietario, nomeFazenda }) {
  try {
    let filtro = "";
    let ufDetectada = null;
    if (car) {
      const carNorm = car.toUpperCase().replace(/\./g, "-");
      filtro = `cod_imovel = '${carNorm}'`;
      const match = car.match(/^([A-Z]{2})-/i);
      if (match) ufDetectada = match[1].toLowerCase();
    } else if (ccir) {
      filtro = `num_ccir = '${ccir.replace(/[.\-\s]/g, "")}'`;
    } else if (itr) {
      filtro = `num_nirf = '${itr.replace(/[.\-\s]/g, "")}'`;
    } else if (proprietario) {
      filtro = `nom_proprietario ILIKE '%${proprietario}%'`;
    } else if (nomeFazenda) {
      filtro = `nom_imovel ILIKE '%${nomeFazenda}%'`;
    } else return null;

    if (car && car.includes(".")) {
      try {
        const filtroOriginal = `cod_imovel = '${car.toUpperCase()}'`;
        const uf = ufDetectada || "ma";
        const features = await consultarSICAR(`sicar:sicar_imoveis_${uf}`, filtroOriginal);
        if (features.length > 0) return parsearFeatureSICAR(features[0], car, ccir, itr);
      } catch {}
    }

    if (ufDetectada) {
      try {
        const features = await consultarSICAR(`sicar:sicar_imoveis_${ufDetectada}`, filtro);
        if (features.length > 0) return parsearFeatureSICAR(features[0], car, ccir, itr);
      } catch {}
      try {
        const carBase = car?.toUpperCase().replace(/\./g, "-").split("-").slice(0, 2).join("-");
        if (carBase) {
          const features = await consultarSICAR(`sicar:sicar_imoveis_${ufDetectada}`, `cod_imovel ILIKE '${carBase}%'`);
          if (features.length > 0) return parsearFeatureSICAR(features[0], car, ccir, itr);
        }
      } catch {}
    }

    if (!car) {
      for (let i = 0; i < UFS_BR.length; i += 5) {
        const grupo = UFS_BR.slice(i, i + 5);
        const resultados = await Promise.allSettled(
          grupo.map(uf => consultarSICAR(`sicar:sicar_imoveis_${uf}`, filtro))
        );
        for (const r of resultados) {
          if (r.status === "fulfilled" && r.value.length > 0)
            return parsearFeatureSICAR(r.value[0], car, ccir, itr);
        }
      }
    }

    return { encontrado: false, mensagem: "Imóvel não localizado no SICAR." };
  } catch (e) {
    console.error("[SICAR ERROR]", e.message);
    return { encontrado: false, erro: e.message };
  }
}

function traduzirSituacao(cod) {
  return { AT: "Ativo", CA: "Cancelado", SU: "Suspenso", PE: "Pendente", AN: "Análise" }[cod] || cod || "Desconhecido";
}

async function buscarSIGEF({ car, ccir }) {
  const q = car || ccir;
  if (!q) return null;
  try {
    const url = `https://sigef.incra.gov.br/geo/parcela/exportar/geojson/?q=${encodeURIComponent(q)}`;
    const resp = await fetch(url, { headers: HEADERS_BR, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`SIGEF HTTP ${resp.status}`);
    const data = await resp.json();
    const features = data.features || [];
    if (features.length === 0) return { encontrado: false, certificado: false };
    const props = features[0].properties;
    const geom = features[0].geometry;
    let lat = null, lng = null;
    if (geom?.coordinates) {
      try {
        const coords = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
        const lats = coords.map(c => c[1]);
        const lngs = coords.map(c => c[0]);
        lat = (Math.min(...lats) + Math.max(...lats)) / 2;
        lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      } catch {}
    }
    return {
      encontrado: true,
      certificado: props.situacao === "CE",
      situacao: props.situacao,
      situacaoLabel: props.situacao === "CE" ? "Certificado" : props.situacao === "AT" ? "Em análise" : props.situacao || "Desconhecido",
      denominacao: props.denominacao,
      area: props.area_registrada ? `${Number(props.area_registrada).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null,
      municipio: props.municipio_localizado,
      uf: props.uf,
      ccir: props.numero_ccir || ccir || null,
      codigoIncra: props.codigo_imovel || null,
      geometria: geom,
      lat, lng,
    };
  } catch (e) {
    return { encontrado: false, certificado: false, erro: e.message };
  }
}

function calcularScore({ sicar, sigef, ibama = null, prodes = null }) {
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
    fatores.push({ label: "IBAMA pendente verificação", impacto: 0, cor: "#6b9e6b" });
  }
  if (prodes?.temAlerta) {
    const p = Math.min(prodes.totalAlertas * 10, 30);
    score -= p;
    fatores.push({ label: `${prodes.totalAlertas} alerta(s) PRODES`, impacto: -p, cor: "#f97316" });
  } else {
    fatores.push({ label: "PRODES pendente verificação", impacto: 0, cor: "#6b9e6b" });
  }
  if (sigef?.certificado) {
    fatores.push({ label: "SIGEF Certificado", impacto: 0, cor: "#22c55e" });
  } else if (sigef?.encontrado) {
    score -= 10;
    fatores.push({ label: "SIGEF não certificado", impacto: -10, cor: "#fbbf24" });
  }
  return {
    valor: Math.max(0, Math.min(100, score)),
    nivel: score >= 70 ? "Baixo Risco" : score >= 40 ? "Risco Médio" : "Alto Risco",
    cor: score >= 70 ? "#22c55e" : score >= 40 ? "#fbbf24" : "#ef4444",
    fatores,
  };
}