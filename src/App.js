import { useState, useEffect, useCallback, useRef } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "firebase/auth";
import { doc, onSnapshot, getDoc, setDoc, updateDoc, increment, serverTimestamp, collection, addDoc, query, orderBy, limit, getDocs } from "firebase/firestore";
import MapaPage from "./mapapage";

const C={bg:"#0a0f0a",surface:"#0f1a0f",card:"#111d11",border:"#1e3a1e",borderLight:"#2a4f2a",green1:"#0d5c2e",green2:"#12803f",green3:"#16a34a",accent:"#22c55e",accentBright:"#4ade80",text:"#e8f5e9",textMuted:"#6b9e6b",textDim:"#3d6b3d",yellow:"#fbbf24",red:"#ef4444",orange:"#f97316",blue:"#3b82f6",purple:"#a78bfa"};
const S={app:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"},chip:(c)=>({display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:`${c}20`,color:c,border:`1px solid ${c}30`}),card:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px"},chartBar:(p,c)=>({height:"100%",width:`${p}%`,background:`linear-gradient(90deg,${c}80,${c})`,borderRadius:3}),scoreRing:{width:110,height:110,borderRadius:"50%",background:`conic-gradient(${C.accent} 0deg,${C.accent} ${0.78*360}deg,${C.border} ${0.78*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"},scoreInner:{width:82,height:82,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"},precipBar:{display:"flex",alignItems:"flex-end",gap:3,height:70,marginBottom:6},precipCol:(h)=>({flex:1,height:`${h}%`,background:`linear-gradient(180deg,${C.blue}90,${C.blue}40)`,borderRadius:"3px 3px 0 0",minHeight:3}),tableTh:{padding:"10px",fontSize:10,fontWeight:700,color:C.textMuted,letterSpacing:"0.5px",textTransform:"uppercase",textAlign:"left"},tableTd:{padding:"10px",fontSize:12,borderBottom:`1px solid ${C.border}`,color:C.text}};

// ─── CRUZAMENTO FIRESTORE (frontend — instantâneo) ───────────────
function normChave(str) {
  if (!str) return "";
  return str.toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase().trim();
}

async function buscarCARnoFirestore(tipo, valor) {
  try {
    const colMap = {
      ccir:         "indice_ccir",
      itr:          "indice_itr",
      nomeFazenda:  "indice_nome",
      proprietario: "indice_proprietario",
    };
    const colecao = colMap[tipo];
    if (!colecao) return null;

    // Tenta várias normalizações
    const chaves = [
      normChave(valor).substring(0, 30),
      valor.replace(/[.\-\s\/]/g, "").substring(0, 30),
    ];
    for (const chave of chaves) {
      try {
        const snap = await getDoc(doc(db, colecao, chave));
        if (snap.exists()) { console.log("[FIRESTORE] achou chave:", chave); return snap.data().car; }
      } catch {}
    }

    // Fallback: varre todos os docs
    try {
      const todos = await getDocs(collection(db, colecao));
      for (const d of todos.docs) {
        const dd = d.data();
        if (tipo === "ccir" || tipo === "itr") {
          const vl = valor.replace(/[.\-\s]/g, "");
          if (d.id === vl || (dd.ccir || "").replace(/[.\-\s]/g,"") === vl) { console.log("[FIRESTORE] achou varredura:", d.id); return dd.car; }
        }
        if (tipo === "nomeFazenda") {
          const t = normChave(valor.replace(/^(FAZENDA|SITIO|SÍTIO)\s+/i,"")).substring(0,12);
          if (normChave(dd.nome||"").includes(t)||d.id.includes(t)) return dd.car;
        }
        if (tipo === "proprietario") {
          const t = normChave(valor).substring(0,12);
          if (normChave(dd.proprietario||"").includes(t)||d.id.includes(t)) return dd.car;
        }
      }
    } catch(e){ console.log("[FIRESTORE] varredura erro:",e.message); }

    return null;
  } catch(e){ console.log("[FIRESTORE] erro:",e.message); return null; }
}


async function buscarDadosFirestore(car) {
  try {
    const chave = normChave(car);
    const snap = await getDoc(doc(db, "banco_imoveis", chave));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// ─── CONSTANTES ───────────────────────────────────────────────────
const PROXY_URL = "https://agromind-proxy.agromindpro.workers.dev";
const UFS_BR = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe","pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to"];

// ─── UTILS ────────────────────────────────────────────────────────
function limparMarkdown(t){if(!t)return t;return t.replace(/\*\*(.+?)\*\*/g,"$1").replace(/\*(.+?)\*/g,"$1").replace(/#{1,6}\s+/g,"").replace(/`(.+?)`/g,"$1").trim();}

function normalizarBusca(str) {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9\s]/g," ").replace(/\s+/g," ").trim().toUpperCase();
}

function traduzirSituacao(cod) {
  return {AT:"Ativo",CA:"Cancelado",SU:"Suspenso",PE:"Pendente",AN:"Análise"}[cod] || cod || "Desconhecido";
}

// ─── FIRESTORE ────────────────────────────────────────────────────
async function salvarConsultaFS(uid,dados){try{await addDoc(collection(db,"usuarios",uid,"historico"),{nome:dados.sicar?.nome||dados.car||"Imóvel Rural",car:dados.car||dados.sicar?.car||"—",municipio:dados.sicar?.municipio?`${dados.sicar.municipio}/${dados.sicar.uf}`:"—",status:dados.ibama?.temEmbargo?"embargo":dados.prodes?.temAlerta?"alerta":"ok",score:dados.score?.valor??0,dadosCompletos:JSON.stringify(dados),criadoEm:serverTimestamp()});}catch(e){}}
async function buscarHistoricoFS(uid,qtd=5){try{const q=query(collection(db,"usuarios",uid,"historico"),orderBy("criadoEm","desc"),limit(qtd));const snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()}));}catch{return[];}}

// ─── SICAR — CONSULTA VIA PROXY ──────────────────────────────────
async function consultarSICARFrontend(typeName, filtro) {
  const sicarUrl = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${typeName}&CQL_FILTER=${encodeURIComponent(filtro)}&outputFormat=application%2Fjson&maxFeatures=1`;
  const resp = await fetch(`${PROXY_URL}?url=${encodeURIComponent(sicarUrl)}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`SICAR HTTP ${resp.status}`);
  const data = await resp.json();
  return data.features || [];
}

// ─── SICAR — PARSEAR FEATURE ──────────────────────────────────────
function parsearFeatureSICAR(feat, overrides = {}) {
  const props = feat.properties || {};
  const geom  = feat.geometry;
  let latC = null, lngC = null;
  if (geom) {
    try {
      const coords = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
      const lats = coords.map(c => c[1]), lngs = coords.map(c => c[0]);
      latC = (Math.min(...lats) + Math.max(...lats)) / 2;
      lngC = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    } catch {}
  }
  const fmt = (v) => v ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null;
  return {
    encontrado:    true,
    car:           props.cod_imovel        || overrides.car  || null,
    nome:          props.nom_imovel        || "Imóvel Rural",
    municipio:     props.nom_municipio     || "",
    uf:            props.sig_uf            || "",
    area:          fmt(props.num_area),
    areaHa:        props.num_area ? Number(props.num_area) : null,
    situacao:      props.ind_status        || "AT",
    situacaoLabel: traduzirSituacao(props.ind_status),
    condicao:      props.condicao          || null,
    app:           fmt(props.num_area_app),
    rl:            fmt(props.num_area_rl),
    proprietario:  props.nom_proprietario  || null,
    tipo:          props.des_tipo_imovel   || "Imóvel Rural",
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

// ─── BUSCA POR CAR ────────────────────────────────────────────────
async function buscarSICARporCAR(car, ccir, itr) {
  const carNorm = car.toUpperCase().replace(/\./g, "-").trim();
  const match   = carNorm.match(/^([A-Z]{2})-/i);
  const uf      = match ? match[1].toLowerCase() : null;

  if (uf) {
    // Tentativa 1: código exato
    try {
      const features = await consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, `cod_imovel = '${carNorm}'`);
      if (features.length > 0) return parsearFeatureSICAR(features[0], { car, ccir, itr });
    } catch {}
    // Tentativa 2: prefixo ILIKE
    try {
      const prefixo = carNorm.split("-").slice(0, 2).join("-");
      const features = await consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, `cod_imovel ILIKE '${prefixo}%'`);
      if (features.length > 0) return parsearFeatureSICAR(features[0], { car, ccir, itr });
    } catch {}
    return { encontrado: false, mensagem: `CAR não localizado no SICAR (${uf.toUpperCase()}).` };
  }

  // Sem UF — varre todos os estados
  for (let i = 0; i < UFS_BR.length; i += 5) {
    const grupo = UFS_BR.slice(i, i + 5);
    const resultados = await Promise.allSettled(
      grupo.map(u => consultarSICARFrontend(`sicar:sicar_imoveis_${u}`, `cod_imovel ILIKE '%${carNorm}%'`))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], { car, ccir, itr });
    }
  }
  return { encontrado: false, mensagem: "CAR não localizado no SICAR." };
}

// ─── BUSCA POR CAMPO GENÉRICO (CCIR / ITR) ───────────────────────
async function buscarSICARporCampo(campo, valor, overrides = {}) {
  if (!valor || valor.length < 3) return { encontrado: false };
  const valorLimpo = valor.replace(/[.\-\s\/]/g, "");

  // Tenta exato primeiro
  for (let i = 0; i < UFS_BR.length; i += 6) {
    const grupo = UFS_BR.slice(i, i + 6);
    const resultados = await Promise.allSettled(
      grupo.map(uf => consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, `${campo} = '${valorLimpo}'`))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], overrides);
    }
  }
  // Tenta ILIKE (mais tolerante)
  for (let i = 0; i < UFS_BR.length; i += 6) {
    const grupo = UFS_BR.slice(i, i + 6);
    const resultados = await Promise.allSettled(
      grupo.map(uf => consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, `${campo} ILIKE '%${valorLimpo}%'`))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], overrides);
    }
  }
  return { encontrado: false };
}

// ─── BUSCA POR NOME DA FAZENDA ────────────────────────────────────
async function buscarSICARporNome(nomeFazenda, ccir, itr) {
  let ufDetectada = null, municipioDetectado = null, termoBase = nomeFazenda.trim();
  const partes = nomeFazenda.split("-").map(p => p.trim());
  if (partes.length >= 2) {
    const possUF = partes[partes.length >= 3 ? partes.length - 2 : 1].toUpperCase();
    if (possUF.length === 2 && UFS_BR.includes(possUF.toLowerCase())) {
      ufDetectada = possUF.toLowerCase();
      termoBase = partes[0].trim();
      municipioDetectado = partes.length >= 3 ? partes[partes.length - 1].trim() : null;
    }
  }

  let termoBusca = normalizarBusca(termoBase);
  const stopwords = ["FAZENDA","SITIO","SÍTIO","CHACARA","CHÁCARA","PROPRIEDADE","ESTANCIA","ESTÂNCIA","RANCHO","GRANJA"];
  stopwords.forEach(sw => { termoBusca = termoBusca.replace(new RegExp(`^${sw}\\s+`,"i"), "").trim(); });
  if (termoBusca.length < 3) termoBusca = normalizarBusca(termoBase);

  let filtro = `nom_imovel ILIKE '%${termoBusca}%'`;
  if (municipioDetectado) filtro += ` AND nom_municipio ILIKE '%${normalizarBusca(municipioDetectado)}%'`;

  const estados = ufDetectada ? [ufDetectada] : UFS_BR;
  for (let i = 0; i < estados.length; i += 5) {
    const grupo = estados.slice(i, i + 5);
    const resultados = await Promise.allSettled(
      grupo.map(uf => consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, filtro))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], { ccir, itr });
    }
  }

  // Segunda tentativa: só primeiras 2 palavras
  if (!ufDetectada && termoBusca.split(" ").length > 1) {
    const termoReduzido = termoBusca.split(" ").slice(0, 2).join(" ");
    for (let i = 0; i < UFS_BR.length; i += 6) {
      const grupo = UFS_BR.slice(i, i + 6);
      const resultados = await Promise.allSettled(
        grupo.map(uf => consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, `nom_imovel ILIKE '%${termoReduzido}%'`))
      );
      for (const r of resultados) {
        if (r.status === "fulfilled" && r.value.length > 0)
          return parsearFeatureSICAR(r.value[0], { ccir, itr });
      }
    }
  }

  return {
    encontrado: false,
    mensagem: `Fazenda "${nomeFazenda}" não localizada.`,
    dica: 'Tente incluir o estado: "Fazenda Nome - MT" ou use o CAR.',
  };
}

// ─── BUSCA POR PROPRIETÁRIO ───────────────────────────────────────
async function buscarSICARporProprietario(proprietario) {
  let ufDetectada = null, municipioDetectado = null, termoBase = proprietario.trim();
  const partes = proprietario.split("-").map(p => p.trim());
  if (partes.length >= 2) {
    const possUF = partes[partes.length >= 3 ? partes.length - 2 : 1].toUpperCase();
    if (possUF.length === 2 && UFS_BR.includes(possUF.toLowerCase())) {
      ufDetectada = possUF.toLowerCase();
      termoBase = partes[0].trim();
      municipioDetectado = partes.length >= 3 ? partes[partes.length - 1].trim() : null;
    }
  }

  const termoNorm = normalizarBusca(termoBase);
  if (termoNorm.length < 3) return { encontrado: false, mensagem: "Nome muito curto. Digite pelo menos 3 letras." };

  let filtro = `nom_proprietario ILIKE '%${termoNorm}%'`;
  if (municipioDetectado) filtro += ` AND nom_municipio ILIKE '%${normalizarBusca(municipioDetectado)}%'`;

  const estados = ufDetectada ? [ufDetectada] : UFS_BR;
  for (let i = 0; i < estados.length; i += 5) {
    const grupo = estados.slice(i, i + 5);
    const resultados = await Promise.allSettled(
      grupo.map(uf => consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, filtro))
    );
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value.length > 0)
        return parsearFeatureSICAR(r.value[0], {});
    }
  }

  // Segunda tentativa: só sobrenome
  const palavras = termoNorm.split(" ").filter(p => p.length > 3);
  if (palavras.length > 1) {
    const sobrenome = palavras[palavras.length - 1];
    const ufsBusca = ufDetectada ? [ufDetectada] : UFS_BR.slice(0, 10);
    for (let i = 0; i < ufsBusca.length; i += 5) {
      const grupo = ufsBusca.slice(i, i + 5);
      const resultados = await Promise.allSettled(
        grupo.map(uf => consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, `nom_proprietario ILIKE '%${sobrenome}%'`))
      );
      for (const r of resultados) {
        if (r.status === "fulfilled" && r.value.length > 0)
          return parsearFeatureSICAR(r.value[0], {});
      }
    }
  }

  return {
    encontrado: false,
    mensagem: `Proprietário "${proprietario}" não localizado no SICAR.`,
    dica: ufDetectada
      ? `Tente pelo CAR ou nome da fazenda em ${ufDetectada.toUpperCase()}.`
      : 'Especifique o estado: "João Silva - MT"',
  };
}

// ─── BUSCA POR GPS ────────────────────────────────────────────────
async function detectarEstadoPorGPS(lat, lng) {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const estado = data.address?.state_code || data.address?.["ISO3166-2-lvl4"];
    if (estado) {
      const uf = estado.replace("BR-", "").toLowerCase().trim();
      if (UFS_BR.includes(uf)) return uf;
    }
    const mapaEstados = {
      "Maranhão":"ma","Mato Grosso":"mt","Pará":"pa","Bahia":"ba","Goiás":"go",
      "Minas Gerais":"mg","São Paulo":"sp","Paraná":"pr","Tocantins":"to",
      "Mato Grosso do Sul":"ms","Piauí":"pi","Rondônia":"ro","Amazonas":"am",
      "Roraima":"rr","Acre":"ac","Amapá":"ap","Rio de Janeiro":"rj",
      "Espírito Santo":"es","Santa Catarina":"sc","Rio Grande do Sul":"rs",
      "Paraíba":"pb","Pernambuco":"pe","Ceará":"ce","Rio Grande do Norte":"rn",
      "Alagoas":"al","Sergipe":"se","Distrito Federal":"df"
    };
    return mapaEstados[data.address?.state] || null;
  } catch { return null; }
}

async function buscarSICARPorGPS(lat, lng) {
  const uf = await detectarEstadoPorGPS(lat, lng);
  if (!uf) return { encontrado: false, mensagem: "Estado não detectado pelo GPS." };
  const buffers = [0.009, 0.04, 0.09];
  for (const buffer of buffers) {
    const bbox = `${lng - buffer},${lat - buffer},${lng + buffer},${lat + buffer}`;
    try {
      const features = await consultarSICARFrontend(`sicar:sicar_imoveis_${uf}`, `BBOX(geom,${bbox})`);
      if (features.length > 0) return parsearFeatureSICAR(features[0], {});
    } catch {}
  }
  return { encontrado: false, mensagem: `Nenhum imóvel CAR encontrado em ${uf.toUpperCase()}.` };
}

// ─── SICAR FRONTEND — ROTEADOR PRINCIPAL ─────────────────────────
async function buscarSICARFrontend({ car, ccir, itr, proprietario, nomeFazenda }) {
  try {
    if (car)           return await buscarSICARporCAR(car, ccir, itr);
    if (ccir) {
      const r = await buscarSICARporCampo("num_ccir", ccir, { ccir });
      if (r?.encontrado) return r;
      return { encontrado: false, mensagem: "CCIR não localizado no SICAR. O campo pode estar em branco para este imóvel.", dica: "Tente buscar pelo CAR ou nome da fazenda." };
    }
    if (itr) {
      const r = await buscarSICARporCampo("num_nirf", itr, { itr });
      if (r?.encontrado) return r;
      return { encontrado: false, mensagem: "ITR/NIRF não localizado no SICAR.", dica: "Consulte na Receita Federal com CPF/CNPJ do proprietário." };
    }
    if (nomeFazenda)   return await buscarSICARporNome(nomeFazenda, ccir, itr);
    if (proprietario)  return await buscarSICARporProprietario(proprietario);
    return null;
  } catch (e) { return { encontrado: false, erro: e.message }; }
}

// ─── SIGEF/INCRA FRONTEND ─────────────────────────────────────────
async function buscarSIGEFFrontend({ car, ccir }) {
  const q = car || ccir;
  if (!q) return null;
  try {
    const resp = await fetch(
      `https://sigef.incra.gov.br/geo/parcela/exportar/geojson/?q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(8000) }
    );
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
        const lats = coords.map(c => c[1]), lngs = coords.map(c => c[0]);
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
      area:          props.area_registrada ? `${Number(props.area_registrada).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : null,
      municipio:     props.municipio_localizado,
      uf:            props.uf,
      ccir:          props.numero_ccir || ccir || null,
      codigoIncra:   props.codigo_imovel || null,
      geometria:     geom,
      lat, lng,
    };
  } catch { return { encontrado: false, certificado: false }; }
}

// ─── APIs EXTRAS NO FRONTEND ──────────────────────────────────────
async function buscarIBAMAFrontend(car){
  if(!car)return{encontrado:false,temEmbargo:false,totalEmbargos:0,embargos:[]};
  try{
    const resp=await fetch(`https://servicos.ibama.gov.br/phpesp/public/embargo/consultarEmbargoPublico.php?num_car=${encodeURIComponent(car)}&formato=json`,{signal:AbortSignal.timeout(8000)});
    if(!resp.ok)throw new Error();
    const data=await resp.json();
    const embargos=Array.isArray(data)?data:(data.data||data.result||[]);
    return{encontrado:true,temEmbargo:embargos.length>0,totalEmbargos:embargos.length,embargos:embargos.slice(0,5).map(e=>({numero:e.num_auto_infracao||e.numero,data:e.dat_embargo||e.data,tipo:e.des_tipo_infracao||e.tipo,area:e.num_area_embargada?`${e.num_area_embargada} ha`:null,status:e.des_situacao||"Ativo",municipio:e.nom_municipio,uf:e.sig_uf}))};
  }catch{return{encontrado:false,temEmbargo:false,totalEmbargos:0,embargos:[]};}
}

