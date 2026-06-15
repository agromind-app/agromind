import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { credential } from "firebase-admin";

export const config = { maxDuration: 30 };

const PROXY_URL = "https://agromind-proxy.agromindpro.workers.dev";
const DADOS_URL = "https://agromind-dados.agromindpro.workers.dev";
const CACHE_DIAS = 7;
const UFS_BR = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe","pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to"];

// ─── FIREBASE ────────────────────────────────────────────────────
function getAdmin() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({ credential: credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
function getDB() { getAdmin(); return getFirestore(); }

function norm(str) {
  if (!str) return "";
  return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]/g,"").toUpperCase().trim();
}

// ─── CACHE ───────────────────────────────────────────────────────
function chaveCache(body) {
  if (body.car)          return `car_${norm(body.car).substring(0,40)}`;
  if (body.ccir)         return `ccir_${norm(body.ccir)}`;
  if (body.itr)          return `itr_${norm(body.itr)}`;
  if (body.proprietario) return `prop_${norm(body.proprietario).substring(0,30)}`;
  if (body.nomeFazenda)  return `faz_${norm(body.nomeFazenda).substring(0,30)}`;
  if (body.lat && body.lng) return `gps_${Number(body.lat).toFixed(4)}_${Number(body.lng).toFixed(4)}`;
  return null;
}

async function lerCache(chave) {
  try {
    const snap = await getDB().collection("cache_car").doc(chave).get();
    if (!snap.exists) return null;
    const data = snap.data();
    const dias = (Date.now() - (data.salvoEm?.toMillis?.() || 0)) / 86400000;
    if (dias > CACHE_DIAS) return null;
    return data.resultado;
  } catch { return null; }
}

async function salvarCache(chave, resultado) {
  try { await getDB().collection("cache_car").doc(chave).set({ resultado, salvoEm: new Date(), chave }); } catch {}
}

// ─── BANCO DE CRUZAMENTO ─────────────────────────────────────────
async function salvarNoBancoCruzamento(dados) {
  try {
    const db = getDB();
    const carNorm = norm(dados.car || dados.sicar?.car || "");
    if (!carNorm) return;
    const registro = {
      car:          dados.car || dados.sicar?.car || null,
      ccir:         dados.sicar?.ccir || dados.sigef?.ccir || null,
      itr:          dados.sicar?.nirf || null,
      nome:         dados.sicar?.nome || dados.sigef?.denominacao || null,
      proprietario: dados.sicar?.proprietario || null,
      municipio:    dados.sicar?.municipio || dados.sigef?.municipio || null,
      uf:           dados.sicar?.uf || dados.sigef?.uf || null,
      area:         dados.sicar?.area || dados.sigef?.area || null,
      areaHa:       dados.sicar?.areaHa || null,
      modulos:      dados.sicar?.modulos || null,
      app:          dados.sicar?.app || null,
      rl:           dados.sicar?.rl || null,
      lat:          dados.coordenadas?.lat || null,
      lng:          dados.coordenadas?.lng || null,
      atualizadoEm: new Date(),
      fonte:        "consulta_auto",
    };
    const batch = db.batch();
    batch.set(db.collection("banco_imoveis").doc(carNorm), registro, { merge: true });
    if (registro.ccir)         batch.set(db.collection("indice_ccir").doc(norm(registro.ccir)), { car: registro.car, carNorm }, { merge: true });
    if (registro.itr)          batch.set(db.collection("indice_itr").doc(norm(registro.itr)), { car: registro.car, carNorm }, { merge: true });
    if (registro.nome)         batch.set(db.collection("indice_nome").doc(norm(registro.nome).substring(0,30)), { car: registro.car, carNorm, nome: registro.nome }, { merge: true });
    if (registro.proprietario) batch.set(db.collection("indice_proprietario").doc(norm(registro.proprietario).substring(0,30)), { car: registro.car, carNorm, proprietario: registro.proprietario }, { merge: true });
    await batch.commit();
  } catch (e) { console.log("[BANCO] erro:", e.message); }
}

