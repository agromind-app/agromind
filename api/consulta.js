import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { credential } from "firebase-admin";

export const config = { maxDuration: 30 };

const PROXY_URL = "https://agromind-proxy.agromindpro.workers.dev";
const CACHE_DIAS = 7;

// ─── FIREBASE ────────────────────────────────────────────────────
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

// ─── CACHE ───────────────────────────────────────────────────────
function chaveCache(body) {
  if (body.car)          return `car_${body.car.toUpperCase().replace(/[\s\.]/g, "")}`;
  if (body.ccir)         return `ccir_${body.ccir.replace(/[.\-\s]/g, "")}`;
  if (body.itr)          return `itr_${body.itr.replace(/[.\-\s]/g, "")}`;
  if (body.proprietario) return `prop_${body.proprietario.trim().toLowerCase().substring(0, 40)}`;
  if (body.nomeFazenda)  return `faz_${body.nomeFazenda.trim().toLowerCase().substring(0, 40)}`;
  if (body.lat && body.lng) return `gps_${Number(body.lat).toFixed(4)}_${Number(body.lng).toFixed(4)}`;
  return null;
}

async function lerCache(chave) {
  try {
    const db = getDB();
    const docRef = await db.collection("cache_car").doc(chave).get();
    if (!docRef.exists) return null;
    const data = docRef.data();
    const salvoEm = data.salvoEm?.toMillis?.() || 0;
    const diasPassados = (Date.now() - salvoEm) / (1000 * 60 * 60 * 24);
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

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body;
    const { car, lat, lng, ccir, itr, proprietario, nomeFazenda } = body;

    if (!car && !ccir && !itr && !proprietario && !nomeFazenda && (!lat || !lng)) {
      return res.status(400).json({ sucesso: false, error: "Informe CAR, CCIR, ITR, GPS ou outro critério." });
    }

    // Cache
    const chave = chaveCache(body);
    if (chave) {
      const cached = await lerCache(chave);
      if (cached) {
        console.log(`[CACHE HIT] ${chave}`);
        return res.status(200).json({ ...cached, fromCache: true });
      }
    }

    // Busca principal — SICAR + SIGEF em paralelo
    const [sicar, sigef] = await Promise.all([
      buscarSICAR(body),
      buscarSIGEF({ car, ccir }),
    ]);

    const coordLat = lat || sicar?.lat || sigef?.lat || null;
    const coordLng = lng || sicar?.lng || sigef?.lng || null;
    const carFinal = car || sicar?.car || null;

    const score = calcularScore({ sicar, sigef });

    const resultado = {
      sucesso: true,
      car: carFinal,
      coordenadas: { lat: coordLat, lng: coordLng },
      sicar,
      sigef,
      score,
      atualizadoEm: new Date().toISOString(),
    };

    if (chave && (sicar?.encontrado || sigef?.encontrado)) {
      await salvarCache(chave, resultado);
    }

    return res.status(200).json(resultado);

  } catch (error) {
    console.error("[CONSULTA ERROR]", error.message);
    return res.status(500).json({ sucesso: false, error: "Erro ao consultar. Tente novamente." });
  }
}

// ─── UTILS ───────────────────────────────────────────────────────
const UFS_BR = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe","pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to"];

const HEADERS_BR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "Origin": "https://www.car.gov.br",
  "Referer": "https://www.car.gov.br/publico/imoveis/index",
};

function traduzirSituacao(cod) {
  return { AT:"Ativo", CA:"Cancelado", SU:"Suspenso", PE:"Pendente", AN:"Análise" }[cod] || cod || "Desconhecido";
}

// Remove acentos e normaliza string para busca
function normalizarBusca(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Limpa CCIR para comparação (só números)
function limparCCIR(ccir) {
  return (ccir || "").replace(/[.\-\s\/]/g, "");
}

// Limpa ITR/NIRF para comparação
function limparITR(itr) {
  return (itr || "").replace(/[.\-\s\/]/g, "");
}

// ─── CONSULTA SICAR VIA PROXY ────────────────────────────────────
async function consultarSICARProxy(typeName, filtro, maxFeatures = 1) {
  const sicarUrl = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${typeName}&CQL_FILTER=${encodeURIComponent(filtro)}&outputFormat=application%2Fjson&maxFeatures=${maxFeatures}`;
  const resp = await fetch(`${PROXY_URL}?url=${encodeURIComponent(sicarUrl)}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`SICAR HTTP ${resp.status}`);
  const data = await resp.json();
  return data.features || [];
}