async function buscarPRODESFrontend(lat,lng){
  if(!lat||!lng)return{encontrado:false,temAlerta:false,totalAlertas:0,alertas:[]};
  try{
    const buffer=0.05,bbox=`${lng-buffer},${lat-buffer},${lng+buffer},${lat+buffer}`;
    const resp=await fetch(`https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=deter-amz:deter_public&CQL_FILTER=BBOX(geom,${bbox})&outputFormat=application/json&maxFeatures=10`,{signal:AbortSignal.timeout(8000)});
    if(!resp.ok)throw new Error();
    const data=await resp.json();
    const alertas=data.features||[];
    const areaTotal=alertas.reduce((acc,f)=>acc+(f.properties?.areakm2||0),0);
    return{encontrado:true,temAlerta:alertas.length>0,totalAlertas:alertas.length,areaDesmatadaKm2:Number(areaTotal.toFixed(2)),alertas:alertas.slice(0,5).map(f=>({classname:f.properties?.classname||"Desmatamento",data:f.properties?.view_date,areaKm2:f.properties?.areakm2,municipio:f.properties?.municipio,uf:f.properties?.uf}))};
  }catch{return{encontrado:false,temAlerta:false,totalAlertas:0,alertas:[]};}
}

async function buscarClimaFrontend(lat,lng){
  if(!lat||!lng)return{encontrado:false};
  try{
    const resp=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo&forecast_days=7&past_days=30`,{signal:AbortSignal.timeout(8000)});
    if(!resp.ok)throw new Error();
    const data=await resp.json();
    const curr=data.current||{},daily=data.daily||{};
    const precipDiaria=(daily.precipitation_sum||[]).slice(-30);
    const precipTotal30d=precipDiaria.reduce((a,b)=>a+(b||0),0);
    const desc=(code)=>{if(code===0)return"☀️ Céu limpo";if(code<=3)return"🌤️ Nublado";if(code<=67)return"🌧️ Chuva";if(code<=99)return"⛈️ Tempestade";return"🌡️ --";};
    return{encontrado:true,atual:{temperatura:curr.temperature_2m,umidade:curr.relative_humidity_2m,vento:curr.wind_speed_10m,precipitacao:curr.precipitation,descricao:desc(curr.weather_code)},previsao7dias:(daily.time||[]).slice(-7).map((d,i)=>({data:d,dataFormatada:new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}),tempMax:daily.temperature_2m_max?.[i],tempMin:daily.temperature_2m_min?.[i],chuva:daily.precipitation_sum?.[i]||0})),precipitacao30d:precipDiaria,precipTotal30d:Number(precipTotal30d.toFixed(1))};
  }catch{return{encontrado:false};}
}

async function buscarNASAFrontend(lat,lng){
  if(!lat||!lng)return{encontrado:false};
  try{
    const hoje=new Date(),fim=hoje.toISOString().slice(0,10).replace(/-/g,"");
    const inicio=new Date(hoje-30*24*60*60*1000).toISOString().slice(0,10).replace(/-/g,"");
    const resp=await fetch(`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN,T2M,PRECTOTCORR,RH2M,WS2M&community=AG&longitude=${lng}&latitude=${lat}&start=${inicio}&end=${fim}&format=JSON`,{signal:AbortSignal.timeout(12000)});
    if(!resp.ok)throw new Error();
    const data=await resp.json();
    const prop=data.properties?.parameter||{};
    const datas=Object.keys(prop.T2M||{}).slice(-7);
    const media=(obj)=>{const vals=datas.map(d=>obj[d]).filter(v=>v!==undefined&&v!==-999);return vals.length?Number((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)):null;};
    return{encontrado:true,radiacaoSolar:media(prop.ALLSKY_SFC_SW_DWN),temperaturaMedia:media(prop.T2M),precipitacaoMedia:media(prop.PRECTOTCORR),umidadeRelativa:media(prop.RH2M),velocidadeVento:media(prop.WS2M)};
  }catch{return{encontrado:false};}
}

async function buscarCotacoesFrontend(){
  try{
    const resp=await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL",{signal:AbortSignal.timeout(5000)});
    const cambio=resp.ok?await resp.json():{};
    const usd=cambio.USDBRL?.bid?Number(cambio.USDBRL.bid):null;
    return{encontrado:true,atualizadoEm:new Date().toLocaleDateString("pt-BR"),dolarHoje:usd,produtos:{soja:{nome:"🌱 Soja",preco:142.50,unidade:"R$/sc 60kg",variacao:+1.2},milho:{nome:"🌽 Milho",preco:68.40,unidade:"R$/sc 60kg",variacao:-0.8},boi:{nome:"🐄 Boi Gordo",preco:310.50,unidade:"R$/@",variacao:+0.5},cafe:{nome:"☕ Café",preco:1420.0,unidade:"R$/sc 60kg",variacao:+2.1},algodao:{nome:"🌿 Algodão",preco:112.30,unidade:"R$/@ pluma",variacao:-0.3}}};
  }catch{return{encontrado:false};}
}

// ─── SCORE ────────────────────────────────────────────────────────
function calcularScore(sicar, sigef, ibama=null, prodes=null){
  let score=100; const fatores=[];
  if(!sicar?.encontrado){score-=30;fatores.push({label:"CAR não localizado",impacto:-30,cor:"#ef4444"});}
  else if(sicar?.situacao!=="AT"){score-=20;fatores.push({label:`CAR ${sicar.situacaoLabel}`,impacto:-20,cor:"#fbbf24"});}
  else{fatores.push({label:"CAR Ativo e Regular",impacto:0,cor:"#22c55e"});}
  if(ibama?.temEmbargo){const p=Math.min(ibama.totalEmbargos*15,40);score-=p;fatores.push({label:`${ibama.totalEmbargos} embargo(s) IBAMA`,impacto:-p,cor:"#ef4444"});}
  else{fatores.push({label:"Sem embargos IBAMA",impacto:0,cor:"#22c55e"});}
  if(prodes?.temAlerta){const p=Math.min(prodes.totalAlertas*10,30);score-=p;fatores.push({label:`${prodes.totalAlertas} alerta(s) PRODES`,impacto:-p,cor:"#f97316"});}
  else{fatores.push({label:"Sem alertas PRODES",impacto:0,cor:"#22c55e"});}
  if(sigef?.certificado){fatores.push({label:"SIGEF Certificado",impacto:0,cor:"#22c55e"});}
  else if(sigef?.encontrado){score-=10;fatores.push({label:"SIGEF não certificado",impacto:-10,cor:"#fbbf24"});}
  return{valor:Math.max(0,Math.min(100,score)),nivel:score>=70?"Baixo Risco":score>=40?"Risco Médio":"Alto Risco",cor:score>=70?"#22c55e":score>=40?"#fbbf24":"#ef4444",fatores};
}

// ─── CONSTANTES DE UI ─────────────────────────────────────────────
const TIPOS_BUSCA=[{id:"cpf",label:"CPF",icon:"🪪",placeholder:"Ex: 123.456.789-00"},{id:"car",label:"CAR",icon:"📋",placeholder:"Ex: MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C"},{id:"itr",label:"ITR",icon:"💰",placeholder:"Ex: 12.345.678-9"},{id:"ccir",label:"CCIR",icon:"📄",placeholder:"Ex: 800.429.7412-9"},{id:"gps",label:"GPS",icon:"📍",placeholder:"Ex: -11.8456, -55.1987"},{id:"fazenda",label:"Fazenda",icon:"🌾",placeholder:"Ex: Fazenda Santa Maria - MA - Buriticupu"},{id:"endereco",label:"Endereço",icon:"🏠",placeholder:"Ex: Sinop, Mato Grosso"},{id:"proprietario",label:"Proprietário",icon:"👤",placeholder:"Ex: João Silva - MA - Buriticupu"}];
const NAV=[{section:"Principal",items:[{icon:"⊞",label:"Dashboard",id:"dashboard"},{icon:"🔍",label:"Consultar Imóvel",id:"consulta"},{icon:"🗺️",label:"Mapa Interativo",id:"mapa"},{icon:"🤖",label:"IA & Score",id:"ia"}]},{section:"Ambiental",items:[{icon:"🌿",label:"Embargos IBAMA",id:"embargos"},{icon:"📡",label:"PRODES/INPE",id:"prodes"},{icon:"💧",label:"Precipitação",id:"precipitacao"}]},{section:"Sistema",items:[{icon:"💬",label:"WhatsApp Bot",id:"whatsapp"},{icon:"💳",label:"Planos & Preços",id:"planos"},{icon:"🛡️",label:"Painel Admin",id:"admin"}]}];
const BOTTOM_NAV=[{icon:"⊞",label:"Início",id:"dashboard"},{icon:"🗺️",label:"Mapa",id:"mapa"},{icon:"🔍",label:"Buscar",id:"consulta"},{icon:"💳",label:"Planos",id:"planos"},{icon:"🛡️",label:"Admin",id:"admin"}];

// ─── FIREBASE HELPERS ─────────────────────────────────────────────
async function criarUsuarioFS(uid,email,nome){try{const ref=doc(db,"usuarios",uid);const snap=await getDoc(ref);if(snap.exists())return snap.data();const dados={uid,email,nome,plano:"gratuito",creditos:2,creditosUsados:0,totalConsultas:0,criadoEm:serverTimestamp()};await setDoc(ref,dados);return dados;}catch(e){}}
async function descontarCreditoFS(uid,desc="Consulta"){try{const ref=doc(db,"usuarios",uid);const snap=await getDoc(ref);if(!snap.exists()||snap.data().creditos<=0)return{sucesso:false,motivo:"sem_creditos"};const d=snap.data();await updateDoc(ref,{creditos:increment(-1),creditosUsados:increment(1),totalConsultas:increment(1),ultimaConsulta:serverTimestamp()});return{sucesso:true,creditos:d.creditos-1};}catch{return{sucesso:false};}}

function useCredits(user){
  const[creditos,setCreditos]=useState(0);const[plano,setPlano]=useState("gratuito");const[loading,setLoading]=useState(true);
  useEffect(()=>{if(!user?.uid)return;criarUsuarioFS(user.uid,user.email,user.displayName||"Usuário");const ref=doc(db,"usuarios",user.uid);const unsub=onSnapshot(ref,(snap)=>{if(snap.exists()){const d=snap.data();setCreditos(d.creditos||0);setPlano(d.plano||"gratuito");}setLoading(false);});return unsub;},[user]);
  const usarCredito=useCallback(async(desc)=>{if(!user?.uid)return{sucesso:false};return await descontarCreditoFS(user.uid,desc);},[user]);
  const cor=creditos>1?"#22c55e":creditos===1?"#fbbf24":"#ef4444";
  return{creditos,plano,loading,cor,usarCredito};
}

// ─── POPUP CADASTRO ───────────────────────────────────────────────
function PopupCadastro({onFechar}){
  const[mode,setMode]=useState("register");const[name,setName]=useState("");const[email,setEmail]=useState("");const[pass,setPass]=useState("");const[confirm,setConfirm]=useState("");const[loading,setLoading]=useState(false);const[erro,setErro]=useState("");const[sucesso,setSucesso]=useState("");
  const errMsg=(code)=>({"auth/email-already-in-use":"E-mail já cadastrado.","auth/weak-password":"Senha fraca. Mínimo 6 caracteres.","auth/invalid-email":"E-mail inválido.","auth/invalid-credential":"E-mail ou senha incorretos.","auth/user-not-found":"E-mail não encontrado.","auth/wrong-password":"Senha incorreta.","auth/too-many-requests":"Muitas tentativas. Aguarde."}[code]||"Erro inesperado.");
  const handleRegister=async()=>{setErro("");if(!name.trim())return setErro("Digite seu nome.");if(pass!==confirm)return setErro("As senhas não coincidem.");if(pass.length<6)return setErro("Mínimo 6 caracteres.");setLoading(true);try{const cred=await createUserWithEmailAndPassword(auth,email,pass);await updateProfile(cred.user,{displayName:name.trim()});setSucesso("Conta criada! 🎉");setTimeout(()=>onFechar(),1500);}catch(e){setErro(errMsg(e.code));}setLoading(false);};
  const handleLogin=async()=>{setErro("");setLoading(true);try{await signInWithEmailAndPassword(auth,email,pass);onFechar();}catch(e){setErro(errMsg(e.code));}setLoading(false);};
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.90)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:24,width:"100%",maxWidth:420,position:"relative",overflow:"hidden"}}><button onClick={onFechar} style={{position:"absolute",top:14,right:14,width:30,height:30,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,color:C.textMuted,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>×</button><div style={{background:`linear-gradient(135deg,${C.green1},#0a2412)`,padding:"28px 28px 20px",textAlign:"center"}}><div style={{fontSize:40,marginBottom:8}}>🌿</div><div style={{fontSize:20,fontWeight:900,color:C.accentBright,marginBottom:4}}>{mode==="register"?"Crie sua conta grátis!":"Bem-vindo de volta!"}</div>{mode==="register"&&(<div style={{display:"inline-flex",alignItems:"center",gap:8,background:`${C.accent}20`,border:`1px solid ${C.accent}40`,borderRadius:20,padding:"6px 16px",marginTop:4}}><span style={{fontSize:16}}>🎁</span><span style={{fontSize:13,fontWeight:700,color:C.accent}}>Ganhe 3 créditos grátis ao cadastrar!</span></div>)}</div><div style={{padding:"24px 28px"}}>{erro&&<div style={{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.red,marginBottom:14}}>{erro}</div>}{sucesso&&<div style={{background:`${C.accent}15`,border:`1px solid ${C.accent}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.accentBright,marginBottom:14}}>{sucesso}</div>}{mode==="register"&&(<div style={{marginBottom:14}}><label style={{fontSize:12,color:C.textMuted,marginBottom:5,display:"block",fontWeight:600}}>Nome completo</label><input style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} placeholder="Ex: João da Silva" value={name} onChange={e=>setName(e.target.value)}/></div>)}<div style={{marginBottom:14}}><label style={{fontSize:12,color:C.textMuted,marginBottom:5,display:"block",fontWeight:600}}>E-mail</label><input style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)}/></div><div style={{marginBottom:mode==="register"?14:20}}><label style={{fontSize:12,color:C.textMuted,marginBottom:5,display:"block",fontWeight:600}}>Senha</label><input style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} type="password" placeholder="Mínimo 6 caracteres" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():null)}/></div>{mode==="register"&&(<div style={{marginBottom:20}}><label style={{fontSize:12,color:C.textMuted,marginBottom:5,display:"block",fontWeight:600}}>Confirmar senha</label><input style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} type="password" placeholder="Repita a senha" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleRegister()}/></div>)}<button onClick={mode==="register"?handleRegister:handleLogin} disabled={loading} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:loading?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:800,fontSize:15,cursor:loading?"default":"pointer"}}>{loading?"Aguarde...":(mode==="register"?"Criar conta grátis 🚀":"Entrar")}</button><div style={{textAlign:"center",marginTop:16,fontSize:13,color:C.textMuted}}>{mode==="register"?<>Já tem conta? <span style={{color:C.accentBright,cursor:"pointer",fontWeight:700}} onClick={()=>{setMode("login");setErro("");}}>Entrar</span></>:<>Não tem conta? <span style={{color:C.accentBright,cursor:"pointer",fontWeight:700}} onClick={()=>{setMode("register");setErro("");}}>Cadastrar grátis</span></>}</div><div style={{textAlign:"center",marginTop:12,fontSize:10,color:C.textDim}}>🔒 Dados protegidos — Firebase Google — SSL</div></div></div></div>);
}

// ─── POPUP PLANOS ─────────────────────────────────────────────────
function PopupPlanos({onFechar,onVerPlanos}){
  const planos=[{id:"starter_mensal",title:"Starter",price:"49",per:"/mês",creditos:"20 consultas",features:["CAR, ITR, CCIR, GPS","Score IA básico","Mapa interativo","Laudo PDF"],featured:false},{id:"pro_mensal",title:"Pro Mensal",price:"99",per:"/mês",creditos:"100 consultas",badge:"MAIS VENDIDO",features:["Tudo do Starter","IBAMA + PRODES","Score IA avançado","Chat IA com a fazenda","WhatsApp Bot"],featured:true},{id:"pro_anual",title:"Pro Anual",price:"79",per:"/mês",creditos:"100 consultas",badge:"ECONOMIA 20%",features:["Tudo do Pro","Alertas automáticos","Relatórios avançados","Suporte prioritário"],featured:false}];
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16,overflowY:"auto"}}><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:24,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto",position:"relative"}}><button onClick={onFechar} style={{position:"absolute",top:14,right:14,width:30,height:30,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,color:C.textMuted,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>×</button><div style={{background:`linear-gradient(135deg,${C.green1},#0a2412)`,borderRadius:"24px 24px 0 0",padding:"28px 28px 24px",textAlign:"center"}}><div style={{fontSize:40,marginBottom:8}}>🔒</div><div style={{fontSize:22,fontWeight:900,color:C.accentBright,marginBottom:6}}>Seus créditos acabaram!</div><div style={{fontSize:13,color:C.textMuted}}>Escolha um plano e continue consultando.</div></div><div style={{padding:"24px"}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:20}}>{planos.map((p)=>(<div key={p.id} style={{background:p.featured?`linear-gradient(160deg,${C.green1},${C.card})`:C.bg,border:`1px solid ${p.featured?C.borderLight:C.border}`,borderRadius:16,padding:"20px 16px",position:"relative"}}>{p.badge&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:`linear-gradient(135deg,${C.accent},${C.green2})`,color:C.bg,fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap"}}>{p.badge}</div>}<div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:2}}>{p.title}</div><div style={{fontSize:30,fontWeight:900,color:C.accentBright,lineHeight:1.1}}>R${p.price}</div><div style={{fontSize:10,color:C.textMuted,marginBottom:4}}>{p.per}</div><div style={{fontSize:11,color:C.accent,fontWeight:600,marginBottom:12}}>{p.creditos} incluídas</div>{p.features.map(f=>(<div key={f} style={{display:"flex",gap:6,fontSize:11,marginBottom:5,color:C.textMuted}}><span style={{color:C.accent}}>✓</span>{f}</div>))}<button onClick={()=>{onFechar();onVerPlanos();}} style={{width:"100%",padding:"10px 0",borderRadius:8,border:p.featured?"none":`1px solid ${C.borderLight}`,background:p.featured?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent",color:p.featured?C.text:C.accentBright,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:14}}>{p.featured?"Assinar Agora":"Começar"}</button></div>))}</div><div style={{textAlign:"center",fontSize:11,color:C.textDim}}>💳 PIX · Cartão · Boleto — Pagamento seguro via Mercado Pago</div><button onClick={onFechar} style={{display:"block",margin:"12px auto 0",padding:"8px 24px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:12,cursor:"pointer"}}>Agora não</button></div></div></div>);
}