async function buscarCARnoBanco(tipo, valor) {
  try {
    const db = getDB();
    const chave = norm(valor).substring(0, 30);
    const colMap = { ccir:"indice_ccir", itr:"indice_itr", nomeFazenda:"indice_nome", proprietario:"indice_proprietario" };
    const colecao = colMap[tipo];
    if (!colecao) return null;
    const snap = await db.collection(colecao).doc(chave).get();
    if (snap.exists) return snap.data().car;
    if (tipo === "nomeFazenda" || tipo === "proprietario") {
      const prefixo = chave.substring(0, 10);
      const q = await db.collection(colecao).where("__name__",">=",prefixo).where("__name__","<=",prefixo+"\uf8ff").limit(1).get();
      if (!q.empty) return q.docs[0].data().car;
    }
    return null;
  } catch { return null; }
}

async function buscarDadosBanco(carNorm) {
  try {
    const snap = await getDB().collection("banco_imoveis").doc(carNorm).get();
    return snap.exists ? snap.data() : null;
  } catch { return null; }
}

// ─── WORKER DE DADOS AVANÇADO ────────────────────────────────────
async function buscarDadosAvancados({ car, ccir, itr, lat, lng }) {
  try {
    const resp = await fetch(DADOS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ car, ccir, itr, lat, lng }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.sucesso) return null;
    return data.dados || null;
  } catch (e) {
    console.log("[DADOS_WORKER] erro:", e.message);
    return null;
  }
}


async function consultarSICARProxy(typeName, filtro) {
  const url = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${typeName}&CQL_FILTER=${encodeURIComponent(filtro)}&outputFormat=application%2Fjson&maxFeatures=1`;
  const resp = await fetch(`${PROXY_URL}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(22000) });
  if (!resp.ok) throw new Error(`SICAR HTTP ${resp.status}`);
  const data = await resp.json();
  return data.features || [];
}