// ─── PARSEAR FEATURE SICAR ───────────────────────────────────────
function parsearFeatureSICAR(feat, overrides = {}) {
  const props = feat.properties || {};
  const geom  = feat.geometry;

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

  const fmt = (v) => v ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null;

  return {
    encontrado:    true,
    car:           props.cod_imovel   || overrides.car    || null,
    nome:          props.nom_imovel   || "Imóvel Rural",
    municipio:     props.nom_municipio || "",
    uf:            props.sig_uf        || "",
    area:          fmt(props.num_area),
    areaHa:        props.num_area ? Number(props.num_area) : null,
    situacao:      props.ind_status    || "AT",
    situacaoLabel: traduzirSituacao(props.ind_status),
    app:           fmt(props.num_area_app),
    rl:            fmt(props.num_area_rl),
    proprietario:  props.nom_proprietario || null,
    tipo:          props.des_tipo_imovel  || "Imóvel Rural",
    modulos:       props.num_modulos_fiscais
                     ? `${Number(props.num_modulos_fiscais).toFixed(1)} módulos fiscais`
                     : null,
    ccir:          props.num_ccir  || overrides.ccir || null,
    nirf:          props.num_nirf  || overrides.itr  || null,
    geometria:     geom,
    lat:           latC,
    lng:           lngC,
  };
}

// ─── BUSCA SICAR — ESTRATÉGIA EM CAMADAS ────────────────────────
async function buscarSICAR({ car, ccir, itr, proprietario, nomeFazenda, lat, lng }) {
  try {

    // ── 1. CAR → busca exata no estado detectado pelo prefixo
    if (car) {
      return await buscarSICARporCAR(car, ccir, itr);
    }

    // ── 2. CCIR → tenta campo num_ccir no SICAR
    if (ccir) {
      const resultado = await buscarSICARporCampo("num_ccir", limparCCIR(ccir), { ccir });
      if (resultado?.encontrado) return resultado;
      // Se não achou pelo campo, retorna não encontrado com mensagem
      return {
        encontrado: false,
        mensagem: "CCIR não localizado no SICAR. O campo está disponível apenas para imóveis com dados completos. Tente pelo CAR ou pelo nome da fazenda.",
        dica: "O CCIR completo pode ser consultado no SIGEF/INCRA em sigef.incra.gov.br",
      };
    }

    // ── 3. ITR/NIRF → tenta campo num_nirf no SICAR
    if (itr) {
      const resultado = await buscarSICARporCampo("num_nirf", limparITR(itr), { itr });
      if (resultado?.encontrado) return resultado;
      return {
        encontrado: false,
        mensagem: "ITR/NIRF não localizado no SICAR. O NIRF pode estar em branco para muitos imóveis.",
        dica: "Consulte diretamente na Receita Federal em receitafederal.gov.br com CPF/CNPJ do proprietário.",
      };
    }

    // ── 4. Nome da fazenda → busca com ILIKE, normalizado
    if (nomeFazenda) {
      return await buscarSICARporNome(nomeFazenda, ccir, itr);
    }

    // ── 5. Proprietário → busca com ILIKE no campo nom_proprietario
    if (proprietario) {
      return await buscarSICARporProprietario(proprietario);
    }

    // ── 6. GPS → busca por BBOX
    if (lat && lng) {
      return await buscarSICARporGPS(lat, lng);
    }

    return { encontrado: false, mensagem: "Critério de busca não reconhecido." };

  } catch (e) {
    console.error("[SICAR ERROR]", e.message);
    return { encontrado: false, erro: e.message };
  }
}