// ─── BUSCA BOX ────────────────────────────────────────────────────
function BuscaBox({onConsultar,buscando,user,onNaoCadastrado}){
  const[tipo,setTipo]=useState("car");const[val,setVal]=useState("");
  const tipoAtual=TIPOS_BUSCA.find(t=>t.id===tipo);
  const handleConsultar=()=>{if(!val.trim())return;if(!user){onNaoCadastrado();return;}onConsultar(tipo,val.trim());};
  return(<div><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{TIPOS_BUSCA.map(t=>(<button key={t.id} onClick={()=>{setTipo(t.id);setVal("");}} translate="no" style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${tipo===t.id?C.accent:C.border}`,background:tipo===t.id?`${C.accent}20`:"transparent",color:tipo===t.id?C.accent:C.textMuted,fontSize:11,fontWeight:tipo===t.id?700:400,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><span>{t.icon}</span>{t.label}</button>))}</div><div style={{display:"flex",gap:8}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",color:C.text,fontSize:13,outline:"none",height:42}} placeholder={tipoAtual?.placeholder||""} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleConsultar()} onClick={()=>{if(!user)onNaoCadastrado();}}/><button onClick={handleConsultar} disabled={buscando} style={{background:buscando?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:13,padding:"0 20px",cursor:buscando?"default":"pointer",height:42,whiteSpace:"nowrap",flexShrink:0}}>{buscando?"Buscando...":"Consultar"}</button></div></div>);
}

const PERGUNTAS_RAPIDAS=["Qual o score de risco?","Tem embargo ativo?","A Reserva Legal está regular?","Pode financiar esta propriedade?","Situação ambiental geral?","Calcule o ITR estimado"];

// ─── CONSULTA PAGE ────────────────────────────────────────────────
function ConsultaPage({user,usarCredito,creditos,onSemCreditos,setPage,onNaoCadastrado,onResultado,dadosConsulta}){
  const[buscando,setBuscando]=useState(false);
  const[faseBusca,setFaseBusca]=useState("");
  const[resultado,setResultado]=useState(null);
  const[erro,setErro]=useState(null);
  const[msgNaoEncontrado,setMsgNaoEncontrado]=useState(null);

  useEffect(()=>{
    const handler=(e)=>consultar(e.detail.tipo,e.detail.val);
    window.addEventListener("agromind-consultar",handler);
    return()=>window.removeEventListener("agromind-consultar",handler);
  },[]);

  const consultar=async(tipo,val)=>{
    if(buscando)return;
    if(!user){onNaoCadastrado();return;}
    if(creditos<=0){onSemCreditos();return;}
    const cr=await usarCredito(`Consulta ${tipo}: ${val.substring(0,40)}`);
    if(cr?.motivo==="sem_creditos"){onSemCreditos();return;}
    setBuscando(true);setErro(null);setResultado(null);setMsgNaoEncontrado(null);setFaseBusca("sicar");

    try{
      let body={};
      let coordsGPS={lat:null,lng:null};

      if(tipo==="gps"){
        const gps=val.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
        if(!gps){setErro("GPS inválido. Use: -11.8456, -55.1987");setBuscando(false);setFaseBusca("");return;}
        coordsGPS={lat:parseFloat(gps[1]),lng:parseFloat(gps[2])};
        body={lat:coordsGPS.lat,lng:coordsGPS.lng};
      } else if(tipo==="endereco"){
        const geo=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=1&countrycodes=br`);
        const gd=await geo.json();
        if(!gd?.length){setErro("Endereço não encontrado.");setBuscando(false);setFaseBusca("");return;}
        coordsGPS={lat:parseFloat(gd[0].lat),lng:parseFloat(gd[0].lon)};
        body={lat:coordsGPS.lat,lng:coordsGPS.lng};
      } else if(tipo==="ccir"){body={ccir:val};}
      else if(tipo==="itr"){body={itr:val};}
      else if(tipo==="proprietario"){body={proprietario:val};}
      else if(tipo==="fazenda"){body={nomeFazenda:val};}
      else{body={car:val};}

      // ── CCIR, ITR, Nome, Proprietário → cruzamento no Firestore (instantâneo)
      if(body.ccir || body.itr || body.nomeFazenda || body.proprietario){
        const tipo  = body.ccir ? "ccir" : body.itr ? "itr" : body.nomeFazenda ? "nomeFazenda" : "proprietario";
        const valor = body.ccir || body.itr || body.nomeFazenda || body.proprietario || "";

        // 1. Busca CAR no Firestore
        const carEncontrado = await buscarCARnoFirestore(tipo, valor);

        if(carEncontrado){
          // 2. Busca dados completos do banco
          const dadosBanco = await buscarDadosFirestore(carEncontrado);

          // 3. Busca no SICAR com o CAR (via Cloudflare — sem timeout)
          const [sicar, sigef] = await Promise.all([
            buscarSICARporCAR(carEncontrado, body.ccir, body.itr),
            buscarSIGEFFrontend({ car: carEncontrado, ccir: body.ccir }),
          ]);

          // 4. Enriquece com dados do banco
          const sicarFinal = sicar?.encontrado ? {
            ...sicar,
            ccir:        sicar.ccir        || dadosBanco?.ccir        || body.ccir || null,
            nirf:        sicar.nirf        || dadosBanco?.itr         || body.itr  || null,
            nome:        sicar.nome        || dadosBanco?.nome        || null,
            municipio:   sicar.municipio   || dadosBanco?.municipio   || null,
            proprietario:sicar.proprietario|| dadosBanco?.proprietario|| null,
          } : dadosBanco ? {
            encontrado:    true,
            fonteBanco:    true,
            car:           carEncontrado,
            nome:          dadosBanco.nome          || "Imóvel Rural",
            municipio:     dadosBanco.municipio      || "",
            uf:            dadosBanco.uf             || "",
            area:          dadosBanco.area           || null,
            areaHa:        dadosBanco.areaHa         || null,
            ccir:          dadosBanco.ccir           || dadosBanco.ccirFormatado || body.ccir || null,
            nirf:          dadosBanco.itr            || body.itr || null,
            proprietario:  dadosBanco.proprietario   || null,
            modulos:       dadosBanco.modulos        || null,
            lat:           dadosBanco.lat            || null,
            lng:           dadosBanco.lng            || null,
            situacao:      "AT",
            situacaoLabel: "Ativo",
          } : { encontrado: false, mensagem: "Imóvel não localizado." };

          const coordLat = sicarFinal?.lat || sigef?.lat || dadosBanco?.lat || null;
          const coordLng = sicarFinal?.lng || sigef?.lng || dadosBanco?.lng || null;
          const scoreInicial = calcularScore(sicarFinal, sigef);
          const dadosParciais = {
            sucesso: true,
            car: carEncontrado,
            coordenadas: { lat: coordLat, lng: coordLng },
            sicar: sicarFinal, sigef, score: scoreInicial,
            cruzamento: { encontrado: true, via: tipo },
          };

          setResultado(dadosParciais);
          onResultado(dadosParciais);
          setFaseBusca("extras");
          setBuscando(false);

          const [ibama, prodes, clima, nasa, cotacoes] = await Promise.allSettled([
            buscarIBAMAFrontend(carEncontrado),
            buscarPRODESFrontend(coordLat, coordLng),
            buscarClimaFrontend(coordLat, coordLng),
            buscarNASAFrontend(coordLat, coordLng),
            buscarCotacoesFrontend(),
          ]);
          const extras = {
            ibama:    ibama.status==="fulfilled"    ? ibama.value    : {encontrado:false,temEmbargo:false,totalEmbargos:0,embargos:[]},
            prodes:   prodes.status==="fulfilled"   ? prodes.value   : {encontrado:false,temAlerta:false,totalAlertas:0,alertas:[]},
            clima:    clima.status==="fulfilled"    ? clima.value    : {encontrado:false},
            nasa:     nasa.status==="fulfilled"     ? nasa.value     : {encontrado:false},
            cotacoes: cotacoes.status==="fulfilled" ? cotacoes.value : {encontrado:false},
          };
          const scoreCompleto = calcularScore(sicarFinal, sigef, extras.ibama, extras.prodes);
          const dadosCompletos = { ...dadosParciais, ...extras, score: scoreCompleto };
          setResultado(dadosCompletos);
          onResultado(dadosCompletos);
          if(user?.uid) await salvarConsultaFS(user.uid, dadosCompletos);
          setFaseBusca("");
          return;
        }

        // Não achou no Firestore — tenta SICAR diretamente
        setMsgNaoEncontrado({
          mensagem: "Imóvel não localizado no banco interno.",
          dica: tipo === "ccir" ? "Tente buscar pelo CAR ou nome da fazenda." :
                tipo === "itr"  ? "Tente buscar pelo CAR." :
                "Tente incluir o estado: 'Fazenda Nome - MA'",
          tipo,
        });
        setBuscando(false);
        setFaseBusca("");
        return;
      }

      // ── CAR, GPS, Endereço → busca direto no frontend
      let sicarPromise;
      if(tipo==="gps"||tipo==="endereco"){
        sicarPromise=buscarSICARPorGPS(coordsGPS.lat,coordsGPS.lng);
      } else {
        sicarPromise=buscarSICARFrontend(body);
      }
      const [sicar, sigef] = await Promise.all([
        sicarPromise,
        buscarSIGEFFrontend({ car: body.car, ccir: body.ccir }),
      ]);

      // Se não encontrou nada — mostra mensagem clara
      if(!sicar?.encontrado && !sigef?.encontrado){
        setMsgNaoEncontrado({
          mensagem: sicar?.mensagem || "Imóvel não localizado.",
          dica: sicar?.dica || null,
          tipo,
        });
        setBuscando(false);
        setFaseBusca("");
        return;
      }

      const coordLat = coordsGPS.lat || sicar?.lat || sigef?.lat || null;
      const coordLng = coordsGPS.lng || sicar?.lng || sigef?.lng || null;
      const carFinal = body.car || sicar?.car || null;

      const scoreInicial = calcularScore(sicar, sigef);
      const dadosParciais = {
        sucesso: true,
        car: carFinal,
        coordenadas: { lat: coordLat, lng: coordLng },
        sicar, sigef, score: scoreInicial,
      };

      setResultado(dadosParciais);
      onResultado(dadosParciais);
      setFaseBusca("extras");
      setBuscando(false);

      // FASE 2: extras em paralelo
      const [ibama, prodes, clima, nasa, cotacoes] = await Promise.allSettled([
        buscarIBAMAFrontend(carFinal),
        buscarPRODESFrontend(coordLat, coordLng),
        buscarClimaFrontend(coordLat, coordLng),
        buscarNASAFrontend(coordLat, coordLng),
        buscarCotacoesFrontend(),
      ]);

      const extras = {
        ibama:    ibama.status==="fulfilled"    ? ibama.value    : {encontrado:false,temEmbargo:false,totalEmbargos:0,embargos:[]},
        prodes:   prodes.status==="fulfilled"   ? prodes.value   : {encontrado:false,temAlerta:false,totalAlertas:0,alertas:[]},
        clima:    clima.status==="fulfilled"    ? clima.value    : {encontrado:false},
        nasa:     nasa.status==="fulfilled"     ? nasa.value     : {encontrado:false},
        cotacoes: cotacoes.status==="fulfilled" ? cotacoes.value : {encontrado:false},
      };

      const scoreCompleto = calcularScore(sicar, sigef, extras.ibama, extras.prodes);
      const dadosCompletos = { ...dadosParciais, ...extras, score: scoreCompleto };

      setResultado(dadosCompletos);
      onResultado(dadosCompletos);
      if(user?.uid) await salvarConsultaFS(user.uid, dadosCompletos);

    }catch(e){
      setErro("Erro inesperado. Tente novamente.");
      setBuscando(false);
    }
    setFaseBusca("");
  };

  const r=resultado;const score=r?.score;const scoreCor=score?.cor??C.accent;
  return(<div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}>
    <div style={{...S.card,background:`linear-gradient(135deg,${C.card} 0%,${C.green1}40 50%,${C.card} 100%)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}>
      <div style={{fontSize:"clamp(17px,4vw,22px)",fontWeight:800,marginBottom:4}}>Consultar Imóvel Rural</div>
      <div style={{color:C.textMuted,fontSize:12,marginBottom:16}}>Clique no tipo de busca e digite abaixo</div>
      <BuscaBox onConsultar={consultar} buscando={buscando} user={user} onNaoCadastrado={onNaoCadastrado}/>
      {erro&&<div style={{marginTop:12,padding:"10px 14px",background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:8,fontSize:13,color:C.red}}>{erro}</div>}
      {user&&<div style={{marginTop:10,fontSize:11,color:C.textMuted}}>1 crédito por consulta — Créditos: <strong style={{color:creditos>1?C.accent:C.red}}>{creditos}</strong></div>}
    </div>

    {buscando&&faseBusca==="sicar"&&<div style={{...S.card,textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:48,marginBottom:16}}>🔍</div><div style={{fontSize:16,fontWeight:700,color:C.accentBright,marginBottom:8}}>Buscando no SICAR...</div><div style={{fontSize:13,color:C.textMuted}}>Consultando todos os estados — aguarde</div></div>}
    {faseBusca==="extras"&&<div style={{padding:"10px 14px",background:`${C.blue}15`,border:`1px solid ${C.blue}40`,borderRadius:8,fontSize:13,color:C.blue,marginBottom:12}}>⏳ Carregando IBAMA · PRODES · Clima · NASA · Cotações...</div>}

    {/* ── Mensagem quando não encontra ── */}
    {msgNaoEncontrado&&(
      <div style={{...S.card,borderColor:`${C.yellow}40`,background:`${C.yellow}08`,padding:"20px"}}>
        <div style={{fontSize:14,fontWeight:700,color:C.yellow,marginBottom:8}}>⚠️ Imóvel não localizado</div>
        <div style={{fontSize:13,color:C.text,marginBottom:8}}>{msgNaoEncontrado.mensagem}</div>
        {msgNaoEncontrado.dica&&<div style={{fontSize:12,color:C.textMuted,marginBottom:12}}>💡 {msgNaoEncontrado.dica}</div>}
        <div style={{fontSize:12,color:C.textMuted,borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4}}>
          <strong style={{color:C.text}}>O que pode ajudar:</strong><br/>
          {msgNaoEncontrado.tipo==="ccir"&&"• O CCIR nem sempre está disponível no SICAR. Tente buscar pelo CAR ou nome da fazenda."}
          {msgNaoEncontrado.tipo==="itr"&&"• O ITR/NIRF pode não estar cadastrado no SICAR. Consulte na Receita Federal com o CPF/CNPJ do proprietário."}
          {msgNaoEncontrado.tipo==="fazenda"&&"• Tente incluir o estado: \"Fazenda Nome - MT\". Ou use o código CAR se tiver."}
          {msgNaoEncontrado.tipo==="proprietario"&&"• Inclua o estado para busca mais precisa: \"João Silva - MT\". O SICAR não exige nome do proprietário em todos os cadastros."}
          {msgNaoEncontrado.tipo==="car"&&"• Verifique o código CAR. Formato correto: MT-5107040-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}
        </div>
      </div>
    )}

    {r&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.green1}30)`,borderRadius:18,padding:"20px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}><div><div style={{fontSize:18,fontWeight:800,color:C.accentBright,marginBottom:4}}>{r.sicar?.nome||r.sigef?.denominacao||r.car||"Imóvel Rural"}</div><div style={{fontSize:13,color:C.textMuted,marginBottom:8}}>📍 {r.sicar?.municipio?`${r.sicar.municipio}, ${r.sicar.uf}`:r.sigef?.municipio?`${r.sigef.municipio}, ${r.sigef.uf}`:""}</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><span style={S.chip(r.sicar?.encontrado?C.accent:C.yellow)}>{r.sicar?.encontrado?"CAR Localizado":"Localizado via SIGEF"}</span><span style={S.chip(r.ibama?.temEmbargo?C.red:C.accent)}>{r.ibama?.temEmbargo?`${r.ibama.totalEmbargos} Embargo(s)`:faseBusca==="extras"?"Verificando...":"Sem Embargo"}</span><span style={S.chip(r.prodes?.temAlerta?C.orange:C.accent)}>{r.prodes?.temAlerta?`${r.prodes.totalAlertas} Alerta(s)`:faseBusca==="extras"?"Verificando...":"Sem Alerta PRODES"}</span></div></div><div style={{background:C.card,border:`1px solid ${scoreCor}40`,borderRadius:14,padding:"16px 20px",textAlign:"center",minWidth:100}}><div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Score IA</div><div style={{fontSize:36,fontWeight:900,color:scoreCor,lineHeight:1}}>{score?.valor??0}</div><div style={{fontSize:10,color:C.textMuted}}>/100</div><div style={{fontSize:11,color:scoreCor,marginTop:4,fontWeight:700}}>{score?.nivel}</div></div></div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
        {r.sicar?.encontrado&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:C.accentBright}}>Dados SICAR/CAR</div>{[["CAR",r.sicar.car?.length>22?r.sicar.car.substring(0,22)+"...":r.sicar.car],["Área Total",r.sicar.area],["Módulos",r.sicar.modulos],["Proprietário",r.sicar.proprietario],["Situação",r.sicar.situacaoLabel],["CCIR",r.sicar.ccir],["ITR/NIRF",r.sicar.nirf],["APP",r.sicar.app],["Res. Legal",r.sicar.rl]].filter(([,v])=>v).map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:600,color:C.text,textAlign:"right",maxWidth:150}}>{v}</span></div>))}</div>)}
        {r.sigef?.encontrado&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:C.blue}}>SIGEF/INCRA</div>{[["Denominação",r.sigef.denominacao],["Área",r.sigef.area],["Município",r.sigef.municipio],["UF",r.sigef.uf],["CCIR",r.sigef.ccir],["Situação",r.sigef.situacaoLabel]].filter(([,v])=>v).map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:600,color:C.text}}>{v}</span></div>))}</div>)}
        <div style={{...S.card,border:`1px solid ${r.ibama?.temEmbargo?C.red:C.accent}30`}}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:r.ibama?.temEmbargo?C.red:C.accent}}>Embargos IBAMA</div>{faseBusca==="extras"&&!r.ibama?.encontrado?(<div style={{textAlign:"center",padding:"12px 0",color:C.textMuted,fontSize:12}}>Verificando...</div>):!r.ibama?.temEmbargo?(<div style={{textAlign:"center",padding:"12px 0"}}><div style={{fontSize:32,marginBottom:8}}>✅</div><div style={{fontSize:13,fontWeight:700,color:C.accent}}>Nenhum embargo ativo</div></div>):r.ibama.embargos?.map((e,i)=>(<div key={i} style={{padding:"8px 10px",marginBottom:8,border:`1px solid ${C.red}30`,borderRadius:8,background:`${C.red}08`}}><div style={{fontSize:12,fontWeight:700,color:C.red}}>{e.numero}</div><div style={{fontSize:11,color:C.textMuted}}>{e.tipo} - {e.data}</div></div>))}</div>
        <div style={{...S.card,border:`1px solid ${r.prodes?.temAlerta?C.orange:C.accent}30`}}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:r.prodes?.temAlerta?C.orange:C.accent}}>PRODES/INPE</div>{faseBusca==="extras"&&!r.prodes?.encontrado?(<div style={{textAlign:"center",padding:"12px 0",color:C.textMuted,fontSize:12}}>Verificando...</div>):!r.prodes?.temAlerta?(<div style={{textAlign:"center",padding:"12px 0"}}><div style={{fontSize:32,marginBottom:8}}>✅</div><div style={{fontSize:13,fontWeight:700,color:C.accent}}>Nenhum alerta</div></div>):(<div style={{fontSize:13,fontWeight:700,color:C.orange}}>{r.prodes.totalAlertas} alerta(s) — {r.prodes.areaDesmatadaKm2} km²</div>)}</div>
        {r.clima?.encontrado&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:C.blue}}>Clima</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{[["Temperatura",`${r.clima.atual?.temperatura??'--'}°C`],["Umidade",`${r.clima.atual?.umidade??'--'}%`],["Vento",`${r.clima.atual?.vento??'--'} km/h`],["Chuva 30d",`${r.clima.precipTotal30d??0} mm`]].map(([l,v])=>(<div key={l} style={{background:`${C.blue}10`,border:`1px solid ${C.blue}20`,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:10,color:C.textMuted}}>{l}</div><div style={{fontSize:14,fontWeight:800,color:C.blue}}>{v}</div></div>))}</div></div>)}
        {r.cotacoes?.encontrado&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,color:C.yellow,marginBottom:12}}>Cotações CEPEA</div>{Object.entries(r.cotacoes.produtos||{}).map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:12,fontWeight:600}}>{v.nome}</div><div style={{fontSize:13,fontWeight:800,color:C.yellow}}>{v.preco?`R$ ${Number(v.preco).toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"}</div></div>))}</div>)}
        {score?.fatores&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Análise de Risco IA</div>{score.fatores.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",marginBottom:6,borderRadius:8,border:`1px solid ${f.cor}30`,background:`${f.cor}08`}}><span style={{fontSize:12,color:C.textMuted}}>{f.label}</span><span style={{fontSize:12,fontWeight:700,color:f.cor}}>{f.impacto===0?"OK":f.impacto}</span></div>))}</div>)}
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button onClick={()=>setPage("mapa")} style={{flex:1,minWidth:140,padding:"12px",borderRadius:10,background:`linear-gradient(135deg,${C.green2},${C.green3})`,border:"none",color:C.text,fontWeight:700,fontSize:13,cursor:"pointer"}}>Ver no Mapa</button>
        <button onClick={()=>setPage("ia")} style={{flex:1,minWidth:140,padding:"12px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},#6366f1)`,border:"none",color:C.text,fontWeight:700,fontSize:13,cursor:"pointer"}}>Consultar IA</button>
      </div>
    </div>)}
  </div>);
}