// ─── API PÚBLICA SICAR — retorna mais dados ───────────────────────
async function buscarSICARPublico(car) {
  try {
    // Endpoint interno do SICAR público (mesmo que o site usa)
    const url = `https://consultapublica.car.gov.br/publico/imoveis/buscarImovelSimples?num_car=${encodeURIComponent(car)}`;
    const resp = await fetch(`${PROXY_URL}?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || data.error) return null;

    // Tenta outro endpoint que retorna CPF/nome do proprietário
    const url2 = `https://consultapublica.car.gov.br/publico/imoveis/buscarAnexos?id_imovel=${data.id_imovel || data.id || ""}`;
    let anexos = null;
    try {
      const r2 = await fetch(`${PROXY_URL}?url=${encodeURIComponent(url2)}`, { signal: AbortSignal.timeout(8000) });
      if (r2.ok) anexos = await r2.json();
    } catch {}

    return {
      idImovel:     data.id_imovel || data.id || null,
      nome:         data.nom_imovel || data.denominacao || null,
      proprietario: data.nom_proprietario || data.proprietario || anexos?.proprietario || null,
      ccir:         data.num_ccir || data.ccir || null,
      nirf:         data.num_nirf || data.nirf || null,
      municipio:    data.nom_municipio || null,
      uf:           data.sig_uf || null,
      area:         data.num_area ? `${Number(data.num_area).toLocaleString("pt-BR",{maximumFractionDigits:1})} ha` : null,
      situacao:     data.ind_status || data.situacao || null,
    };
  } catch { return null; }
}

// ─── SNCR/INCRA — dados do imóvel rural ──────────────────────────
async function buscarSNCR(car, ccir) {
  try {
    // SNCR endpoint público
    const termo = ccir || car;
    const url = `https://sncr.serpro.gov.br/sncr/publico/externo/consultarImovel.jsf?numCCIR=${encodeURIComponent(ccir || "")}`;
    // Tenta API REST do SNCR
    const url2 = `https://servicodados.ibge.gov.br/api/v1/localidades/estados`;
    // Por ora retorna null — SNCR não tem API pública REST acessível
    return null;
  } catch { return null; }
}

// ─── SIGEF/INCRA ─────────────────────────────────────────────────
async function buscarSIGEF({ car, ccir }) {
  const q = car || ccir;
  if (!q) return null;
  try {
    const resp = await fetch(
      `https://sigef.incra.gov.br/geo/parcela/exportar/geojson/?q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) throw new Error();
    const data = await resp.json();
    const features = data.features || [];
    if (!features.length) return { encontrado: false, certificado: false };
    const p = features[0].properties, geom = features[0].geometry;
    let lat = null, lng = null;
    if (geom?.coordinates) {
      try {
        const coords = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
        lat = (Math.min(...coords.map(c=>c[1])) + Math.max(...coords.map(c=>c[1]))) / 2;
        lng = (Math.min(...coords.map(c=>c[0])) + Math.max(...coords.map(c=>c[0]))) / 2;
      } catch {}
    }
    return {
      encontrado:    true,
      certificado:   p.situacao === "CE",
      situacaoLabel: p.situacao==="CE"?"Certificado":p.situacao==="AT"?"Em análise":p.situacao||"Desconhecido",
      denominacao:   p.denominacao,
      area:          p.area_registrada?`${Number(p.area_registrada).toLocaleString("pt-BR",{maximumFractionDigits:1})} ha`:null,
      municipio:     p.municipio_localizado,
      uf:            p.uf,
      ccir:          p.numero_ccir || ccir || null,
      codigoIncra:   p.codigo_imovel || null,
      proprietario:  p.detentores?.[0]?.nome || null,
      geometria:     geom, lat, lng,
    };
  } catch { return { encontrado: false, certificado: false }; }
}

function traduzirSituacao(cod) {
  return { AT:"Ativo", CA:"Cancelado", SU:"Suspenso", PE:"Pendente", AN:"Análise" }[cod] || cod || "Desconhecido";
}

function parsearFeature(feat, overrides = {}) {
  const p = feat.properties || {}, geom = feat.geometry;
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
    encontrado:    true,
    car:           p.cod_imovel || overrides.car || null,
    nome:          p.nom_imovel || "Imóvel Rural",
    municipio:     p.nom_municipio || "",
    uf:            p.sig_uf || "",
    area:          fmt(p.num_area),
    areaHa:        p.num_area ? Number(p.num_area) : null,
    situacao:      p.ind_status || "AT",
    situacaoLabel: traduzirSituacao(p.ind_status),
    app:           fmt(p.num_area_app),
    rl:            fmt(p.num_area_rl),
    proprietario:  p.nom_proprietario || null,
    modulos:       p.num_modulos_fiscais ? `${Number(p.num_modulos_fiscais).toFixed(1)} módulos fiscais` : null,
    ccir:          p.num_ccir || overrides.ccir || null,
    nirf:          p.num_nirf || overrides.itr || null,
    geometria:     geom, lat, lng,
  };
}

// ─── ENRIQUECER COM TODAS AS FONTES ──────────────────────────────
function enriquecerDados(sicar, sigef, sicarPublico, banco, extras = {}) {
  const base = sicar?.encontrado ? { ...sicar } : {};

  // Preenche campos vazios com dados do SIGEF
  if (sigef?.encontrado) {
    if (!base.nome || base.nome === "Imóvel Rural") base.nome = sigef.denominacao || base.nome;
    if (!base.ccir) base.ccir = sigef.ccir;
    if (!base.municipio) base.municipio = sigef.municipio;
    if (!base.uf) base.uf = sigef.uf;
    if (!base.area) base.area = sigef.area;
    if (!base.proprietario) base.proprietario = sigef.proprietario;
  }

  // Preenche com dados do SICAR público
  if (sicarPublico) {
    if (!base.nome || base.nome === "Imóvel Rural") base.nome = sicarPublico.nome || base.nome;
    if (!base.proprietario) base.proprietario = sicarPublico.proprietario;
    if (!base.ccir) base.ccir = sicarPublico.ccir;
    if (!base.nirf) base.nirf = sicarPublico.nirf;
    if (!base.municipio) base.municipio = sicarPublico.municipio;
  }

  // Preenche com dados do banco interno
  if (banco) {
    if (!base.nome || base.nome === "Imóvel Rural") base.nome = banco.nome || base.nome;
    if (!base.proprietario) base.proprietario = banco.proprietario;
    if (!base.ccir) base.ccir = banco.ccir || banco.ccirFormatado;
    if (!base.nirf) base.nirf = banco.itr;
    if (!base.municipio) base.municipio = banco.municipio;
    if (!base.area) base.area = banco.area;
  }

  // Extras passados diretamente
  if (!base.ccir) base.ccir = extras.ccir || null;
  if (!base.nirf) base.nirf = extras.itr || null;

  // Se não achou no SICAR mas tem dados do banco
  if (!sicar?.encontrado && banco?.car) {
    return {
      encontrado:    true,
      fonteBanco:    true,
      car:           banco.car,
      nome:          base.nome || banco.nome || "Imóvel Rural",
      municipio:     base.municipio || banco.municipio || "",
      uf:            base.uf || banco.uf || "",
      area:          base.area || banco.area || null,
      areaHa:        banco.areaHa || null,
      app:           banco.app || null,
      rl:            banco.rl || null,
      modulos:       banco.modulos || null,
      ccir:          base.ccir || null,
      nirf:          base.nirf || null,
      proprietario:  base.proprietario || null,
      lat:           banco.lat || null,
      lng:           banco.lng || null,
      situacao:      "AT",
      situacaoLabel: "Ativo",
    };
  }

  return base.encontrado ? base : sicar;
}

// ─── BUSCA SICAR ─────────────────────────────────────────────────
async function buscarSICAR({ car, ccir, itr, proprietario, nomeFazenda }) {
  try {
    if (car) {
      const carNorm = car.toUpperCase().replace(/\./g,"-").replace(/[^A-Z0-9\-]/g,"");
      const uf = carNorm.match(/^([A-Z]{2})-/i)?.[1]?.toLowerCase();
      if (uf) {
        try {
          const f = await consultarSICARProxy(`sicar:sicar_imoveis_${uf}`, `cod_imovel = '${carNorm}'`);
          if (f.length > 0) return parsearFeature(f[0], { car, ccir, itr });
        } catch {}
        try {
          const pre = carNorm.split("-").slice(0,2).join("-");
          const f = await consultarSICARProxy(`sicar:sicar_imoveis_${uf}`, `cod_imovel ILIKE '${pre}%'`);
          if (f.length > 0) return parsearFeature(f[0], { car, ccir, itr });
        } catch {}
      }
      return { encontrado: false };
    }
    if (ccir) {
      const v = ccir.replace(/[.\-\s]/g,"");
      for (let i = 0; i < UFS_BR.length; i += 6) {
        const res = await Promise.allSettled(UFS_BR.slice(i,i+6).map(uf => consultarSICARProxy(`sicar:sicar_imoveis_${uf}`,`num_ccir = '${v}'`)));
        for (const r of res) if (r.status==="fulfilled" && r.value.length>0) return parsearFeature(r.value[0], { ccir });
      }
      return { encontrado: false };
    }
    if (itr) {
      const v = itr.replace(/[.\-\s]/g,"");
      for (let i = 0; i < UFS_BR.length; i += 6) {
        const res = await Promise.allSettled(UFS_BR.slice(i,i+6).map(uf => consultarSICARProxy(`sicar:sicar_imoveis_${uf}`,`num_nirf = '${v}'`)));
        for (const r of res) if (r.status==="fulfilled" && r.value.length>0) return parsearFeature(r.value[0], { itr });
      }
      return { encontrado: false };
    }
    if (nomeFazenda) {
      const partes = nomeFazenda.split("-").map(p=>p.trim());
      let uf = null, termo = nomeFazenda.trim();
      if (partes.length >= 2) {
        const possUF = partes[partes.length-1].toUpperCase();
        if (possUF.length===2 && UFS_BR.includes(possUF.toLowerCase())) { uf = possUF.toLowerCase(); termo = partes.slice(0,-1).join("-").trim(); }
      }
      termo = termo.replace(/^(FAZENDA|SITIO|SÍTIO|CHACARA|RANCHO|GRANJA)\s+/i,"").trim();
      const estados = uf ? [uf] : UFS_BR;
      for (let i = 0; i < estados.length; i += 5) {
        const res = await Promise.allSettled(estados.slice(i,i+5).map(u => consultarSICARProxy(`sicar:sicar_imoveis_${u}`,`nom_imovel ILIKE '%${termo}%'`)));
        for (const r of res) if (r.status==="fulfilled" && r.value.length>0) return parsearFeature(r.value[0], {});
      }
      return { encontrado: false, dica: 'Tente: "Fazenda Nome - MA"' };
    }
    if (proprietario) {
      const partes = proprietario.split("-").map(p=>p.trim());
      let uf = null, termo = proprietario.trim();
      if (partes.length >= 2) {
        const possUF = partes[partes.length-1].toUpperCase();
        if (possUF.length===2 && UFS_BR.includes(possUF.toLowerCase())) { uf = possUF.toLowerCase(); termo = partes.slice(0,-1).join("-").trim(); }
      }
      const estados = uf ? [uf] : UFS_BR;
      for (let i = 0; i < estados.length; i += 5) {
        const res = await Promise.allSettled(estados.slice(i,i+5).map(u => consultarSICARProxy(`sicar:sicar_imoveis_${u}`,`nom_proprietario ILIKE '%${termo}%'`)));
        for (const r of res) if (r.status==="fulfilled" && r.value.length>0) return parsearFeature(r.value[0], {});
      }
      return { encontrado: false, dica: 'Tente: "Nome - MA"' };
    }
    return { encontrado: false };
  } catch (e) { return { encontrado: false, erro: e.message }; }
}

// ─── SCORE ───────────────────────────────────────────────────────
function calcularScore({ sicar, sigef, ibama=null, prodes=null }) {
  let score = 100; const fatores = [];
  if (!sicar?.encontrado) { score-=30; fatores.push({label:"CAR não localizado",impacto:-30,cor:"#ef4444"}); }
  else if (sicar?.situacao!=="AT") { score-=20; fatores.push({label:`CAR ${sicar.situacaoLabel}`,impacto:-20,cor:"#fbbf24"}); }
  else { fatores.push({label:"CAR Ativo e Regular",impacto:0,cor:"#22c55e"}); }
  if (ibama?.temEmbargo) { const p=Math.min(ibama.totalEmbargos*15,40); score-=p; fatores.push({label:`${ibama.totalEmbargos} embargo(s) IBAMA`,impacto:-p,cor:"#ef4444"}); }
  else { fatores.push({label:"IBAMA pendente verificação",impacto:0,cor:"#6b9e6b"}); }
  if (prodes?.temAlerta) { const p=Math.min(prodes.totalAlertas*10,30); score-=p; fatores.push({label:`${prodes.totalAlertas} alerta(s) PRODES`,impacto:-p,cor:"#f97316"}); }
  else { fatores.push({label:"PRODES pendente verificação",impacto:0,cor:"#6b9e6b"}); }
  if (sigef?.certificado) { fatores.push({label:"SIGEF Certificado",impacto:0,cor:"#22c55e"}); }
  else if (sigef?.encontrado) { score-=10; fatores.push({label:"SIGEF não certificado",impacto:-10,cor:"#fbbf24"}); }
  return { valor:Math.max(0,Math.min(100,score)), nivel:score>=70?"Baixo Risco":score>=40?"Risco Médio":"Alto Risco", cor:score>=70?"#22c55e":score>=40?"#fbbf24":"#ef4444", fatores };
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
      if (cached) return res.status(200).json({ ...cached, fromCache: true });
    }

    // ── Resolve CAR pelo banco interno (CCIR/ITR/Nome/Proprietário) ──
    let carFinal = car ? car.toUpperCase().replace(/\./g,"-").replace(/[^A-Z0-9\-]/g,"") : null;
    let dadosBanco = null;
    let cruzamento = null;

    if (!carFinal && (ccir || itr || nomeFazenda || proprietario)) {
      const tipo  = ccir ? "ccir" : itr ? "itr" : nomeFazenda ? "nomeFazenda" : "proprietario";
      const valor = ccir || itr || nomeFazenda || proprietario || "";
      const carEncontrado = await buscarCARnoBanco(tipo, valor);
      if (carEncontrado) {
        carFinal = carEncontrado.toUpperCase().replace(/\./g,"-").replace(/[^A-Z0-9\-]/g,"");
        dadosBanco = await buscarDadosBanco(norm(carEncontrado));
        cruzamento = { encontrado: true, via: tipo };
      }
    }

    // ── Busca em paralelo: SICAR + SIGEF + Worker Avançado ───────
    const [sicar, sigef, dadosAvancados] = await Promise.all([
      buscarSICAR({ car: carFinal, ccir, itr, proprietario, nomeFazenda }),
      buscarSIGEF({ car: carFinal, ccir }),
      buscarDadosAvancados({ car: carFinal, ccir, itr, lat, lng }),
    ]);

    // Banco do CAR encontrado pelo SICAR
    if (!dadosBanco && (sicar?.car || carFinal)) {
      const carParaBusca = sicar?.car || carFinal;
      dadosBanco = await buscarDadosBanco(norm(carParaBusca));
    }

    // ── Enriquece com todas as fontes ─────────────────────────────
    // Usa dados avançados do Worker como fonte extra
    const sicarPublico = dadosAvancados ? {
      fonte: "WORKER_AVANCADO",
      nome:         dadosAvancados.nome        || null,
      proprietario: dadosAvancados.proprietario || null,
      ccir:         dadosAvancados.ccir         || null,
      nirf:         dadosAvancados.nirf         || null,
      municipio:    dadosAvancados.municipio    || null,
      uf:           dadosAvancados.uf           || null,
      area:         dadosAvancados.area         || null,
      modulos:      dadosAvancados.modulos      || null,
      app:          dadosAvancados.app          || null,
      rl:           dadosAvancados.rl           || null,
    } : null;

    const sicarFinal = enriquecerDados(sicar, sigef, sicarPublico, dadosBanco, { ccir, itr });

    const coordLat = lat || sicarFinal?.lat || sigef?.lat || dadosBanco?.lat || null;
    const coordLng = lng || sicarFinal?.lng || sigef?.lng || dadosBanco?.lng || null;
    const carRetorno = carFinal || sicarFinal?.car || null;

    const score = calcularScore({ sicar: sicarFinal, sigef });

    const resultado = {
      sucesso:      true,
      car:          carRetorno,
      coordenadas:  { lat: coordLat, lng: coordLng },
      sicar:        sicarFinal,
      sigef,
      score,
      cruzamento,
      fontes: {
        sicar:        sicar?.encontrado || false,
        sigef:        sigef?.encontrado || false,
        sicarPublico: !!sicarPublico,
        banco:        !!dadosBanco,
      },
      atualizadoEm: new Date().toISOString(),
    };

    // Salva cache e banco
    if (chave && (sicarFinal?.encontrado || sigef?.encontrado)) {
      await salvarCache(chave, resultado);
    }
    if (sicarFinal?.encontrado || sigef?.encontrado) {
      await salvarNoBancoCruzamento(resultado);
    }

    return res.status(200).json(resultado);

  } catch (error) {
    console.error("[CONSULTA ERROR]", error.message);
    return res.status(500).json({ sucesso: false, error: "Erro ao consultar. Tente novamente." });
  }
}