// ─── BUSCA POR CAR ───────────────────────────────────────────────
async function buscarSICARporCAR(car, ccir, itr) {
  const carNorm = car.toUpperCase().replace(/\./g, "-").trim();
  const match   = carNorm.match(/^([A-Z]{2})-/i);
  const uf      = match ? match[1].toLowerCase() : null;

  // Tentativa 1: código exato
  if (uf) {
    try {
      const features = await consultarSICARProxy(
        `sicar:sicar_imoveis_${uf}`,
        `cod_imovel = '${carNorm}'`
      );
      if (features.length > 0) return parsearFeatureSICAR(features[0], { car, ccir, itr });
    } catch {}
  }

  // Tentativa 2: ILIKE com prefixo (cobre variações de formatação)
  if (uf) {
    try {
      const prefixo = carNorm.split("-").slice(0, 2).join("-");
      const features = await consultarSICARProxy(
        `sicar:sicar_imoveis_${uf}`,
        `cod_imovel ILIKE '${prefixo}%'`
      );
      if (features.length > 0) return parsearFeatureSICAR(features[0], { car, ccir, itr });
    } catch {}
  }

  // Tentativa 3: sem UF → varredura em todos os estados (grupos de 5)
  if (!uf) {
    for (let i = 0; i < UFS_BR.length; i += 5) {
      const grupo = UFS_BR.slice(i, i + 5);
      const resultados = await Promise.allSettled(
        grupo.map(u => consultarSICARProxy(`sicar:sicar_imoveis_${u}`, `cod_imovel ILIKE '%${carNorm}%'`))
      );
      for (const r of resultados) {
        if (r.status === "fulfilled" && r.value.length > 0)
          return parsearFeatureSICAR(r.value[0], { car, ccir, itr });
      }
    }
  }

  return { encontrado: false, mensagem: "CAR não localizado no SICAR." };
}

// ─── BUSCA POR CAMPO GENÉRICO (CCIR ou ITR) ─────────────────────
async function buscarSICARporCampo(campo, valor, overrides = {}) {
  if (!valor || valor.length < 3) return { encontrado: false };

  const filtro = `${campo} = '${valor}'`;

  // Tenta em grupos de estados em paralelo
  for (let i = 0; i < UFS_BR.length; i += 6) {
    const grupo = UFS_BR.slice(i, i + 6);
    const resultados = await Promise.allSettled(
      grupo.map(uf => consultarSICARProxy(`sicar:sicar_imoveis_${uf}`, filtro))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], overrides);
    }
  }

  // Segunda tentativa: ILIKE (mais tolerante a formatação)
  const filtroLike = `${campo} ILIKE '%${valor}%'`;
  for (let i = 0; i < UFS_BR.length; i += 6) {
    const grupo = UFS_BR.slice(i, i + 6);
    const resultados = await Promise.allSettled(
      grupo.map(uf => consultarSICARProxy(`sicar:sicar_imoveis_${uf}`, filtroLike))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], overrides);
    }
  }

  return { encontrado: false };
}