// ─── PÁGINAS AMBIENTAIS ───────────────────────────────────────────
function EmbargoPage(){const[car,setCar]=useState("");const[buscando,setBuscando]=useState(false);const[resultado,setResultado]=useState(null);const[erro,setErro]=useState(null);const buscar=async()=>{if(!car.trim()||buscando)return;setBuscando(true);setErro(null);setResultado(null);try{const r=await buscarIBAMAFrontend(car.trim());setResultado({embargos:r.embargos||[],car:car.trim()});}catch{setErro("Não foi possível consultar o IBAMA.");}setBuscando(false);};return(<div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}><div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.red}15)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}><div style={{fontSize:"clamp(17px,4vw,22px)",fontWeight:800,marginBottom:4}}>Embargos IBAMA</div><div style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Consulte embargos ambientais por código CAR</div><div style={{display:"flex",gap:8}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",color:C.text,fontSize:13,outline:"none",height:42}} placeholder="Ex: MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C" value={car} onChange={e=>setCar(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()}/><button onClick={buscar} disabled={buscando||!car.trim()} style={{background:buscando||!car.trim()?C.border:`linear-gradient(135deg,${C.red},#dc2626)`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:13,padding:"0 20px",cursor:buscando||!car.trim()?"default":"pointer",height:42}}>{buscando?"Buscando...":"Consultar"}</button></div>{erro&&<div style={{marginTop:12,padding:"10px 14px",background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:8,fontSize:13,color:C.red}}>{erro}</div>}</div>{resultado&&(<div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:15,fontWeight:700}}>Resultado</div><span style={S.chip(resultado.embargos.length>0?C.red:C.accent)}>{resultado.embargos.length>0?`${resultado.embargos.length} embargo(s)`:"Sem embargos"}</span></div>{resultado.embargos.length===0?(<div style={{textAlign:"center",padding:"24px 0"}}><div style={{fontSize:48,marginBottom:12}}>✅</div><div style={{fontSize:16,fontWeight:700,color:C.accent}}>Nenhum embargo ativo</div></div>):(resultado.embargos.map((e,i)=>(<div key={i} style={{padding:"14px",marginBottom:12,border:`1px solid ${C.red}40`,borderRadius:12,background:`${C.red}08`}}><div style={{fontSize:14,fontWeight:800,color:C.red}}>Auto {e.numero||"—"}</div><div style={{fontSize:12,color:C.textMuted}}>Data: {e.data||"—"}</div></div>)))}</div>)}</div>);}

function ProdesPage(){const[coords,setCoords]=useState("");const[buscando,setBuscando]=useState(false);const[resultado,setResultado]=useState(null);const[erro,setErro]=useState(null);const buscar=async()=>{if(!coords.trim()||buscando)return;const gps=coords.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);if(!gps){setErro("Use: -11.8456, -55.1987");return;}setBuscando(true);setErro(null);setResultado(null);try{const r=await buscarPRODESFrontend(parseFloat(gps[1]),parseFloat(gps[2]));setResultado(r);}catch{setErro("Não foi possível consultar o PRODES/INPE.");}setBuscando(false);};return(<div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}><div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.orange}15)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}><div style={{fontSize:"clamp(17px,4vw,22px)",fontWeight:800,marginBottom:4}}>PRODES/INPE Desmatamento</div><div style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Alertas via satélite DETER</div><div style={{display:"flex",gap:8}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",color:C.text,fontSize:13,outline:"none",height:42}} placeholder="GPS: -11.8456, -55.1987" value={coords} onChange={e=>setCoords(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()}/><button onClick={buscar} disabled={buscando||!coords.trim()} style={{background:buscando||!coords.trim()?C.border:`linear-gradient(135deg,${C.orange},#ea580c)`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:13,padding:"0 20px",cursor:buscando||!coords.trim()?"default":"pointer",height:42}}>{buscando?"Buscando...":"Consultar"}</button></div>{erro&&<div style={{marginTop:12,padding:"10px 14px",background:`${C.orange}15`,border:`1px solid ${C.orange}40`,borderRadius:8,fontSize:13,color:C.orange}}>{erro}</div>}</div>{resultado&&(<div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:15,fontWeight:700}}>Resultado</div><span style={S.chip(resultado.temAlerta?C.orange:C.accent)}>{resultado.temAlerta?`${resultado.totalAlertas} alerta(s)`:"Sem alertas"}</span></div>{!resultado.temAlerta?(<div style={{textAlign:"center",padding:"24px 0"}}><div style={{fontSize:48,marginBottom:12}}>🌳</div><div style={{fontSize:16,fontWeight:700,color:C.accent}}>Nenhum alerta detectado</div></div>):(resultado.alertas.map((a,i)=>(<div key={i} style={{padding:"12px",marginBottom:10,border:`1px solid ${C.orange}30`,borderRadius:10,background:`${C.orange}06`}}><div style={{fontSize:13,fontWeight:700,color:C.orange}}>{a.classname||"Desmatamento"}</div><div style={{fontSize:11,color:C.textMuted}}>{a.data||"—"} · {a.areaKm2||"—"} km²</div></div>)))}</div>)}</div>);}

function PrecipitacaoPage(){const[coords,setCoords]=useState("");const[buscando,setBuscando]=useState(false);const[resultado,setResultado]=useState(null);const[erro,setErro]=useState(null);const buscar=async()=>{if(!coords.trim()||buscando)return;const gps=coords.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);if(!gps){setErro("Use: -11.8456, -55.1987");return;}setBuscando(true);setErro(null);setResultado(null);try{const r=await buscarClimaFrontend(parseFloat(gps[1]),parseFloat(gps[2]));setResultado(r);}catch{setErro("Não foi possível buscar dados climáticos.");}setBuscando(false);};return(<div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}><div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.blue}15)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}><div style={{fontSize:"clamp(17px,4vw,22px)",fontWeight:800,marginBottom:4}}>Precipitação e Clima</div><div style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Histórico 30 dias + previsão 14 dias</div><div style={{display:"flex",gap:8}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",color:C.text,fontSize:13,outline:"none",height:42}} placeholder="GPS: -11.8456, -55.1987" value={coords} onChange={e=>setCoords(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()}/><button onClick={buscar} disabled={buscando||!coords.trim()} style={{background:buscando||!coords.trim()?C.border:`linear-gradient(135deg,${C.blue},#2563eb)`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:13,padding:"0 20px",cursor:buscando||!coords.trim()?"default":"pointer",height:42}}>{buscando?"Buscando...":"Consultar"}</button></div>{erro&&<div style={{marginTop:12,padding:"10px 14px",background:`${C.blue}15`,border:`1px solid ${C.blue}40`,borderRadius:8,fontSize:13,color:C.blue}}>{erro}</div>}</div>{!resultado&&!buscando&&(<div style={{...S.card,textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:56,marginBottom:16}}>💧</div><div style={{fontSize:15,fontWeight:700,color:C.blue}}>Digite as coordenadas GPS acima</div></div>)}{resultado?.encontrado&&(<div style={{display:"flex",flexDirection:"column",gap:14}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>{[["Temperatura",`${resultado.atual?.temperatura??'--'}°C`,C.red],["Umidade",`${resultado.atual?.umidade??'--'}%`,C.blue],["Chuva hoje",`${resultado.atual?.precipitacao??0} mm`,C.blue],["Total 30d",`${resultado.precipTotal30d??0} mm`,C.blue]].map(([l,v,c])=>(<div key={l} style={{...S.card,padding:14,textAlign:"center"}}><div style={{fontSize:10,color:C.textMuted,marginBottom:4}}>{l}</div><div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div></div>))}</div></div>)}</div>);}

// ─── IA PAGE ──────────────────────────────────────────────────────
function IAPage({usarCredito,creditos,onSemCreditos,onNaoCadastrado,user,dadosConsulta}){
  const fazendaNome=dadosConsulta?.sicar?.nome||dadosConsulta?.sigef?.denominacao||"Imóvel Rural";
  const fazendaMunicipio=dadosConsulta?.sicar?.municipio?`${dadosConsulta.sicar.municipio}, ${dadosConsulta.sicar.uf}`:dadosConsulta?.sigef?.municipio?`${dadosConsulta.sigef.municipio}, ${dadosConsulta.sigef.uf}`:"—";
  const contexto=dadosConsulta?`FAZENDA: ${fazendaNome}, ${fazendaMunicipio}, ${dadosConsulta.sicar?.area||dadosConsulta.sigef?.area||"—"}, Score ${dadosConsulta.score?.valor??78}/100, CAR: ${dadosConsulta.car||"—"}, Proprietário: ${dadosConsulta.sicar?.proprietario||"—"}, IBAMA: ${dadosConsulta.ibama?.temEmbargo?"COM EMBARGO":"sem embargo"}, PRODES: ${dadosConsulta.prodes?.temAlerta?"COM ALERTA":"sem alerta"}, SIGEF: ${dadosConsulta.sigef?.situacaoLabel||"—"}`:`FAZENDA: Fazenda Horizonte Verde, Sinop/MT, 1.284,7 ha, Score 78/100`;
  const[msgs,setMsgs]=useState([{role:"assistant",content:`Olá! Sou a IA do AgroMind. 🌿\n\nAnalisando: ${fazendaNome} (${fazendaMunicipio})\n\nO que você quer saber?`}]);
  const[input,setInput]=useState("");const[loadingIA,setLoadingIA]=useState(false);const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  useEffect(()=>{if(dadosConsulta){setMsgs([{role:"assistant",content:`Olá! Sou a IA do AgroMind. 🌿\n\nAnalisando: ${fazendaNome} (${fazendaMunicipio})\n\nO que você quer saber sobre esta propriedade?`}]);}},[dadosConsulta]);
  const enviar=async(texto)=>{const pergunta=texto||input.trim();if(!pergunta||loadingIA)return;if(!user){onNaoCadastrado();return;}setInput("");if(creditos<=0){onSemCreditos();return;}const resultado=await usarCredito(`IA: ${pergunta.substring(0,50)}`);if(resultado?.motivo==="sem_creditos"){onSemCreditos();return;}setMsgs(prev=>[...prev,{role:"user",content:pergunta}]);setLoadingIA(true);setMsgs(prev=>[...prev,{role:"assistant",content:"",loading:true}]);try{const resp=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:`Você é a IA do AgroMind. ${contexto}. Responda em português, use emojis, máximo 200 palavras, sem markdown.`,messages:[...msgs.filter(m=>!m.loading).map(m=>({role:m.role,content:m.content})),{role:"user",content:pergunta}]})});const data=await resp.json();const txt=limparMarkdown(data.content?.[0]?.text||"Erro.");setMsgs(prev=>[...prev.filter(m=>!m.loading),{role:"assistant",content:txt}]);}catch{setMsgs(prev=>[...prev.filter(m=>!m.loading),{role:"assistant",content:"Erro de conexão."}]);}setLoadingIA(false);};
  return(<div style={{display:"flex",height:"calc(100vh - 64px)",overflow:"hidden"}}><style>{`@keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style><div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",alignItems:"center",gap:10,flexShrink:0}}><div style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},#6366f1)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🤖</div><div><div style={{fontSize:13,fontWeight:700}}>IA AgroMind</div><div style={{fontSize:10,color:C.accent}}>Online — {fazendaNome}</div></div></div><div style={{flex:1,overflowY:"auto",padding:"16px"}}>{msgs.map((m,i)=>(<div key={i} style={{display:"flex",gap:8,marginBottom:14,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}><div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:m.role==="user"?`linear-gradient(135deg,${C.green2},${C.accent})`:`linear-gradient(135deg,${C.blue},#6366f1)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{m.role==="user"?"👤":"🤖"}</div><div style={{maxWidth:"78%",padding:"10px 14px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?`linear-gradient(135deg,${C.green2},${C.green3})`:C.card,border:m.role==="user"?"none":`1px solid ${C.border}`,color:C.text,fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.content}{m.loading&&<span style={{display:"inline-flex",gap:3,marginLeft:6}}>{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:C.accent,animation:`pulse 1s ease-in-out ${i*0.2}s infinite`,display:"inline-block"}}/>)}</span>}</div></div>))}<div ref={bottomRef}/></div><div style={{padding:"6px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:6,overflowX:"auto",flexShrink:0}}>{PERGUNTAS_RAPIDAS.map((p,i)=>(<button key={i} onClick={()=>enviar(p)} style={{flexShrink:0,padding:"4px 10px",borderRadius:20,border:`1px solid ${C.borderLight}`,background:`${C.green1}40`,color:C.textMuted,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>{p}</button>))}</div><div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,background:C.surface,display:"flex",gap:8,alignItems:"flex-end",flexShrink:0}}><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar();}}} placeholder={user?"Pergunte sobre a fazenda...":"Faça login para usar a IA"} rows={1} style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",color:C.text,fontSize:13,outline:"none",resize:"none",fontFamily:"inherit",lineHeight:1.5,maxHeight:80,overflowY:"auto"}}/><button onClick={()=>enviar()} disabled={loadingIA||!input.trim()} style={{width:40,height:40,borderRadius:10,border:"none",background:loadingIA||!input.trim()?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,cursor:loadingIA||!input.trim()?"default":"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{loadingIA?"⏳":"→"}</button></div></div></div>);
}

const precipData=[45,70,30,90,55,20,80,65,40,75,50,35,60,88,42,30,55,70,45,60,30,85,65,50,40,75,60,50,45,70];

// ─── DASHBOARD ────────────────────────────────────────────────────
function Dashboard({user,setPage,onNaoCadastrado,onConsultarDireto,dadosConsulta,onCarregarConsulta}){
  const[historico,setHistorico]=useState([]);const[loadingHist,setLoadingHist]=useState(true);
  useEffect(()=>{if(!user?.uid){setLoadingHist(false);return;}buscarHistoricoFS(user.uid,5).then(h=>{setHistorico(h);setLoadingHist(false);});},[user]);
  const formatarData=(ts)=>{if(!ts)return"—";try{const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});}catch{return"—";}};
  const handleClicarHistorico=(item)=>{if(item.dadosCompletos){try{const dados=JSON.parse(item.dadosCompletos);onCarregarConsulta(dados);setPage("consulta");}catch{}}};
  return(<div>
    <div style={{...S.card,background:`linear-gradient(135deg,${C.card} 0%,${C.green1}40 50%,${C.card} 100%)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}>
      <div style={{fontSize:"clamp(17px,4vw,24px)",fontWeight:800,marginBottom:4}}>{user?`Bem-vindo, ${user.displayName?.split(" ")[0]||"Usuário"}! 👋`:"Bem-vindo ao AgroMind! 🌿"}</div>
      <div style={{color:C.textMuted,fontSize:13,marginBottom:14}}>CAR · ITR · CCIR · GPS · IBAMA · PRODES · Clima · NASA · Cotações</div>
      {!user&&<div style={{background:`linear-gradient(135deg,${C.green1}60,${C.green2}20)`,border:`1px solid ${C.borderLight}`,borderRadius:12,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}><div><div style={{fontSize:13,fontWeight:700,color:C.accentBright}}>🎁 Cadastre-se e ganhe 3 créditos grátis!</div><div style={{fontSize:11,color:C.textMuted}}>Consulte fazendas, embargos, PRODES e muito mais.</div></div><button onClick={onNaoCadastrado} style={{padding:"8px 18px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>Cadastrar grátis →</button></div>}
      <BuscaBox onConsultar={onConsultarDireto} buscando={false} user={user} onNaoCadastrado={onNaoCadastrado}/>
    </div>
    {dadosConsulta?.sicar?.encontrado&&(<div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.green1}20)`,borderRadius:16,padding:"16px 20px",marginBottom:16,cursor:"pointer"}} onClick={()=>setPage("consulta")}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontSize:12,fontWeight:700,color:C.textMuted}}>📌 Última consulta</div><span style={{fontSize:11,color:C.accent,fontWeight:600}}>Ver detalhes →</span></div><div style={{fontSize:14,fontWeight:800,color:C.accentBright}}>{dadosConsulta.sicar.nome||"Imóvel Rural"}</div><div style={{fontSize:12,color:C.textMuted}}>📍 {dadosConsulta.sicar.municipio}, {dadosConsulta.sicar.uf} · {dadosConsulta.sicar.area}</div><div style={{display:"flex",gap:6,marginTop:8}}><span style={S.chip(dadosConsulta.score?.cor||C.accent)}>Score {dadosConsulta.score?.valor||0}/100</span><span style={S.chip(dadosConsulta.ibama?.temEmbargo?C.red:C.accent)}>{dadosConsulta.ibama?.temEmbargo?"Embargo":"Sem Embargo"}</span></div></div>)}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>{[{icon:"🔍",val:"1.847",label:"Consultas Hoje",color:C.accent},{icon:"🌾",val:"34.291",label:"Imóveis",color:C.yellow},{icon:"🚨",val:"128",label:"Alertas",color:C.red},{icon:"✅",val:"98,4%",label:"Disponibilidade",color:C.blue}].map((s,i)=>(<div key={i} style={{...S.card,display:"flex",alignItems:"center",gap:10,padding:"14px"}}><div style={{width:38,height:38,borderRadius:10,background:`${s.color}20`,border:`1px solid ${s.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{s.icon}</div><div><div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.val}</div><div style={{fontSize:10,color:C.textMuted,marginTop:1}}>{s.label}</div></div></div>))}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,marginBottom:14}}>
      <div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><span style={{fontSize:14,fontWeight:700}}>Consultas Recentes</span></div>{!user?(<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:36,marginBottom:8}}>🔍</div><div style={{fontSize:13,color:C.textMuted,marginBottom:12}}>Faça login para ver seu histórico</div><button onClick={onNaoCadastrado} style={{padding:"8px 20px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:12,cursor:"pointer"}}>Entrar / Cadastrar</button></div>):loadingHist?(<div style={{textAlign:"center",padding:"16px 0",color:C.textMuted,fontSize:12}}>Carregando...</div>):historico.length===0?(<div style={{textAlign:"center",padding:"16px 0"}}><div style={{fontSize:32,marginBottom:8}}>🔍</div><div style={{fontSize:13,color:C.textMuted}}>Nenhuma consulta ainda.</div></div>):(<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Fazenda","Data","Status"].map(h=><th key={h} style={S.tableTh}>{h}</th>)}</tr></thead><tbody>{historico.map((r,i)=>(<tr key={i} onClick={()=>handleClicarHistorico(r)} style={{cursor:r.dadosCompletos?"pointer":"default"}} onMouseOver={e=>{if(r.dadosCompletos)e.currentTarget.style.background=C.green1+"30";}} onMouseOut={e=>e.currentTarget.style.background="transparent"}><td style={S.tableTd}><div style={{fontWeight:600}}>{r.nome?.substring(0,18)}</div></td><td style={{...S.tableTd,color:C.textMuted,whiteSpace:"nowrap"}}>{formatarData(r.criadoEm)}</td><td style={S.tableTd}><span style={S.chip(r.status==="ok"?C.accent:r.status==="alerta"?C.yellow:C.red)}>{r.status==="ok"?"OK":r.status==="alerta"?"Alerta":"Embargo"}</span></td></tr>))}</tbody></table>)}</div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:12,textAlign:"center"}}>Score IA Médio</div><div style={S.scoreRing}><div style={S.scoreInner}><div style={{fontSize:24,fontWeight:900,color:C.accentBright,lineHeight:1}}>{dadosConsulta?.score?.valor||78}</div><div style={{fontSize:11,color:C.textMuted}}>/ 100</div></div></div></div>
        <div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Alertas Recentes</div>{[{msg:"Embargo IBAMA ativo",sub:"Faz. Santa Rosa MS",color:C.red,icon:"⛔"},{msg:"Desmatamento detectado",sub:"Sítio Bela Vista PA",color:C.orange,icon:"🛸"},{msg:"Moratória do Cerrado",sub:"Faz. Chapada BA",color:C.yellow,icon:"🌱"}].map((a,i)=>(<div key={i} style={{display:"flex",gap:8,padding:"8px 10px",borderRadius:8,marginBottom:6,border:`1px solid ${a.color}40`,background:`${a.color}08`}}><span>{a.icon}</span><div><div style={{fontSize:12,fontWeight:600,color:a.color}}>{a.msg}</div><div style={{fontSize:11,opacity:0.7}}>{a.sub}</div></div></div>))}</div>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
      <div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:13,fontWeight:700}}>Precipitação 30 dias</span><span style={S.chip(C.blue)}>Sinop/MT</span></div><div style={S.precipBar}>{precipData.map((v,i)=><div key={i} style={S.precipCol(v)}/>)}</div></div>
      <div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Composição do Solo</div>{[["Argila",52,C.orange],["Areia",30,C.yellow],["Silte",18,C.accent]].map(([l,p,c])=>(<div key={l} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:700,color:c}}>{p}%</span></div><div style={{height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}><div style={S.chartBar(p,c)}/></div></div>))}</div>
    </div>
  </div>);}

// ─── PLANOS PAGE ──────────────────────────────────────────────────
function PlanosPage({user}){const[loadingPlano,setLoadingPlano]=useState(null);useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get("pagamento")==="sucesso")alert("Pagamento aprovado! Seus créditos foram liberados.");},[]);const assinar=async(planoId)=>{if(!user){alert("Faça login primeiro.");return;}setLoadingPlano(planoId);try{const res=await fetch("/api/pagamento",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plano:planoId,userId:user?.uid,userEmail:user?.email})});const data=await res.json();if(data.sandboxInitPoint){window.location.href=data.sandboxInitPoint;}else{alert("Erro ao gerar pagamento.");}}catch{alert("Erro de conexão.");}setLoadingPlano(null);};const planos=[{id:"starter_mensal",title:"Starter",price:"49",per:"/mês",sub:"20 consultas inclusas",featured:false,features:["20 consultas/mês","CAR completo","Score IA básico","Mapa interativo","Suporte por e-mail"]},{id:"pro_mensal",title:"Pro Mensal",price:"99",per:"/mês",sub:"100 consultas inclusas",featured:true,badge:"MAIS VENDIDO",features:["100 consultas/mês","INCRA, IBAMA, PRODES","Score IA avançado","Laudo PDF automático","Chat IA com a fazenda","WhatsApp Bot","Exportar KML"]},{id:"pro_anual",title:"Pro Anual",price:"79",per:"/mês cobrado anualmente",sub:"100 consultas inclusas",featured:false,badge:"ECONOMIA 20%",features:["100 consultas/mês","Tudo do Pro Mensal","Relatórios avançados","Alertas automáticos","Suporte prioritário"]}];return(<div style={{padding:"20px 16px"}}><div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:"clamp(20px,5vw,30px)",fontWeight:900,marginBottom:8}}>Planos AGROMIND</div><div style={{color:C.textMuted,fontSize:13}}>Mais completo que o Dados Fazenda — Cancele quando quiser</div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,maxWidth:880,margin:"0 auto"}}>{planos.map((p)=>(<div key={p.id} style={{background:p.featured?`linear-gradient(160deg,${C.green1},${C.card})`:C.card,border:`1px solid ${p.featured?C.borderLight:C.border}`,borderRadius:18,padding:"24px 18px",position:"relative",boxShadow:p.featured?`0 0 40px ${C.green2}30`:"none"}}>{p.badge&&<div style={{position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",background:`linear-gradient(135deg,${C.accent},${C.green2})`,color:C.bg,fontSize:10,fontWeight:800,padding:"3px 12px",borderRadius:20,whiteSpace:"nowrap"}}>{p.badge}</div>}<div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{p.title}</div><div style={{fontSize:34,fontWeight:900,color:C.accentBright,lineHeight:1.1}}>R${p.price}</div><div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>{p.per}</div><div style={{fontSize:11,color:C.accent,fontWeight:600,marginBottom:16}}>{p.sub} — Extras R$2,00</div>{p.features.map(f=><div key={f} style={{display:"flex",gap:8,fontSize:12,marginBottom:7,color:C.textMuted}}><span style={{color:C.accent}}>✓</span>{f}</div>)}<button onClick={()=>assinar(p.id)} disabled={loadingPlano===p.id} style={{width:"100%",padding:"11px 0",borderRadius:10,border:p.featured?"none":`1px solid ${C.borderLight}`,background:p.featured?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent",color:p.featured?C.text:C.accentBright,fontWeight:700,fontSize:13,cursor:loadingPlano===p.id?"default":"pointer",marginTop:18,opacity:loadingPlano===p.id?0.7:1}}>{loadingPlano===p.id?"Aguarde...":p.featured?"Assinar Agora":"Começar"}</button></div>))}</div><div style={{textAlign:"center",marginTop:24,fontSize:12,color:C.textMuted}}>PIX · Cartão · Boleto — Pagamento 100% seguro via Mercado Pago</div></div>);}

// ─── ADMIN PAGE ───────────────────────────────────────────────────
function AdminPage(){const users=[{nome:"Carlos Mendes",email:"carlos@email.com",plano:"Anual Pro",consultas:87,status:"ativo"},{nome:"Ana Rodrigues",email:"ana@email.com",plano:"Mensal",consultas:23,status:"ativo"},{nome:"Faz. Pioneira",email:"contato@fazpioneira.com.br",plano:"Anual Pro",consultas:145,status:"ativo"},{nome:"João Pereira",email:"joao@email.com",plano:"Mensal",consultas:8,status:"inativo"}];return(<div style={{padding:"20px 14px"}}><div style={{marginBottom:18}}><div style={{fontSize:20,fontWeight:800,marginBottom:4}}>Painel Administrativo</div><div style={{fontSize:12,color:C.textMuted}}>Visão exclusiva do dono</div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:18}}>{[{label:"Usuários Ativos",val:"1.247",icon:"👥",color:C.accent},{label:"Receita Mensal",val:"R$ 87.430",icon:"💰",color:C.yellow},{label:"Consultas Hoje",val:"4.821",icon:"🔍",color:C.blue},{label:"Churn Mensal",val:"2,1%",icon:"📉",color:C.orange},{label:"Ticket Médio",val:"R$ 94,60",icon:"💳",color:C.accentBright},{label:"NPS",val:"72",icon:"⭐",color:C.yellow}].map((a,i)=>(<div key={i} style={{...S.card,borderLeft:`3px solid ${a.color}`,padding:"14px"}}><div style={{fontSize:18,marginBottom:4}}>{a.icon}</div><div style={{fontSize:18,fontWeight:900,color:a.color}}>{a.val}</div><div style={{fontSize:10,color:C.textMuted,marginTop:2}}>{a.label}</div></div>))}</div><div style={{...S.card,padding:0,overflow:"hidden"}}><div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,fontSize:14,fontWeight:700}}>Usuários Recentes</div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:360}}><thead><tr style={{background:`${C.green1}50`}}>{["Nome","Plano","Consultas","Status"].map(h=><th key={h} style={S.tableTh}>{h}</th>)}</tr></thead><tbody>{users.map((u,i)=><tr key={i}><td style={S.tableTd}><div style={{fontWeight:600}}>{u.nome}</div><div style={{fontSize:10,color:C.textMuted}}>{u.email}</div></td><td style={S.tableTd}><span style={S.chip(C.blue)}>{u.plano}</span></td><td style={S.tableTd}>{u.consultas}</td><td style={S.tableTd}><span style={S.chip(u.status==="ativo"?C.accent:C.textDim)}>{u.status}</span></td></tr>)}</tbody></table></div></div></div>);}

function PlaceholderPage({title,icon,desc}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:300,gap:16,padding:24,textAlign:"center"}}><div style={{fontSize:56}}>{icon}</div><div style={{fontSize:20,fontWeight:800}}>{title}</div><div style={{fontSize:13,color:C.textMuted,maxWidth:380}}>{desc}</div><div style={{...S.chip(C.accent),fontSize:13,padding:"6px 16px"}}>Em desenvolvimento</div></div>);}

// ─── SIDEBAR ──────────────────────────────────────────────────────
function SidebarContent({user,page,setPage,onClose,handleLogout,onCadastrar,creditos,cor}){
  return(<><div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🌿</div><div><div style={{fontSize:19,fontWeight:800,background:`linear-gradient(135deg,${C.accentBright},${C.accent})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}} translate="no">AGROMIND</div><div style={{fontSize:9,color:C.textMuted,letterSpacing:"2px",textTransform:"uppercase"}}>Inteligência Rural</div></div></div></div>
  <nav style={{flex:1,padding:"14px 10px",overflowY:"auto"}}>{NAV.map(sec=>(<div key={sec.section} style={{marginBottom:20}}><div style={{fontSize:10,color:C.textDim,letterSpacing:"1.5px",textTransform:"uppercase",padding:"0 8px",marginBottom:6}}>{sec.section}</div>{sec.items.map(item=>(<div key={item.id} translate="no" style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,cursor:"pointer",marginBottom:2,background:page===item.id?`${C.green1}80`:"transparent",border:page===item.id?`1px solid ${C.border}`:"1px solid transparent",color:page===item.id?C.accentBright:C.textMuted,fontSize:13.5,fontWeight:page===item.id?600:400,WebkitTapHighlightColor:"transparent"}} onClick={()=>{setPage(item.id);onClose&&onClose();}}><span style={{fontSize:16,width:20,textAlign:"center"}}>{item.icon}</span>{item.label}</div>))}</div>))}</nav>
  <div style={{padding:"14px 10px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>{user?(<><div style={{background:`linear-gradient(135deg,${C.green1},${C.card})`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2}}>👤 {user.displayName||"Usuário"}</div><div style={{fontSize:11,color:C.textMuted,marginBottom:8}}>{user.email}</div><button style={{width:"100%",padding:"7px 0",borderRadius:8,background:`${C.red}15`,border:`1px solid ${C.red}30`,color:C.red,fontSize:12,fontWeight:600,cursor:"pointer"}} onClick={handleLogout}>Sair da conta</button></div><div style={{background:`${C.green1}30`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.textMuted}}>Créditos</span><span style={{fontSize:16,fontWeight:900,color:cor||C.accent}}>{creditos||0}</span></div></>):(<div style={{display:"flex",flexDirection:"column",gap:8}}><button onClick={onCadastrar} style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:800,fontSize:13,cursor:"pointer"}}>🚀 Criar conta grátis</button><button onClick={onCadastrar} style={{width:"100%",padding:"9px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontWeight:600,fontSize:12,cursor:"pointer"}}>Já tenho conta</button></div>)}</div></>);
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────
export default function App(){
  const[user,setUser]=useState(null);const[authChecked,setAuthChecked]=useState(false);const[page,setPage]=useState("dashboard");const[drawerOpen,setDrawerOpen]=useState(false);const[showCadastro,setShowCadastro]=useState(false);const[showPlanos,setShowPlanos]=useState(false);const[dadosConsulta,setDadosConsulta]=useState(null);
  useEffect(()=>{const unsub=onAuthStateChanged(auth,(u)=>{setUser(u);setAuthChecked(true);});return unsub;},[]);
  const{creditos,plano,cor,usarCredito}=useCredits(user);
  if(!authChecked)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,background:C.bg}}><div style={{fontSize:48}}>🌿</div><div style={{fontSize:18,fontWeight:700,color:C.accentBright}}>Carregando AGROMIND...</div></div>);
  const handleLogout=async()=>{await signOut(auth);setUser(null);setDadosConsulta(null);};
  const allItems=NAV.flatMap(s=>s.items);
  const isFullPage=["mapa","planos","admin","ia","consulta","embargos","prodes","precipitacao"].includes(page);
  const handleNaoCadastrado=()=>setShowCadastro(true);
  const handleSemCreditos=()=>setShowPlanos(true);
  const initials=user?.displayName?user.displayName.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase():null;
  const pageMap={
    dashboard:<Dashboard user={user} setPage={setPage} onNaoCadastrado={handleNaoCadastrado} dadosConsulta={dadosConsulta} onCarregarConsulta={setDadosConsulta} onConsultarDireto={(tipo,val)=>{setPage("consulta");setTimeout(()=>window.dispatchEvent(new CustomEvent("agromind-consultar",{detail:{tipo,val}})),100);}}/>,
    consulta:<ConsultaPage user={user} usarCredito={usarCredito} creditos={creditos} onSemCreditos={handleSemCreditos} setPage={setPage} onNaoCadastrado={handleNaoCadastrado} onResultado={setDadosConsulta} dadosConsulta={dadosConsulta}/>,
    mapa:<MapaPage dadosConsulta={dadosConsulta}/>,
    ia:<IAPage user={user} usarCredito={usarCredito} creditos={creditos} onSemCreditos={handleSemCreditos} onNaoCadastrado={handleNaoCadastrado} dadosConsulta={dadosConsulta}/>,
    embargos:<EmbargoPage/>,prodes:<ProdesPage/>,precipitacao:<PrecipitacaoPage/>,
    whatsapp:<PlaceholderPage icon="💬" title="WhatsApp Bot" desc="Consulte fazendas direto pelo WhatsApp. Em breve!"/>,
    planos:<PlanosPage user={user}/>,admin:<AdminPage/>,
  };
  return(
    <div style={S.app} translate="no">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0f0a;overflow-x:hidden;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:#0a0f0a;}::-webkit-scrollbar-thumb{background:#1e3a1e;border-radius:3px;}input::placeholder{color:#3d6b3d;}textarea::placeholder{color:#3d6b3d;}.agro-sidebar{position:fixed;top:0;left:0;width:240px;height:100vh;background:${C.surface};border-right:1px solid ${C.border};display:flex;flex-direction:column;z-index:100;}.agro-main{margin-left:240px;min-height:100vh;display:flex;flex-direction:column;}.agro-topbar{background:${C.surface}ee;backdrop-filter:blur(12px);border-bottom:1px solid ${C.border};padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50;}.agro-content{padding:24px;flex:1;}.agro-content-full{flex:1;}.agro-hamburger{display:none;}.agro-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:200;}.agro-overlay.open{display:block;}.agro-drawer{display:none;position:fixed;top:0;left:0;bottom:0;width:280px;background:${C.surface};z-index:300;flex-direction:column;transform:translateX(-100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);overflow:hidden;}.agro-drawer.open{transform:translateX(0);}.agro-bottom-nav{display:none;}@media(max-width:768px){.agro-sidebar{display:none!important;}.agro-hamburger{display:flex!important;}.agro-drawer{display:flex!important;}.agro-main{margin-left:0!important;width:100%!important;}.agro-content{padding:14px 12px 80px!important;}.agro-content-full{padding-bottom:64px;}.agro-bottom-nav{display:flex!important;position:fixed;bottom:0;left:0;right:0;background:${C.surface};border-top:1px solid ${C.border};z-index:100;height:64px;}}@supports(padding-bottom:env(safe-area-inset-bottom)){@media(max-width:768px){.agro-bottom-nav{height:calc(64px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);}}}`}</style>
      {showCadastro&&<PopupCadastro onFechar={()=>setShowCadastro(false)}/>}
      {showPlanos&&<PopupPlanos onFechar={()=>setShowPlanos(false)} onVerPlanos={()=>setPage("planos")}/>}
      <div className={`agro-overlay ${drawerOpen?"open":""}`} onClick={()=>setDrawerOpen(false)}/>
      <div className={`agro-drawer ${drawerOpen?"open":""}`}><SidebarContent user={user} page={page} setPage={setPage} onClose={()=>setDrawerOpen(false)} handleLogout={handleLogout} onCadastrar={()=>{setDrawerOpen(false);setShowCadastro(true);}} creditos={creditos} cor={cor}/></div>
      <aside className="agro-sidebar"><SidebarContent user={user} page={page} setPage={setPage} handleLogout={handleLogout} onCadastrar={()=>setShowCadastro(true)} creditos={creditos} cor={cor}/></aside>
      <div className="agro-main">
        <div className="agro-topbar">
          <div style={{display:"flex",alignItems:"center",gap:10}}><button className="agro-hamburger" onClick={()=>setDrawerOpen(true)} style={{width:40,height:40,borderRadius:10,background:C.card,border:`1px solid ${C.border}`,color:C.text,cursor:"pointer",fontSize:20,alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>☰</button><div style={{fontSize:"clamp(14px,3vw,17px)",fontWeight:700}} translate="no">{allItems.find(i=>i.id===page)?.label||"Dashboard"}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>{user?(<><div style={{display:"flex",alignItems:"center",gap:4,background:`${cor||C.accent}15`,border:`1px solid ${cor||C.accent}40`,borderRadius:20,padding:"4px 10px"}}><span style={{fontSize:11}}>⚡</span><span style={{fontSize:12,fontWeight:700,color:cor||C.accent}}>{creditos}</span></div><div style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px 5px 5px"}}><div style={{width:26,height:26,borderRadius:6,background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{initials}</div><span style={{fontSize:13,fontWeight:600}}>{user.displayName?.split(" ")[0]||"Usuário"}</span></div></>):(<><button onClick={()=>setShowCadastro(true)} style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontWeight:600,fontSize:12,cursor:"pointer"}}>Entrar</button><button onClick={()=>setShowCadastro(true)} style={{padding:"7px 14px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:12,cursor:"pointer"}}>Cadastrar grátis</button></>)}</div>
        </div>
        <div className={isFullPage?"agro-content-full":"agro-content"}>{pageMap[page]||pageMap.dashboard}</div>
      </div>
      <nav className="agro-bottom-nav">{BOTTOM_NAV.map(item=>(<div key={item.id} onClick={()=>setPage(item.id)} translate="no" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",color:page===item.id?C.accent:C.textMuted,borderTop:page===item.id?`2px solid ${C.accent}`:"2px solid transparent",paddingTop:4,WebkitTapHighlightColor:"transparent",userSelect:"none"}}><span style={{fontSize:20}}>{item.icon}</span><span style={{fontSize:9,fontWeight:page===item.id?700:400}}>{item.label}</span></div>))}</nav>
    </div>
  );
}