// ─── BUSCA POR NOME DA FAZENDA ───────────────────────────────────
async function buscarSICARporNome(nomeFazenda, ccir, itr) {
  // Extrai UF e município se vier no formato "Nome - UF - Município"
  let ufDetectada = null;
  let municipioDetectado = null;
  let termoBase = nomeFazenda.trim();

  const partes = nomeFazenda.split("-").map(p => p.trim());
  if (partes.length >= 2) {
    const possUF = partes[partes.length >= 3 ? partes.length - 2 : 1].toUpperCase();
    if (possUF.length === 2 && UFS_BR.includes(possUF.toLowerCase())) {
      ufDetectada    = possUF.toLowerCase();
      termoBase      = partes[0].trim();
      municipioDetectado = partes.length >= 3 ? partes[partes.length - 1].trim() : null;
    }
  }

  // Normaliza para busca (remove acentos, caracteres especiais)
  const termoNorm = normalizarBusca(termoBase);

  // Remove palavras genéricas que confundem a busca
  const stopwords = ["FAZENDA", "SITIO", "SÍTIO", "CHACARA", "CHÁCARA", "PROPRIEDADE", "ESTANCIA", "ESTÂNCIA", "RANCHO", "GRANJA"];
  let termoBusca = termoNorm;
  stopwords.forEach(sw => { termoBusca = termoBusca.replace(new RegExp(`^${sw}\\s+`, "i"), "").trim(); });

  // Se o termo ficou muito curto após remover stopword, usa o original
  if (termoBusca.length < 3) termoBusca = termoNorm;

  // Constrói filtro com ILIKE
  let filtro = `nom_imovel ILIKE '%${termoBusca}%'`;
  if (municipioDetectado) {
    const munNorm = normalizarBusca(municipioDetectado);
    filtro += ` AND nom_municipio ILIKE '%${munNorm}%'`;
  }

  const estados = ufDetectada ? [ufDetectada] : UFS_BR;

  for (let i = 0; i < estados.length; i += 5) {
    const grupo = estados.slice(i, i + 5);
    const resultados = await Promise.allSettled(
      grupo.map(uf => consultarSICARProxy(`sicar:sicar_imoveis_${uf}`, filtro))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], { ccir, itr });
    }
  }

  // Segunda tentativa: termo mais curto (primeiras 2 palavras significativas)
  if (!ufDetectada && termoBusca.split(" ").length > 1) {
    const termoReduzido = termoBusca.split(" ").slice(0, 2).join(" ");
    const filtro2 = `nom_imovel ILIKE '%${termoReduzido}%'`;
    for (let i = 0; i < UFS_BR.length; i += 6) {
      const grupo = UFS_BR.slice(i, i + 6);
      const resultados = await Promise.allSettled(
        grupo.map(uf => consultarSICARProxy(`sicar:sicar_imoveis_${uf}`, filtro2))
      );
      for (const r of resultados) {
        if (r.status === "fulfilled" && r.value.length > 0)
          return parsearFeatureSICAR(r.value[0], { ccir, itr });
      }
    }
  }

  return {
    encontrado: false,
    mensagem: `Fazenda "${nomeFazenda}" não localizada. Tente incluir o estado: "Fazenda Nome - MT" ou use o código CAR.`,
    dica: "Busca por nome é mais eficiente quando inclui o estado: Ex: Fazenda Santa Maria - MT",
  };
}

// ─── BUSCA POR PROPRIETÁRIO ───────────────────────────────────────
async function buscarSICARporProprietario(proprietario) {
  // Extrai UF e município se vier no formato "Nome - UF - Município"
  let ufDetectada = null;
  let municipioDetectado = null;
  let termoBase = proprietario.trim();

  const partes = proprietario.split("-").map(p => p.trim());
  if (partes.length >= 2) {
    const possUF = partes[partes.length >= 3 ? partes.length - 2 : 1].toUpperCase();
    if (possUF.length === 2 && UFS_BR.includes(possUF.toLowerCase())) {
      ufDetectada       = possUF.toLowerCase();
      termoBase         = partes[0].trim();
      municipioDetectado = partes.length >= 3 ? partes[partes.length - 1].trim() : null;
    }
  }

  const termoNorm = normalizarBusca(termoBase);
  if (termoNorm.length < 3) {
    return { encontrado: false, mensagem: "Nome muito curto para buscar. Digite pelo menos 3 letras do nome." };
  }

  let filtro = `nom_proprietario ILIKE '%${termoNorm}%'`;
  if (municipioDetectado) {
    filtro += ` AND nom_municipio ILIKE '%${normalizarBusca(municipioDetectado)}%'`;
  }

  const estados = ufDetectada ? [ufDetectada] : UFS_BR;

  for (let i = 0; i < estados.length; i += 5) {
    const grupo = estados.slice(i, i + 5);
    const resultados = await Promise.allSettled(
      grupo.map(uf => consultarSICARProxy(`sicar:sicar_imoveis_${uf}`, filtro))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], {});
    }
  }

  // Segunda tentativa: só sobrenome (última palavra)
  const palavras = termoNorm.split(" ").filter(p => p.length > 3);
  if (palavras.length > 1) {
    const sobrenome = palavras[palavras.length - 1];
    const filtro2   = `nom_proprietario ILIKE '%${sobrenome}%'`;
    const ufsBusca  = ufDetectada ? [ufDetectada] : UFS_BR.slice(0, 10); // limita sem UF
    for (let i = 0; i < ufsBusca.length; i += 5) {
      const grupo = ufsBusca.slice(i, i + 5);
      const resultados = await Promise.allSettled(
        grupo.map(uf => consultarSICARProxy(`sicar:sicar_imoveis_${uf}`, filtro2))
      );
      for (const r of resultados) {
        if (r.status === "fulfilled" && r.value.length > 0)
          return parsearFeatureSICAR(r.value[0], {});
      }
    }
  }

  return {
    encontrado: false,
    mensagem: `Proprietário "${proprietario}" não localizado. O SICAR não exige nome do proprietário em todos os cadastros.`,
    dica: ufDetectada
      ? `Tente buscar pelo CAR ou nome da fazenda no estado ${ufDetectada.toUpperCase()}.`
      : 'Especifique o estado para busca mais rápida: "João Silva - MT"',
  };
}

// ─── BUSCA POR GPS ───────────────────────────────────────────────
async function buscarSICARporGPS(lat, lng) {
  // Detecta estado via Nominatim
  let ufDetectada = null;
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (resp.ok) {
      const data = await resp.json();
      const estado = data.address?.state_code || data.address?.["ISO3166-2-lvl4"] || "";
      const uf = estado.replace("BR-", "").toLowerCase().trim();
      if (UFS_BR.includes(uf)) ufDetectada = uf;

      if (!ufDetectada) {
        const mapaEstados = {
          "Maranhão":"ma","Mato Grosso":"mt","Pará":"pa","Bahia":"ba","Goiás":"go",
          "Minas Gerais":"mg","São Paulo":"sp","Paraná":"pr","Tocantins":"to",
          "Mato Grosso do Sul":"ms","Piauí":"pi","Rondônia":"ro","Amazonas":"am",
          "Roraima":"rr","Acre":"ac","Amapá":"ap","Rio de Janeiro":"rj",
          "Espírito Santo":"es","Santa Catarina":"sc","Rio Grande do Sul":"rs",
          "Paraíba":"pb","Pernambuco":"pe","Ceará":"ce","Rio Grande do Norte":"rn",
          "Alagoas":"al","Sergipe":"se","Distrito Federal":"df"
        };
        ufDetectada = mapaEstados[data.address?.state] || null;
      }
    }
  } catch {}

  const buffers = [0.009, 0.04, 0.09];
  const estados = ufDetectada ? [ufDetectada] : UFS_BR.slice(0, 5);

  for (const buffer of buffers) {
    const bbox = `${lng - buffer},${lat - buffer},${lng + buffer},${lat + buffer}`;
    for (const uf of estados) {
      try {
        const features = await consultarSICARProxy(
          `sicar:sicar_imoveis_${uf}`,
          `BBOX(geom,${bbox})`
        );
        if (features.length > 0) return parsearFeatureSICAR(features[0], {});
      } catch {}
    }
  }

  return { encontrado: false, mensagem: "Nenhum imóvel CAR encontrado nas coordenadas informadas." };
}

// ─── SIGEF/INCRA ─────────────────────────────────────────────────
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
    const geom  = features[0].geometry;
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
      encontrado:    true,
      certificado:   props.situacao === "CE",
      situacao:      props.situacao,
      situacaoLabel: props.situacao === "CE" ? "Certificado" : props.situacao === "AT" ? "Em análise" : props.situacao || "Desconhecido",
      denominacao:   props.denominacao,
      area:          props.area_registrada
                       ? `${Number(props.area_registrada).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha`
                       : null,
      municipio:     props.municipio_localizado,
      uf:            props.uf,
      ccir:          props.numero_ccir || ccir || null,
      codigoIncra:   props.codigo_imovel || null,
      geometria:     geom,
      lat, lng,
    };
  } catch (e) {
    return { encontrado: false, certificado: false, erro: e.message };
  }
}

// ─── SCORE ───────────────────────────────────────────────────────
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
    valor:  Math.max(0, Math.min(100, score)),
    nivel:  score >= 70 ? "Baixo Risco" : score >= 40 ? "Risco Médio" : "Alto Risco",
    cor:    score >= 70 ? "#22c55e" : score >= 40 ? "#fbbf24" : "#ef4444",
    fatores,
  };
}