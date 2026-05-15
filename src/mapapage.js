import { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const C = {
  bg:"#0a0f0a", surface:"#0f1a0f", card:"#111d11",
  border:"#1e3a1e", borderLight:"#2a4f2a",
  green1:"#0d5c2e", green2:"#12803f", green3:"#16a34a",
  accent:"#22c55e", accentBright:"#4ade80",
  text:"#e8f5e9", textMuted:"#6b9e6b", textDim:"#3d6b3d",
  yellow:"#fbbf24", red:"#ef4444", orange:"#f97316", blue:"#3b82f6",
  purple:"#a78bfa",
};

const PROXY_URL = "https://agromind-proxy.agromindpro.workers.dev";

const CAMADAS = [
  { id:"car",    label:"Polígono CAR",     icon:"🌿", color:"#22c55e", ativa:true  },
  { id:"sigef",  label:"SIGEF/INCRA",      icon:"🗂️", color:"#3b82f6", ativa:true  },
  { id:"app",    label:"APP",              icon:"💧", color:"#60a5fa", ativa:true  },
  { id:"rl",     label:"Reserva Legal",    icon:"🌱", color:"#4ade80", ativa:true  },
  { id:"ibama",  label:"Embargos IBAMA",   icon:"⛔", color:"#ef4444", ativa:false },
  { id:"prodes", label:"PRODES/INPE",      icon:"📡", color:"#f97316", ativa:false },
  { id:"ti",     label:"Terras Indígenas", icon:"🏕️", color:"#a78bfa", ativa:false },
  { id:"uc",     label:"Unid. Conservação",icon:"🌳", color:"#34d399", ativa:false },
];

const TIPOS_BUSCA = [
  { id:"car",          label:"CAR",          icon:"📋", placeholder:"Ex: MA-2107357-003AE88CE99B42349CC04EC7C12DFBC6" },
  { id:"itr",          label:"ITR",          icon:"💰", placeholder:"Ex: 12.345.678-9" },
  { id:"ccir",         label:"CCIR",         icon:"📄", placeholder:"Ex: 110.035.031.500-2" },
  { id:"gps",          label:"GPS",          icon:"📍", placeholder:"Ex: -11.8456, -55.1987" },
  { id:"fazenda",      label:"Fazenda",      icon:"🌾", placeholder:"Ex: Fazenda Horizonte Verde" },
  { id:"proprietario", label:"Proprietário", icon:"👤", placeholder:"Ex: João da Silva" },
];

const FAZENDA_MOCK = {
  nome:"Fazenda Horizonte Verde", car:"MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C",
  municipio:"Sinop, MT", area:"1.284,7 ha", ccir:"800.429.7412-9",
  itr:"R$ 2.847,00/ano", proprietario:"Agropecuária Horizonte Ltda.",
  modulos:"42,8 módulos fiscais", sigef:"Certificado",
  app:"183,4 ha (14,3%)", rl:"399,8 ha (31,1%)",
  coordenadas:{ lat:-11.8456, lng:-55.1987 }, embargo:false, prodes:false,
};

function dadosParaFazenda(dados) {
  if (!dados) return null;
  const proprietario = dados.sicar?.proprietario || dados.sigef?.denominacao || null;
  const nome = dados.sicar?.nome || dados.sigef?.denominacao || dados.car || "Imóvel Rural";
  const ccir = dados.sigef?.ccir || dados.sicar?.ccir || null;
  return {
    nome, car: dados.car || dados.sicar?.car || "—",
    municipio: dados.sicar?.municipio ? `${dados.sicar.municipio}, ${dados.sicar.uf||""}` : (dados.sigef?.municipio ? `${dados.sigef.municipio}, ${dados.sigef.uf||""}` : "—"),
    area: dados.sicar?.area || dados.sigef?.area || "—",
    areaHa: dados.sicar?.areaHa || null,
    app: dados.sicar?.app || "—", rl: dados.sicar?.rl || "—",
    proprietario: proprietario || "—",
    modulos: dados.sicar?.modulos || "—",
    sigef: dados.sigef?.situacaoLabel || (dados.sigef?.encontrado ? "Localizado" : "—"),
    ccir: ccir || "—",
    itr: dados.sicar?.nirf ? `NIRF: ${dados.sicar.nirf}` : "—",
    situacao: dados.sicar?.situacaoLabel || "—",
    embargo: dados.ibama?.temEmbargo || false,
    embargos: dados.ibama?.embargos || [],
    prodes: dados.prodes?.temAlerta || false,
    alertasProdes: dados.prodes?.alertas || [],
    coordenadas: dados.coordenadas?.lat ? { lat: dados.coordenadas.lat, lng: dados.coordenadas.lng } : FAZENDA_MOCK.coordenadas,
  };
}

// ─── MEDIÇÃO — funções ─────────────────────────────────────────────
function calcularDistanciaM(lat1, lng1, lat2, lng2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calcularAreaHa(pontos) {
  if (pontos.length < 3) return 0;
  let area = 0;
  const n = pontos.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = pontos[i][1] * Math.PI / 180 * 6371000;
    const yi = pontos[i][0] * Math.PI / 180 * 6371000;
    const xj = pontos[j][1] * Math.PI / 180 * 6371000;
    const yj = pontos[j][0] * Math.PI / 180 * 6371000;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2) / 10000; // m² para ha
}

function formatarDistancia(metros) {
  if (metros < 1000) return `${metros.toFixed(1)} m`;
  return `${(metros/1000).toFixed(3)} km`;
}

function formatarArea(ha) {
  if (ha < 1) return `${(ha * 10000).toFixed(0)} m²`;
  return `${ha.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ha`;
}

// ─── BUSCAR DADOS DO VIZINHO ──────────────────────────────────────
async function buscarDadosVizinho(codImovel) {
  if (!codImovel) return null;
  try {
    const match = codImovel.match(/^([A-Z]{2})-/i);
    if (!match) return null;
    const uf = match[1].toLowerCase();
    const sicarUrl = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sicar:sicar_imoveis_${uf}&CQL_FILTER=${encodeURIComponent(`cod_imovel = '${codImovel.toUpperCase()}'`)}&outputFormat=application%2Fjson&maxFeatures=1`;
    const resp = await fetch(`${PROXY_URL}?url=${encodeURIComponent(sicarUrl)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const features = data.features || [];
    if (!features.length) return null;
    const props = features[0].properties;
    return {
      car: props.cod_imovel || codImovel,
      nome: props.nom_imovel || "Imóvel Rural",
      municipio: props.nom_municipio || "—",
      uf: props.sig_uf || "",
      area: props.num_area ? `${Number(props.num_area).toLocaleString("pt-BR",{maximumFractionDigits:1})} ha` : "—",
      proprietario: props.nom_proprietario || "—",
      situacaoLabel: { AT:"Ativo", CA:"Cancelado", SU:"Suspenso", PE:"Pendente", AN:"Análise" }[props.ind_status] || "Ativo",
      modulos: props.num_modulos_fiscais ? `${Number(props.num_modulos_fiscais).toFixed(1)} módulos fiscais` : "—",
      ccir: props.num_ccir || "—",
      app: props.num_area_app ? `${Number(props.num_area_app).toLocaleString("pt-BR",{maximumFractionDigits:1})} ha` : "—",
      rl: props.num_area_rl ? `${Number(props.num_area_rl).toLocaleString("pt-BR",{maximumFractionDigits:1})} ha` : "—",
    };
  } catch { return null; }
}

const chip = (txt, color) => (
  <span style={{display:"inline-flex",alignItems:"center",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:`${color}20`,color,border:`1px solid ${color}30`}}>{txt}</span>
);

// ─── INFOS DOS CAMPOS ─────────────────────────────────────────────
function getInfoCampo(campo, fazenda, dadosReais) {
  const configs = {
    car:{ titulo:"📋 Código CAR", cor:C.accent, conteudo:()=>(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>O CAR é o registro eletrônico obrigatório para todos os imóveis rurais brasileiros (Lei 12.651/2012).</div><div style={{background:C.bg,borderRadius:8,padding:10,marginBottom:12,wordBreak:"break-all",fontSize:12,color:C.accentBright,fontFamily:"monospace"}}>{fazenda.car||"—"}</div>{[["Situação",fazenda.situacao],["Município",fazenda.municipio],["Área Total",fazenda.area]].map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:600,color:C.text}}>{v||"—"}</span></div>))}<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}><button onClick={()=>{navigator.clipboard?.writeText(fazenda.car||"");alert("CAR copiado!");}} style={{flex:1,padding:"8px 0",borderRadius:8,background:`${C.accent}20`,border:`1px solid ${C.accent}40`,color:C.accent,fontSize:12,fontWeight:600,cursor:"pointer"}}>📋 Copiar CAR</button><a href="https://consultapublica.car.gov.br/publico/imoveis/index" target="_blank" rel="noreferrer" style={{flex:1,padding:"8px 0",borderRadius:8,background:`${C.blue}20`,border:`1px solid ${C.blue}40`,color:C.blue,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>🌐 SICAR ↗</a></div></div>)},
    ccir:{ titulo:"📄 CCIR", cor:C.blue, conteudo:()=>(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>O CCIR é emitido pelo INCRA e comprova o cadastro do imóvel rural. Obrigatório para venda, arrendamento e herança.</div><div style={{background:C.bg,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.blue,fontFamily:"monospace",textAlign:"center",fontWeight:700}}>{fazenda.ccir!=="—"?fazenda.ccir:"Não informado pelo SICAR/SIGEF"}</div>{fazenda.ccir==="—"?(<div style={{padding:"10px 12px",background:`${C.yellow}15`,border:`1px solid ${C.yellow}40`,borderRadius:8,fontSize:11,color:C.yellow}}>⚠️ Não disponibilizado pelo SICAR. Consulte diretamente no INCRA.</div>):(<button onClick={()=>{navigator.clipboard?.writeText(fazenda.ccir);alert("CCIR copiado!");}} style={{width:"100%",padding:"8px 0",borderRadius:8,background:`${C.blue}20`,border:`1px solid ${C.blue}40`,color:C.blue,fontSize:12,fontWeight:600,cursor:"pointer"}}>📋 Copiar CCIR</button>)}<a href="https://sncr.serpro.gov.br/" target="_blank" rel="noreferrer" style={{display:"block",marginTop:8,padding:"8px 0",borderRadius:8,background:`${C.blue}10`,border:`1px solid ${C.blue}30`,color:C.blue,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>🌐 Consultar INCRA ↗</a></div>)},
    itr:{ titulo:"💰 ITR / NIRF", cor:C.yellow, conteudo:()=>(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>O ITR é cobrado anualmente pela Receita Federal. O NIRF é o número de inscrição do imóvel rural.</div><div style={{background:C.bg,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.yellow,fontFamily:"monospace",textAlign:"center",fontWeight:700}}>{fazenda.itr||"Não informado"}</div>{fazenda.areaHa&&(<div style={{background:`${C.yellow}10`,border:`1px solid ${C.yellow}30`,borderRadius:8,padding:"10px 12px",marginBottom:8}}><div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>📊 Estimativa ITR (Lei 9.393/96)</div><div style={{fontSize:13,fontWeight:700,color:C.yellow}}>~R$ {(fazenda.areaHa*2.2).toLocaleString("pt-BR",{minimumFractionDigits:2})} / ano</div></div>)}<a href="https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/itr" target="_blank" rel="noreferrer" style={{display:"block",padding:"8px 0",borderRadius:8,background:`${C.yellow}10`,border:`1px solid ${C.yellow}30`,color:C.yellow,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>🌐 Receita Federal — ITR ↗</a></div>)},
    proprietario:{ titulo:"👤 Proprietário", cor:C.purple, conteudo:()=>(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>Dados do proprietário conforme SICAR ou SIGEF/INCRA.</div><div style={{background:C.bg,borderRadius:8,padding:12,marginBottom:12,textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,color:C.accentBright,marginBottom:4}}>{fazenda.proprietario!=="—"?fazenda.proprietario:"Não informado"}</div><div style={{fontSize:11,color:C.textMuted}}>{fazenda.municipio}</div></div>{fazenda.proprietario==="—"?(<div style={{padding:"10px 12px",background:`${C.yellow}15`,border:`1px solid ${C.yellow}40`,borderRadius:8,fontSize:11,color:C.yellow}}>⚠️ Não disponibilizado pelo SICAR nem pelo SIGEF para este imóvel. Dados privados não são públicos.</div>):(<button onClick={()=>{navigator.clipboard?.writeText(fazenda.proprietario);alert("Nome copiado!");}} style={{width:"100%",padding:"8px 0",borderRadius:8,background:`${C.purple}20`,border:`1px solid ${C.purple}40`,color:C.purple,fontSize:12,fontWeight:600,cursor:"pointer"}}>📋 Copiar Nome</button>)}</div>)},
    app:{ titulo:"💧 APP", cor:C.blue, conteudo:()=>{const areaHa=fazenda.areaHa,appHa=parseFloat((fazenda.app||"0").replace(/[^\d,]/g,"").replace(",","."))||null,pct=areaHa&&appHa?((appHa/areaHa)*100).toFixed(1):null;return(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>Área de Preservação Permanente. Protege recursos hídricos, encostas e topos de morro (Código Florestal Lei 12.651/2012).</div><div style={{background:`${C.blue}10`,border:`1px solid ${C.blue}30`,borderRadius:10,padding:"14px",marginBottom:12,textAlign:"center"}}><div style={{fontSize:24,fontWeight:900,color:C.blue}}>{fazenda.app||"—"}</div>{pct&&<div style={{fontSize:12,color:C.textMuted,marginTop:4}}>{pct}% da área total</div>}</div>{[["Rios até 10m","30m de cada margem"],["Rios 10-50m","50m de cada margem"],["Nascentes","50m de raio"],["Topo de morro","1/3 superior"]].map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.textMuted}}>{l}</span><span style={{color:C.blue,fontWeight:600}}>{v}</span></div>))}</div>);}},
    rl:{ titulo:"🌱 Reserva Legal", cor:C.accentBright, conteudo:()=>{const areaHa=fazenda.areaHa,rlHa=parseFloat((fazenda.rl||"0").replace(/[^\d,]/g,"").replace(",","."))||null,pct=areaHa&&rlHa?((rlHa/areaHa)*100).toFixed(1):null;return(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>Vegetação nativa obrigatória. Percentual varia por bioma: 80% Amazônia, 35% Cerrado, 20% demais.</div><div style={{background:`${C.accentBright}10`,border:`1px solid ${C.accentBright}30`,borderRadius:10,padding:"14px",marginBottom:12,textAlign:"center"}}><div style={{fontSize:24,fontWeight:900,color:C.accentBright}}>{fazenda.rl||"—"}</div>{pct&&<div style={{fontSize:12,color:C.textMuted,marginTop:4}}>{pct}% da área total</div>}</div>{[["🌿 Amazônia","80%","#22c55e"],["🏜️ Cerrado","35%","#fbbf24"],["🌾 Demais","20%","#3b82f6"]].map(([b,p,c])=>(<div key={b} style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",marginBottom:4,borderRadius:6,background:`${c}10`,border:`1px solid ${c}20`,fontSize:11}}><span style={{color:C.textMuted}}>{b}</span><span style={{fontWeight:700,color:c}}>{p}</span></div>))}</div>);}},
    ibama:{ titulo:"⛔ Embargos IBAMA", cor:C.red, conteudo:()=>{const embargos=fazenda.embargos||dadosReais?.ibama?.embargos||[],temEmbargo=fazenda.embargo||embargos.length>0;return(<div><div style={{marginBottom:12}}><span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700,background:temEmbargo?`${C.red}20`:`${C.accent}20`,color:temEmbargo?C.red:C.accent,border:`1px solid ${temEmbargo?C.red:C.accent}40`}}>{temEmbargo?`⛔ ${embargos.length} embargo(s)`:"✅ Sem embargos"}</span></div>{embargos.length>0?embargos.map((e,i)=>(<div key={i} style={{padding:"10px 12px",marginBottom:8,background:`${C.red}08`,border:`1px solid ${C.red}30`,borderRadius:8}}><div style={{fontSize:12,fontWeight:700,color:C.red}}>Auto nº {e.numero||"—"}</div>{[["Tipo",e.tipo],["Data",e.data],["Área",e.area]].filter(([,v])=>v).map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"2px 0"}}><span style={{color:C.textMuted}}>{l}</span><span style={{color:C.text}}>{v}</span></div>))}</div>)):(<div style={{textAlign:"center",padding:"16px 0"}}><div style={{fontSize:36,marginBottom:8}}>✅</div><div style={{fontSize:13,color:C.accent,fontWeight:700}}>Nenhum embargo</div></div>)}<a href="https://ibama.gov.br" target="_blank" rel="noreferrer" style={{display:"block",marginTop:8,padding:"8px 0",borderRadius:8,background:`${C.red}10`,border:`1px solid ${C.red}30`,color:C.red,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>🌐 IBAMA ↗</a></div>);}},
    prodes:{ titulo:"📡 PRODES/INPE", cor:C.orange, conteudo:()=>{const alertas=fazenda.alertasProdes||dadosReais?.prodes?.alertas||[],temAlerta=fazenda.prodes||alertas.length>0;return(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>Monitora desmatamento por satélite. DETER emite alertas em tempo real na Amazônia Legal.</div><div style={{marginBottom:12}}><span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700,background:temAlerta?`${C.orange}20`:`${C.accent}20`,color:temAlerta?C.orange:C.accent,border:`1px solid ${temAlerta?C.orange:C.accent}40`}}>{temAlerta?`🔴 ${alertas.length} alerta(s)`:"🌳 Sem alertas"}</span></div>{!temAlerta&&(<div style={{textAlign:"center",padding:"16px 0"}}><div style={{fontSize:36,marginBottom:8}}>🌳</div><div style={{fontSize:13,color:C.accent,fontWeight:700}}>Sem alertas DETER/PRODES</div></div>)}<a href="http://terrabrasilis.dpi.inpe.br" target="_blank" rel="noreferrer" style={{display:"block",marginTop:8,padding:"8px 0",borderRadius:8,background:`${C.orange}10`,border:`1px solid ${C.orange}30`,color:C.orange,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>🌐 TerraBrasilis ↗</a></div>);}},
    sigef:{ titulo:"🗂️ SIGEF/INCRA", cor:C.blue, conteudo:()=>{const certificado=dadosReais?.sigef?.certificado,s=dadosReais?.sigef;return(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>O SIGEF do INCRA certifica o georreferenciamento. Obrigatório para regularização e registro em cartório.</div><div style={{marginBottom:12,textAlign:"center"}}><span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:20,fontSize:13,fontWeight:700,background:certificado?`${C.accent}20`:`${C.yellow}20`,color:certificado?C.accent:C.yellow,border:`1px solid ${certificado?C.accent:C.yellow}40`}}>{certificado?"✅ Certificado":"⚠️ Não certificado"}</span></div>{s?.encontrado&&([["Denominação",s.denominacao],["Área",s.area],["Município",s.municipio],["CCIR",s.ccir]].filter(([,v])=>v).map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}><span style={{color:C.textMuted}}>{l}</span><span style={{color:C.text,fontWeight:600}}>{v}</span></div>)))}<a href="https://sigef.incra.gov.br" target="_blank" rel="noreferrer" style={{display:"block",marginTop:8,padding:"8px 0",borderRadius:8,background:`${C.blue}10`,border:`1px solid ${C.blue}30`,color:C.blue,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>🌐 SIGEF ↗</a></div>);}},
    modulos:{ titulo:"📐 Módulos Fiscais", cor:C.yellow, conteudo:()=>{const m=parseFloat((fazenda.modulos||"0").replace(/[^\d,\.]/g,"").replace(",","."))||null,cl=!m?"—":m<1?"Minifúndio":m<=4?"Pequena Propriedade":m<=15?"Média Propriedade":"Grande Propriedade",cc=!m?C.textMuted:m<1?C.red:m<=4?C.accent:m<=15?C.yellow:C.orange;return(<div><div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>Classifica o imóvel por tamanho relativo ao módulo fiscal do município.</div><div style={{background:`${C.yellow}10`,border:`1px solid ${C.yellow}30`,borderRadius:10,padding:"14px",marginBottom:12,textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:C.yellow}}>{fazenda.modulos||"—"}</div><div style={{fontSize:13,fontWeight:700,color:cc,marginTop:6}}>{cl}</div></div>{[["Minifúndio","< 1 módulo",C.red],["Pequena","1-4 módulos",C.accent],["Média","4-15 módulos",C.yellow],["Grande","> 15 módulos",C.orange]].map(([c,d,cor])=>(<div key={c} style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",marginBottom:3,borderRadius:6,background:cl===c?`${cor}15`:"transparent",fontSize:11}}><span style={{color:cl===c?cor:C.textMuted,fontWeight:cl===c?700:400}}>{c}</span><span style={{color:C.textMuted,fontSize:10}}>{d}</span></div>))}</div>);}}
  };
  return configs[campo] || null;
}

// ─── DRAWER VIZINHO ───────────────────────────────────────────────
function DrawerVizinho({ vizinho, onFechar }) {
  const aberto = !!vizinho;
  return (
    <>
      {aberto && <div onClick={onFechar} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",zIndex:1500,backdropFilter:"blur(2px)"}}/>}
      <div style={{position:"absolute",top:0,right:0,bottom:0,width:320,background:C.surface,borderLeft:`1px solid ${C.border}`,zIndex:1600,display:"flex",flexDirection:"column",transform:aberto?"translateX(0)":"translateX(100%)",transition:"transform 0.28s cubic-bezier(0.4,0,0.2,1)",boxShadow:aberto?"-8px 0 32px rgba(0,0,0,0.4)":"none"}}>
        <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`,background:`linear-gradient(135deg,${C.orange}18,transparent)`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:800,color:C.orange}}>🌾 CAR Vizinho</div>
            <button onClick={onFechar} style={{width:28,height:28,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,color:C.textMuted,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          {vizinho ? (
            <div>
              <div style={{fontSize:15,fontWeight:800,color:C.accentBright,marginBottom:4}}>{vizinho.nome||"Imóvel Rural"}</div>
              <div style={{fontSize:12,color:C.textMuted,marginBottom:12}}>📍 {vizinho.municipio}{vizinho.uf?`, ${vizinho.uf}`:""}</div>
              {[["CAR",vizinho.car?.length>22?vizinho.car.substring(0,22)+"...":vizinho.car],["Área",vizinho.area],["Proprietário",vizinho.proprietario],["Situação",vizinho.situacaoLabel],["Módulos",vizinho.modulos],["CCIR",vizinho.ccir],["APP",vizinho.app],["Res. Legal",vizinho.rl]].filter(([,v])=>v&&v!=="—").map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}>
                  <span style={{color:C.textMuted}}>{l}</span>
                  <span style={{fontWeight:600,color:C.text,textAlign:"right",maxWidth:160}}>{v}</span>
                </div>
              ))}
              <button onClick={()=>{navigator.clipboard?.writeText(vizinho.car||"");alert("CAR copiado!");}} style={{width:"100%",padding:"8px 0",borderRadius:8,background:`${C.orange}20`,border:`1px solid ${C.orange}40`,color:C.orange,fontSize:12,fontWeight:600,cursor:"pointer",marginTop:12}}>📋 Copiar CAR Vizinho</button>
            </div>
          ) : <div style={{textAlign:"center",padding:"24px 0",color:C.textMuted}}>Carregando...</div>}
        </div>
      </div>
    </>
  );
}

function InfoRowClicavel({ label, value, campo, onClicar }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={()=>onClicar(campo)} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{display:"flex",justifyContent:"space-between",padding:"6px 6px 6px 8px",borderBottom:`1px solid ${C.border}`,fontSize:11,cursor:"pointer",borderRadius:6,margin:"1px 0",background:hover?`${C.accent}08`:"transparent",transition:"background 0.15s"}}>
      <span style={{color:C.textMuted,display:"flex",alignItems:"center",gap:4}}>{label}<span style={{fontSize:9,color:C.textDim,opacity:hover?1:0,transition:"opacity 0.15s"}}>▶</span></span>
      <span style={{fontWeight:600,color:hover?C.accentBright:C.text,textAlign:"right",maxWidth:140,transition:"color 0.15s"}}>{value??"—"}</span>
    </div>
  );
}

function PainelDetalhe({ campo, fazenda, dadosReais, onFechar }) {
  const info = campo ? getInfoCampo(campo, fazenda, dadosReais) : null;
  const aberto = !!campo;
  return (
    <>
      {aberto && <div onClick={onFechar} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",zIndex:1500,backdropFilter:"blur(2px)"}}/>}
      <div style={{position:"absolute",top:0,right:0,bottom:0,width:320,background:C.surface,borderLeft:`1px solid ${C.border}`,zIndex:1600,display:"flex",flexDirection:"column",transform:aberto?"translateX(0)":"translateX(100%)",transition:"transform 0.28s cubic-bezier(0.4,0,0.2,1)",boxShadow:aberto?"-8px 0 32px rgba(0,0,0,0.4)":"none"}}>
        <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`,background:info?`linear-gradient(135deg,${info.cor}18,transparent)`:C.surface,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:800,color:info?.cor||C.accentBright}}>{info?.titulo||""}</div>
            <button onClick={onFechar} style={{width:28,height:28,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,color:C.textMuted,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:16}}>{info?.conteudo?.()}</div>
      </div>
    </>
  );
}

// ─── SOBREPOSIÇÕES ────────────────────────────────────────────────
async function buscarSobreposicoes(lat, lng, car, map, L, onVizinhoClick) {
  if (!lat || !lng || !map || !L) return { ti:[], uc:[], vizinhos:[] };
  const buffer = 0.1, bbox = `${lng-buffer},${lat-buffer},${lng+buffer},${lat+buffer}`;
  const resultados = { ti:[], uc:[], vizinhos:[] };
  try {
    const resp = await fetch(`https://geoserver.funai.gov.br/geoserver/Funai/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Funai:tis_poligonais&CQL_FILTER=BBOX(geom,${bbox})&outputFormat=application/json&maxFeatures=10`, { signal:AbortSignal.timeout(8000) });
    if (resp.ok) { const data = await resp.json(); (data.features||[]).forEach(f=>{ if(f.geometry)L.geoJSON(f,{style:{color:"#a78bfa",weight:2,fillColor:"#a78bfa",fillOpacity:0.2,dashArray:"6,4"}}).bindPopup(`<b>🏕️ Terra Indígena</b><br>${f.properties?.terrai_nom||"—"}`).addTo(map); }); resultados.ti=data.features||[]; }
  } catch {}
  try {
    const resp = await fetch(`https://geoservicos.inde.gov.br/geoserver/ICMBio/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICMBio:UC_Fed_Pol_Jun2019&CQL_FILTER=BBOX(geom,${bbox})&outputFormat=application/json&maxFeatures=10`, { signal:AbortSignal.timeout(8000) });
    if (resp.ok) { const data = await resp.json(); (data.features||[]).forEach(f=>{ if(f.geometry)L.geoJSON(f,{style:{color:"#34d399",weight:2,fillColor:"#34d399",fillOpacity:0.2,dashArray:"8,4"}}).bindPopup(`<b>🌳 Unidade de Conservação</b><br>${f.properties?.nome_uc||"—"}`).addTo(map); }); resultados.uc=data.features||[]; }
  } catch {}
  if (car) {
    try {
      const uf = car.match(/^([A-Z]{2})-/i)?.[1]?.toLowerCase();
      if (uf) {
        const filtro = `BBOX(geom,${bbox}) AND cod_imovel <> '${car.toUpperCase()}'`;
        const sicarUrl = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sicar:sicar_imoveis_${uf}&CQL_FILTER=${encodeURIComponent(filtro)}&outputFormat=application/json&maxFeatures=8`;
        const resp = await fetch(`${PROXY_URL}?url=${encodeURIComponent(sicarUrl)}`, { signal:AbortSignal.timeout(10000) });
        if (resp.ok) {
          const data = await resp.json();
          (data.features||[]).forEach(f => {
            if (!f.geometry) return;
            const cod = f.properties?.cod_imovel||"";
            const layer = L.geoJSON(f, { style:{ color:"#f97316",weight:2,fillColor:"#f97316",fillOpacity:0.15,dashArray:"4,4" } });
            layer.bindPopup(`<div style="font-family:sans-serif;min-width:180px"><div style="font-weight:800;font-size:13px;color:#f97316;margin-bottom:4px">🌾 CAR Vizinho</div><div style="font-size:12px;font-weight:600">${f.properties?.nom_imovel||"Imóvel Rural"}</div><div style="font-size:11px;color:#666">📍 ${f.properties?.nom_municipio||"—"}</div><div style="font-size:11px;color:#666">🌾 ${f.properties?.num_area?Number(f.properties.num_area).toLocaleString("pt-BR",{maximumFractionDigits:1})+" ha":"—"}</div><div style="font-size:11px;color:#666">👤 ${f.properties?.nom_proprietario||"—"}</div><button onclick="window.dispatchEvent(new CustomEvent('agromind-vizinho',{detail:'${cod}'}))" style="margin-top:8px;width:100%;padding:5px 0;border-radius:6px;background:#f9731620;border:1px solid #f9731640;color:#f97316;font-size:11px;font-weight:600;cursor:pointer">Ver detalhes ▶</button></div>`);
            layer.on("click", () => onVizinhoClick && onVizinhoClick(cod));
            layer.addTo(map);
          });
          resultados.vizinhos = data.features||[];
        }
      }
    } catch {}
  }
  return resultados;
}

// ─── LAUDO PDF ────────────────────────────────────────────────────
const gerarNumeroLaudo=()=>{const ano=new Date().getFullYear(),seq=String(Math.floor(Math.random()*99999)).padStart(5,"0");return`AGM-${ano}-${seq}`;};
const dataHoje=()=>new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});

function LaudoVisual({fazenda,dadosReais,numeroLaudo}){
  const score=dadosReais?.score,clima=dadosReais?.clima,nasa=dadosReais?.nasa,cotacoes=dadosReais?.cotacoes,ibama=dadosReais?.ibama,prodes=dadosReais?.prodes;
  const sv=score?.valor??78,sn=score?.nivel??"Baixo Risco",sc=!score?"#22c55e":sv>=75?"#22c55e":sv>=50?"#fbbf24":"#ef4444";
  const SH=({icon,title,color="#16a34a"})=>(<div style={{display:"flex",alignItems:"center",gap:10,background:`linear-gradient(90deg,${color}18,transparent)`,borderLeft:`4px solid ${color}`,padding:"8px 14px",marginBottom:12,borderRadius:"0 8px 8px 0"}}><span style={{fontSize:16}}>{icon}</span><span style={{fontSize:13,fontWeight:800,color,letterSpacing:0.5}}>{title}</span></div>);
  const Row2=({label,value,color})=>(<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #e5e7eb",fontSize:11}}><span style={{color:"#6b7280"}}>{label}</span><span style={{fontWeight:700,color:color||"#1a2e1a",maxWidth:200,textAlign:"right"}}>{value??"—"}</span></div>);
  const Badge=({ok,textoOk,textoNok})=>(<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,background:ok?"#dcfce7":"#fee2e2",color:ok?"#16a34a":"#dc2626",border:`1px solid ${ok?"#86efac":"#fca5a5"}`}}>{ok?"✅":"⛔"} {ok?textoOk:textoNok}</span>);
  return(<div id="laudo-conteudo" style={{width:794,background:"#ffffff",fontFamily:"Georgia,serif",color:"#1a2e1a"}}>
    <div style={{background:"linear-gradient(135deg,#0d5c2e,#12803f,#16a34a)",padding:"36px 40px 28px",color:"white"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}><div style={{width:44,height:44,borderRadius:12,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🌿</div><div><div style={{fontSize:22,fontWeight:900,letterSpacing:1}}>AgroMind</div><div style={{fontSize:10,opacity:0.8,letterSpacing:2,textTransform:"uppercase"}}>Inteligência Rural</div></div></div><div style={{fontSize:18,fontWeight:700,marginTop:16,marginBottom:4}}>Laudo de Análise Rural</div><div style={{fontSize:12,opacity:0.85}}>{fazenda.nome}</div></div><div style={{textAlign:"right"}}><div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"10px 16px"}}><div style={{fontSize:10,opacity:0.8,marginBottom:2}}>Nº DO LAUDO</div><div style={{fontSize:14,fontWeight:900,letterSpacing:1}}>{numeroLaudo}</div><div style={{fontSize:10,opacity:0.8,marginTop:6}}>{dataHoje()}</div></div></div></div>
    <div style={{display:"flex",gap:12,marginTop:24,background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"12px 16px"}}>{[["📍",fazenda.municipio||"—","Localização"],["🌾",fazenda.area||"—","Área Total"],["📋",(fazenda.car||"").substring(0,14)+"…","CAR"],["🤖",`${sv}/100`,"Score IA"]].map(([icon,val,label])=>(<div key={label} style={{flex:1,textAlign:"center"}}><div style={{fontSize:18}}>{icon}</div><div style={{fontSize:12,fontWeight:800,marginTop:2}}>{val}</div><div style={{fontSize:9,opacity:0.7,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div></div>))}</div></div>
    <div style={{padding:"28px 40px",display:"flex",flexDirection:"column",gap:24}}>
      <div><SH icon="📋" title="1. IDENTIFICAÇÃO DO IMÓVEL" color="#16a34a"/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}><div><Row2 label="Nome da Fazenda" value={fazenda.nome}/><Row2 label="Município/UF" value={fazenda.municipio}/><Row2 label="Área Total" value={fazenda.area}/><Row2 label="Módulos Fiscais" value={fazenda.modulos}/><Row2 label="APP" value={fazenda.app}/></div><div><Row2 label="Proprietário" value={fazenda.proprietario}/><Row2 label="CAR" value={fazenda.car}/><Row2 label="CCIR" value={fazenda.ccir}/><Row2 label="ITR/NIRF" value={fazenda.itr}/><Row2 label="Reserva Legal" value={fazenda.rl}/></div></div><div style={{marginTop:10}}><Row2 label="SIGEF/INCRA" value={fazenda.sigef}/><Row2 label="Latitude" value={`${fazenda.coordenadas?.lat}°`}/><Row2 label="Longitude" value={`${fazenda.coordenadas?.lng}°`}/></div></div>
      <div><SH icon="🤖" title="2. SCORE IA" color="#22c55e"/><div style={{display:"flex",gap:20,alignItems:"flex-start"}}><div style={{textAlign:"center",flexShrink:0}}><div style={{width:90,height:90,borderRadius:"50%",background:`conic-gradient(${sc} 0deg,${sc} ${(sv/100)*360}deg,#e5e7eb ${(sv/100)*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px"}}><div style={{width:68,height:68,borderRadius:"50%",background:"white",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:24,fontWeight:900,color:sc,lineHeight:1}}>{sv}</div><div style={{fontSize:9,color:"#9ca3af"}}>/100</div></div></div><div style={{fontSize:12,fontWeight:800,color:sc}}>{sn}</div></div><div style={{flex:1}}>{score?.fatores?.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #e5e7eb",fontSize:11}}><span style={{color:"#6b7280"}}>{f.label}</span><span style={{fontWeight:700,color:f.cor}}>{f.impacto===0?"✅ OK":f.impacto}</span></div>))}</div></div></div>
      <div><SH icon="⛔" title="3. EMBARGOS IBAMA" color="#ef4444"/><div style={{marginBottom:10}}><Badge ok={!fazenda.embargo} textoOk="Sem Embargo" textoNok="Embargo Ativo"/></div>{!fazenda.embargo&&<div style={{padding:"10px 14px",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,fontSize:11,color:"#166534"}}>✅ Nenhum embargo encontrado na base IBAMA.</div>}</div>
      <div><SH icon="📡" title="4. PRODES/INPE" color="#f97316"/><div style={{marginBottom:10}}><Badge ok={!fazenda.prodes} textoOk="Sem Alerta PRODES" textoNok="Alerta PRODES"/></div>{!fazenda.prodes&&<div style={{padding:"10px 14px",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,fontSize:11,color:"#166534"}}>✅ Nenhum alerta de desmatamento.</div>}</div>
      <div style={{background:"#f8fdf8",border:"1px solid #86efac",borderRadius:10,padding:"14px 18px",fontSize:10,color:"#374151",lineHeight:1.7}}><div style={{fontWeight:700,color:"#166534",marginBottom:6,fontSize:11}}>📋 Declaração</div>Laudo gerado automaticamente pela plataforma AgroMind com base em dados públicos oficiais (SICAR, IBAMA, PRODES/INPE, SIGEF/INCRA). Informações de caráter informativo. Data: {dataHoje()}.</div>
    </div>
    <div style={{background:"linear-gradient(135deg,#0d5c2e,#16a34a)",padding:"14px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",color:"rgba(255,255,255,0.85)"}}><div style={{fontSize:11}}>🌿 <strong>AgroMind</strong> — Inteligência Rural</div><div style={{fontSize:10}}>{numeroLaudo} · agromindpro.com.br</div><div style={{fontSize:10}}>{dataHoje()}</div></div>
  </div>);
}

async function gerarLaudoPDF(fazenda,dadosReais,setGerando){
  setGerando(true);
  try{const nl=gerarNumeroLaudo(),c=document.createElement("div");c.style.cssText="position:fixed;left:-9999px;top:0;width:794px;background:#ffffff;z-index:-1;";document.body.appendChild(c);const{createRoot}=await import("react-dom/client"),r=createRoot(c);await new Promise(res=>{r.render(<LaudoVisual fazenda={fazenda} dadosReais={dadosReais} numeroLaudo={nl}/>);setTimeout(res,600);});const el=c.querySelector("#laudo-conteudo");if(!el)throw new Error("Elemento não encontrado");const canvas=await html2canvas(el,{scale:2,useCORS:true,backgroundColor:"#ffffff",logging:false});const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});const lMM=210,aMM=297,ratio=lMM/canvas.width,totAlt=canvas.height*ratio;let posY=0,pg=0;while(posY<totAlt){if(pg>0)pdf.addPage();pdf.addImage(canvas.toDataURL("image/jpeg",0.92),"JPEG",0,-posY,lMM,totAlt);posY+=aMM;pg++;}pdf.save(`Laudo_${(fazenda.nome||"Imovel").replace(/\s+/g,"_")}_${nl}.pdf`);r.unmount();document.body.removeChild(c);alert(`✅ Laudo gerado!`);}
  catch(err){alert(`❌ Erro: ${err.message}`);}
  finally{setGerando(false);}
}

// ─── CARDS ────────────────────────────────────────────────────────
function CardClima({clima}){if(!clima?.encontrado)return null;const a=clima.atual,maxC=Math.max(...(clima.previsao7dias||[]).map(x=>x.chuva),1);return(<div style={{background:C.card,border:`1px solid ${C.blue}30`,borderRadius:14,padding:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:12,fontWeight:700}}>🌤️ Clima Atual</div><span style={{fontSize:10,color:C.textMuted}}>{a?.descricao}</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>{[["🌡️",`${a?.temperatura??'--'}°C`],["💧",`${a?.umidade??'--'}%`],["💨",`${a?.vento??'--'} km/h`],["🌧️",`${a?.precipitacao??0} mm`]].map(([l,v])=>(<div key={l} style={{background:`${C.blue}10`,borderRadius:8,padding:"7px 9px"}}><div style={{fontSize:10,color:C.textMuted}}>{l}</div><div style={{fontSize:13,fontWeight:800,color:C.blue}}>{v}</div></div>))}</div>{(clima.previsao7dias||[]).length>0&&(<><div style={{fontSize:10,color:C.textMuted,marginBottom:5}}>Previsão 7 dias (mm)</div><div style={{display:"flex",alignItems:"flex-end",gap:3,height:38}}>{clima.previsao7dias.map((d,i)=>(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><div style={{width:"100%",height:`${Math.max((d.chuva/maxC)*100,4)}%`,background:`linear-gradient(180deg,${C.blue}90,${C.blue}40)`,borderRadius:"3px 3px 0 0",minHeight:3}}/><span style={{fontSize:9,color:C.textDim}}>{d.dataFormatada}</span></div>))}</div><div style={{marginTop:6,fontSize:11,color:C.textMuted}}>🌧️ 30d: <strong style={{color:C.blue}}>{clima.precipTotal30d} mm</strong></div></>)}</div>);}
function CardNASA({nasa}){if(!nasa?.encontrado)return null;return(<div style={{background:C.card,border:`1px solid ${C.purple}30`,borderRadius:14,padding:14}}><div style={{fontSize:12,fontWeight:700,marginBottom:10}}>🛰️ NASA POWER</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>{[["☀️ Rad.",nasa.radiacaoSolar?`${nasa.radiacaoSolar} MJ/m²`:"—"],["🌡️ Temp.",nasa.temperaturaMedia?`${nasa.temperaturaMedia}°C`:"—"],["🌧️ Precip.",nasa.precipitacaoMedia?`${nasa.precipitacaoMedia} mm/d`:"—"],["💧 Umid.",nasa.umidadeRelativa?`${nasa.umidadeRelativa}%`:"—"]].map(([l,v])=>(<div key={l} style={{background:`${C.purple}10`,borderRadius:8,padding:"7px 9px"}}><div style={{fontSize:10,color:C.textMuted}}>{l}</div><div style={{fontSize:13,fontWeight:800,color:C.purple}}>{v}</div></div>))}</div></div>);}
function CardCotacoes({cotacoes}){if(!cotacoes?.encontrado)return null;return(<div style={{background:C.card,border:`1px solid ${C.yellow}30`,borderRadius:14,padding:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:12,fontWeight:700}}>📊 Cotações</div>{cotacoes.dolarHoje&&<span style={{fontSize:10,color:C.textMuted}}>💵 R${Number(cotacoes.dolarHoje).toFixed(2)}</span>}</div>{Object.entries(cotacoes.produtos||{}).map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.border}`}}><div><div style={{fontSize:12,fontWeight:600}}>{v.nome}</div><div style={{fontSize:10,color:C.textMuted}}>{v.unidade}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:800,color:C.yellow}}>{v.preco?`R$ ${Number(v.preco).toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"}</div>{v.variacao!=null&&<div style={{fontSize:10,color:v.variacao>=0?C.accent:C.red}}>{v.variacao>=0?"▲":"▼"} {Math.abs(v.variacao).toFixed(1)}%</div>}</div></div>))}</div>);}
function CardScore({score}){if(!score)return null;const cor=score.cor;return(<div style={{background:C.card,border:`1px solid ${cor}30`,borderRadius:14,padding:14,textAlign:"center",marginBottom:16}}><div style={{fontSize:11,color:C.textMuted,marginBottom:8}}>🤖 Score IA</div><div style={{width:80,height:80,borderRadius:"50%",background:`conic-gradient(${cor} 0deg,${cor} ${(score.valor/100)*360}deg,${C.border} ${(score.valor/100)*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px"}}><div style={{width:60,height:60,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:22,fontWeight:900,color:cor,lineHeight:1}}>{score.valor}</div><div style={{fontSize:9,color:C.textMuted}}>/100</div></div></div><div style={{fontSize:12,fontWeight:700,color:cor,marginBottom:8}}>{score.nivel}</div>{score.fatores?.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.textMuted}}>{f.label}</span><span style={{fontWeight:700,color:f.cor}}>{f.impacto===0?"✅":f.impacto}</span></div>))}</div>);}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────
export default function MapaPage({ dadosConsulta }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const kmlLayerRef = useRef(null);
  const medicaoLayerRef = useRef(null);
  const medicaoPontosRef = useRef([]);
  const medicaoMarkersRef = useRef([]);

  const [camadas, setCamadas] = useState(CAMADAS);
  const [tipoMapa, setTipoMapa] = useState("satellite");
  const [fazenda, setFazenda] = useState(FAZENDA_MOCK);
  const [dadosReais, setDadosReais] = useState(null);
  const [kmlNome, setKmlNome] = useState(null);
  const [tipoBusca, setTipoBusca] = useState("car");
  const [searchVal, setSearchVal] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState(null);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [campoPainel, setCampoPainel] = useState(null);
  const [sobreposicoes, setSobreposicoes] = useState(null);
  const [buscandoSobr, setBuscandoSobr] = useState(false);
  const [vizinhoDrawer, setVizinhoDrawer] = useState(null);

  // ── Medição
  const [modoMedicao, setModoMedicao] = useState(null); // "area" | "distancia" | null
  const [resultadoMedicao, setResultadoMedicao] = useState(null);

  const fileRef = useRef(null);

  useEffect(() => {
    const handler = (e) => abrirDrawerVizinho(e.detail);
    window.addEventListener("agromind-vizinho", handler);
    return () => window.removeEventListener("agromind-vizinho", handler);
  }, []);

  const abrirDrawerVizinho = async (codImovel) => {
    if (!codImovel) return;
    setVizinhoDrawer({ car:codImovel, nome:"Carregando..." });
    const dados = await buscarDadosVizinho(codImovel);
    setVizinhoDrawer(dados || { car:codImovel, nome:"Dados não disponíveis" });
  };

  // ── Medição: inicia/para modo
  const iniciarMedicao = (modo) => {
    if (modoMedicao === modo) {
      pararMedicao();
      return;
    }
    pararMedicao();
    setModoMedicao(modo);
    setResultadoMedicao(null);
    if (leafletMap.current) {
      leafletMap.current.getContainer().style.cursor = "crosshair";
    }
  };

  const pararMedicao = () => {
    setModoMedicao(null);
    setResultadoMedicao(null);
    medicaoPontosRef.current = [];
    limparMedicaoLayers();
    if (leafletMap.current) {
      leafletMap.current.getContainer().style.cursor = "";
    }
  };

  const limparMedicaoLayers = () => {
    const map = leafletMap.current;
    if (!map) return;
    medicaoMarkersRef.current.forEach(m => { try { map.removeLayer(m); } catch {} });
    medicaoMarkersRef.current = [];
    if (medicaoLayerRef.current) { try { map.removeLayer(medicaoLayerRef.current); } catch {} medicaoLayerRef.current = null; }
  };

  const handleMapClick = (e) => {
    if (!modoMedicao) return;
    const L = window.L;
    const map = leafletMap.current;
    if (!L || !map) return;

    const ponto = [e.latlng.lat, e.latlng.lng];
    medicaoPontosRef.current.push(ponto);
    const pontos = medicaoPontosRef.current;

    // Marcador numerado
    const n = pontos.length;
    const icon = L.divIcon({
      html: `<div style="background:${modoMedicao==="area"?"#22c55e":"#3b82f6"};color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${n}</div>`,
      iconSize:[22,22], iconAnchor:[11,11], className:""
    });
    const marker = L.marker(ponto, { icon });
    marker.addTo(map);
    medicaoMarkersRef.current.push(marker);

    // Atualiza layer
    if (medicaoLayerRef.current) { try { map.removeLayer(medicaoLayerRef.current); } catch {} }

    if (modoMedicao === "distancia" && pontos.length >= 2) {
      const line = L.polyline(pontos, { color:"#3b82f6", weight:3, dashArray:"8,4" });
      line.addTo(map);
      medicaoLayerRef.current = line;
      // Calcula distância total
      let dist = 0;
      for (let i = 0; i < pontos.length - 1; i++) {
        dist += calcularDistanciaM(pontos[i][0], pontos[i][1], pontos[i+1][0], pontos[i+1][1]);
      }
      setResultadoMedicao({ tipo:"distancia", valor:formatarDistancia(dist), pontos:pontos.length });
    }

    if (modoMedicao === "area" && pontos.length >= 3) {
      const poly = L.polygon(pontos, { color:"#22c55e", weight:2, fillColor:"#22c55e", fillOpacity:0.2, dashArray:"6,3" });
      poly.addTo(map);
      medicaoLayerRef.current = poly;
      const ha = calcularAreaHa(pontos);
      setResultadoMedicao({ tipo:"area", valor:formatarArea(ha), pontos:pontos.length });
    } else if (modoMedicao === "area" && pontos.length === 2) {
      const line = L.polyline(pontos, { color:"#22c55e", weight:2, dashArray:"6,3" });
      line.addTo(map);
      medicaoLayerRef.current = line;
    }
  };

  useEffect(() => {
    if (!dadosConsulta) return;
    const fazendaConvertida = dadosParaFazenda(dadosConsulta);
    if (fazendaConvertida) {
      setFazenda(fazendaConvertida);
      setDadosReais(dadosConsulta);
      if (leafletMap.current && window.L) {
        const geom = dadosConsulta.sicar?.geometria || dadosConsulta.sigef?.geometria;
        if (geom) desenharReal(leafletMap.current, window.L, geom, dadosConsulta);
        else if (dadosConsulta.coordenadas?.lat) leafletMap.current.setView([dadosConsulta.coordenadas.lat, dadosConsulta.coordenadas.lng], 13);
      }
    }
  }, [dadosConsulta]);

  useEffect(() => {
    if (leafletMap.current) return;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => initMap();
    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    if (!mapRef.current || leafletMap.current) return;
    const L = window.L;
    const coordInicial = dadosConsulta?.coordenadas?.lat
      ? [dadosConsulta.coordenadas.lat, dadosConsulta.coordenadas.lng]
      : [FAZENDA_MOCK.coordenadas.lat, FAZENDA_MOCK.coordenadas.lng];
    const map = L.map(mapRef.current, { center:coordInicial, zoom:13, zoomControl:false });
    // ✅ Google Hybrid como padrão
    L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", { attribution:"© Google", maxZoom:21 }).addTo(map);
    L.control.zoom({ position:"bottomright" }).addTo(map);
    // ── Click para medição
    map.on("click", (e) => handleMapClick(e));
    leafletMap.current = map;
    if (dadosConsulta) {
      const geom = dadosConsulta.sicar?.geometria || dadosConsulta.sigef?.geometria;
      if (geom) desenharReal(map, L, geom, dadosConsulta);
      else if (dadosConsulta.coordenadas?.lat) { map.setView([dadosConsulta.coordenadas.lat, dadosConsulta.coordenadas.lng], 13); adicionarMarcador(map, L, dadosConsulta.coordenadas.lat, dadosConsulta.coordenadas.lng, dadosConsulta); }
    } else { desenharMock(map, L); }
  };

  // Atualiza handler de click quando modoMedicao muda
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    map.off("click");
    map.on("click", (e) => handleMapClick(e));
  }, [modoMedicao]);

  const adicionarMarcador = (map, L, lat, lng, dados) => {
    const icon = L.divIcon({ html:`<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4)"></div>`, iconSize:[36,36], iconAnchor:[18,36], className:"" });
    L.marker([lat,lng],{icon}).addTo(map).bindPopup(`<div style="font-family:sans-serif;min-width:220px"><div style="font-weight:800;font-size:14px;color:#0d5c2e;margin-bottom:6px">🌿 ${dados.sicar?.nome||dados.car||"Imóvel Rural"}</div><div style="font-size:12px;color:#666">📍 ${dados.sicar?.municipio||""}</div><div style="font-size:12px;color:#666">🌾 ${dados.sicar?.area||"—"}</div><div style="font-size:12px;color:#666">👤 ${dados.sicar?.proprietario||dados.sigef?.denominacao||"—"}</div><hr style="margin:8px 0;border-color:#eee"/><div style="font-size:11px;color:#22c55e;font-weight:700">Score: ${dados.score?.valor||"—"}/100</div></div>`).openPopup();
  };

  const desenharMock = (map, L) => {
    const {lat,lng}=FAZENDA_MOCK.coordenadas,o=0.05;
    const pol=L.polygon([[lat+o,lng-o*.5],[lat+o,lng+o],[lat,lng+o*1.5],[lat-o,lng+o],[lat-o,lng-o*.5],[lat,lng-o*1.2]],{color:"#22c55e",weight:3,fillColor:"#22c55e",fillOpacity:0.15}).addTo(map);
    const icon=L.divIcon({html:`<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4)"></div>`,iconSize:[36,36],iconAnchor:[18,36],className:""});
    L.marker([lat,lng],{icon}).addTo(map);
    map.fitBounds(pol.getBounds(),{padding:[40,40]});
  };

  const desenharReal = (map, L, geometria, dados) => {
    Object.values(map._layers).forEach(layer => { if(layer._latlngs||layer._latlng){try{map.removeLayer(layer);}catch{}} });
    const geoLayer = L.geoJSON(geometria, { style:{ color:"#22c55e",weight:3,fillColor:"#22c55e",fillOpacity:0.2 } }).addTo(map);
    const bounds = geoLayer.getBounds(), center = bounds.getCenter();
    adicionarMarcador(map, L, center.lat, center.lng, dados);
    map.fitBounds(bounds, { padding:[40,40] });
    // ✅ Carrega vizinhos automaticamente
    const car = dados.car || dados.sicar?.car;
    const lat = center.lat, lng = center.lng;
    if (car && lat && lng) {
      setTimeout(async () => {
        try {
          const resultado = await buscarSobreposicoes(lat, lng, car, map, L, abrirDrawerVizinho);
          setSobreposicoes(resultado);
        } catch {}
      }, 800);
    }
  };

  const handleBuscarSobreposicoes = async () => {
    if (!fazenda.coordenadas?.lat || buscandoSobr) return;
    setBuscandoSobr(true);
    const resultado = await buscarSobreposicoes(fazenda.coordenadas.lat, fazenda.coordenadas.lng, fazenda.car, leafletMap.current, window.L, abrirDrawerVizinho);
    setSobreposicoes(resultado);
    setBuscandoSobr(false);
  };

  const importarKML = (e) => {
    const file=e.target.files[0]; if(!file)return; setKmlNome(file.name);
    const reader=new FileReader();
    reader.onload=(ev)=>{try{renderizarKML(ev.target.result,file.name);}catch{alert("Erro ao ler KML.");}};
    reader.readAsText(file);
  };

  const renderizarKML = (kmlText, nomeArquivo) => {
    if(!leafletMap.current||!window.L)return;
    const L=window.L,map=leafletMap.current;
    if(kmlLayerRef.current){map.removeLayer(kmlLayerRef.current);kmlLayerRef.current=null;}
    try{
      const parser=new DOMParser(),kmlDoc=parser.parseFromString(kmlText,"text/xml"),layers=[];
      kmlDoc.querySelectorAll("Polygon").forEach(poly=>{const coordsEl=poly.querySelector("outerBoundaryIs coordinates, coordinates");if(!coordsEl)return;const latlngs=coordsEl.textContent.trim().split(/\s+/).map(c=>{const p=c.split(",");return p.length<2?null:[parseFloat(p[1]),parseFloat(p[0])];}).filter(Boolean);if(latlngs.length>0)layers.push(L.polygon(latlngs,{color:"#22c55e",weight:3,fillColor:"#22c55e",fillOpacity:0.2}));});
      if(layers.length===0){alert("⚠️ Nenhuma geometria encontrada.");return;}
      const group=L.layerGroup(layers).addTo(map);kmlLayerRef.current=group;
      const bounds=L.featureGroup(layers).getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[40,40]});
      alert(`✅ KML "${nomeArquivo}" carregado!`);
    }catch(err){alert(`❌ Erro: ${err.message}`);}
  };

  const buscarImovel = async () => {
    const val=searchVal.trim(); if(!val||buscando)return;
    setBuscando(true);setErroBusca(null);
    try{
      let body={};
      if(tipoBusca==="gps"){const gps=val.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);if(!gps){setErroBusca("GPS inválido.");setBuscando(false);return;}body={lat:parseFloat(gps[1]),lng:parseFloat(gps[2])};}
      else if(tipoBusca==="ccir"){body={ccir:val};}else if(tipoBusca==="itr"){body={itr:val};}
      else if(tipoBusca==="proprietario"){body={proprietario:val};}else if(tipoBusca==="fazenda"){body={nomeFazenda:val};}
      else{body={car:val};}
      const resp=await fetch("/api/consulta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const dados=await resp.json();
      if(!dados.sucesso){setErroBusca(dados.error||"Erro na consulta.");setBuscando(false);return;}
      setDadosReais(dados);const fazC=dadosParaFazenda(dados);if(fazC)setFazenda(fazC);
      if(leafletMap.current&&window.L){const geom=dados.sicar?.geometria||dados.sigef?.geometria;if(geom)desenharReal(leafletMap.current,window.L,geom,dados);else if(dados.coordenadas?.lat){leafletMap.current.setView([dados.coordenadas.lat,dados.coordenadas.lng],13);adicionarMarcador(leafletMap.current,window.L,dados.coordenadas.lat,dados.coordenadas.lng,dados);}}
    }catch{setErroBusca("Erro de conexão.");}
    setBuscando(false);
  };

  const exportarKML = () => {
    const kml=`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><n>${fazenda.nome}</n><Placemark><n>${fazenda.nome}</n><Polygon><outerBoundaryIs><LinearRing><coordinates>${fazenda.coordenadas.lng-0.05},${fazenda.coordenadas.lat+0.05},0 ${fazenda.coordenadas.lng+0.05},${fazenda.coordenadas.lat+0.05},0 ${fazenda.coordenadas.lng-0.05},${fazenda.coordenadas.lat+0.05},0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([kml],{type:"application/vnd.google-earth.kml+xml"}));a.download=`${fazenda.nome.replace(/ /g,"_")}.kml`;a.click();
  };

  const trocarMapa = (tipo) => {
    if(!leafletMap.current||!window.L)return;
    const map=leafletMap.current,L=window.L;
    Object.values(map._layers).forEach(l=>{if(l._url)map.removeLayer(l);});
    if(tipo==="satellite") L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",{attribution:"© Google",maxZoom:21}).addTo(map);
    else if(tipo==="mapa") L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
    else if(tipo==="terreno") L.tileLayer("https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",{attribution:"© Google",maxZoom:21}).addTo(map);
    setTipoMapa(tipo);
  };

  const toggleCamada = (id) => setCamadas(prev=>prev.map(c=>c.id===id?{...c,ativa:!c.ativa}:c));
  const score=dadosReais?.score,clima=dadosReais?.clima,nasa=dadosReais?.nasa;
  const scoreValor=score?.valor??78,scoreCor=score?.cor??C.accent;
  const tipoAtual=TIPOS_BUSCA.find(t=>t.id===tipoBusca);
  const temDadosReais=!!dadosReais;

  return (
    <div className="mapa-container" style={{display:"flex",height:"calc(100vh - 64px)",overflow:"hidden"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:768px){.mapa-container{flex-direction:column!important;height:auto!important;overflow-y:auto!important;}.mapa-painel-esq{width:100%!important;border-right:none!important;border-bottom:1px solid #1e3a1e!important;}.mapa-centro{width:100%!important;height:72vw!important;min-height:260px!important;max-height:400px!important;flex:none!important;}.mapa-painel-dir{display:none!important;}}`}</style>

      {/* ── PAINEL ESQUERDO ── */}
      <div className="mapa-painel-esq" style={{width:290,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"}}>

        {/* Busca */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>🔍 Buscar Imóvel</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>{TIPOS_BUSCA.map(t=>(<button key={t.id} onClick={()=>{setTipoBusca(t.id);setSearchVal("");}} style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${tipoBusca===t.id?C.accent:C.border}`,background:tipoBusca===t.id?`${C.accent}20`:"transparent",color:tipoBusca===t.id?C.accent:C.textMuted,fontSize:10,fontWeight:tipoBusca===t.id?700:400,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><span>{t.icon}</span>{t.label}</button>))}</div>
          <div style={{display:"flex",gap:6}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:12,outline:"none"}} placeholder={tipoAtual?.placeholder||""} value={searchVal} onChange={e=>setSearchVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscarImovel()}/><button onClick={buscarImovel} disabled={buscando} style={{background:buscando?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,border:"none",borderRadius:8,color:C.text,width:36,cursor:buscando?"default":"pointer",fontSize:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{buscando?<div style={{width:14,height:14,border:`2px solid ${C.text}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>:"🔍"}</button></div>
          {erroBusca&&<div style={{marginTop:8,fontSize:11,color:C.red,background:`${C.red}15`,borderRadius:6,padding:"6px 10px"}}>⚠️ {erroBusca}</div>}
          {temDadosReais&&<div style={{marginTop:8,fontSize:11,color:C.accent,background:`${C.accent}15`,borderRadius:6,padding:"6px 10px"}}>✅ Dados reais carregados</div>}
        </div>

        {/* Dados do imóvel */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:13,fontWeight:700}}>📋 Dados do Imóvel</div>{chip(temDadosReais?"✓ Dados Reais":"Demo",temDadosReais?C.accent:C.textMuted)}</div>
          <div style={{fontSize:13,fontWeight:800,color:C.accentBright,marginBottom:3}}>{fazenda.nome}</div>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:8}}>📍 {fazenda.municipio}</div>
          <div style={{fontSize:10,color:C.textDim,marginBottom:6,fontStyle:"italic"}}>Clique em qualquer campo para mais detalhes</div>
          <InfoRowClicavel label="🌾 Área Total"      value={fazenda.area}       campo="modulos"      onClicar={setCampoPainel}/>
          <InfoRowClicavel label="📋 CAR"             value={fazenda.car?.length>18?fazenda.car.substring(0,18)+"...":fazenda.car} campo="car" onClicar={setCampoPainel}/>
          <InfoRowClicavel label="💰 ITR/NIRF"        value={fazenda.itr}        campo="itr"          onClicar={setCampoPainel}/>
          <InfoRowClicavel label="📄 CCIR"            value={fazenda.ccir}       campo="ccir"         onClicar={setCampoPainel}/>
          <InfoRowClicavel label="👤 Proprietário"    value={fazenda.proprietario?.length>22?fazenda.proprietario.substring(0,22)+"...":fazenda.proprietario} campo="proprietario" onClicar={setCampoPainel}/>
          <InfoRowClicavel label="📐 Módulos Fiscais" value={fazenda.modulos}    campo="modulos"      onClicar={setCampoPainel}/>
          <InfoRowClicavel label="🗂️ SIGEF"           value={fazenda.sigef}      campo="sigef"        onClicar={setCampoPainel}/>
          <InfoRowClicavel label="💧 APP"             value={fazenda.app}        campo="app"          onClicar={setCampoPainel}/>
          <InfoRowClicavel label="🌱 Reserva Legal"   value={fazenda.rl}         campo="rl"           onClicar={setCampoPainel}/>
          <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
            <div style={{cursor:"pointer"}} onClick={()=>setCampoPainel("ibama")}>{chip(fazenda.embargo?"⛔ Embargo":"✅ Sem Embargo",fazenda.embargo?C.red:C.accent)}</div>
            <div style={{cursor:"pointer"}} onClick={()=>setCampoPainel("prodes")}>{chip(fazenda.prodes?"🔴 PRODES":"📡 Sem PRODES",fazenda.prodes?C.orange:C.accent)}</div>
          </div>
        </div>

        {/* Sobreposições */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>🗺️ Sobreposições</div>
          <button onClick={handleBuscarSobreposicoes} disabled={buscandoSobr} style={{width:"100%",padding:"8px 0",borderRadius:8,background:buscandoSobr?C.border:`linear-gradient(135deg,${C.purple},#7c3aed)`,border:"none",color:C.text,fontWeight:600,fontSize:12,cursor:buscandoSobr?"default":"pointer",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            {buscandoSobr?<><div style={{width:12,height:12,border:`2px solid ${C.text}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>Buscando...</>:"🔍 Verificar Sobreposições"}
          </button>
          {sobreposicoes&&(<div style={{display:"flex",flexDirection:"column",gap:4}}>
            {[["🏕️ Terras Indígenas",sobreposicoes.ti?.length||0,C.purple],["🌳 Unid. Conservação",sobreposicoes.uc?.length||0,C.accent],["🌾 CAR Vizinhos",sobreposicoes.vizinhos?.length||0,C.orange]].map(([label,qtd,cor])=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",borderRadius:6,background:`${cor}10`,border:`1px solid ${cor}20`,fontSize:11}}>
                <span style={{color:C.textMuted}}>{label}</span>
                <span style={{fontWeight:700,color:qtd>0?cor:C.accent}}>{qtd>0?`${qtd} — clique no mapa`:"✅ Nenhum"}</span>
              </div>
            ))}
            {(sobreposicoes.vizinhos?.length||0)>0&&<div style={{fontSize:10,color:C.textMuted,fontStyle:"italic"}}>💡 Clique nos polígonos laranjas</div>}
          </div>)}
        </div>

        {/* ── FERRAMENTAS DE MEDIÇÃO ── */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>📏 Ferramentas de Medição</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <button onClick={()=>iniciarMedicao("distancia")} style={{flex:1,padding:"8px 6px",borderRadius:8,border:`1px solid ${modoMedicao==="distancia"?C.blue:C.border}`,background:modoMedicao==="distancia"?`${C.blue}20`:"transparent",color:modoMedicao==="distancia"?C.blue:C.textMuted,fontSize:11,fontWeight:modoMedicao==="distancia"?700:400,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
              📏 {modoMedicao==="distancia"?"Medindo...":"Distância"}
            </button>
            <button onClick={()=>iniciarMedicao("area")} style={{flex:1,padding:"8px 6px",borderRadius:8,border:`1px solid ${modoMedicao==="area"?C.accent:C.border}`,background:modoMedicao==="area"?`${C.accent}20`:"transparent",color:modoMedicao==="area"?C.accent:C.textMuted,fontSize:11,fontWeight:modoMedicao==="area"?700:400,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
              📐 {modoMedicao==="area"?"Medindo...":"Medir Área"}
            </button>
          </div>
          {modoMedicao&&(
            <div style={{padding:"8px 10px",background:`${modoMedicao==="area"?C.accent:C.blue}15`,border:`1px solid ${modoMedicao==="area"?C.accent:C.blue}40`,borderRadius:8,marginBottom:8}}>
              <div style={{fontSize:11,color:modoMedicao==="area"?C.accent:C.blue,fontWeight:600,marginBottom:2}}>
                {modoMedicao==="area"?"📐 Clique no mapa para marcar os vértices da área":"📏 Clique no mapa para marcar os pontos"}
              </div>
              <div style={{fontSize:10,color:C.textMuted}}>{medicaoPontosRef.current.length} ponto(s) marcado(s)</div>
            </div>
          )}
          {resultadoMedicao&&(
            <div style={{padding:"10px 12px",background:C.card,border:`1px solid ${C.borderLight}`,borderRadius:10,marginBottom:8}}>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>{resultadoMedicao.tipo==="area"?"📐 Área medida":"📏 Distância total"}</div>
              <div style={{fontSize:20,fontWeight:900,color:resultadoMedicao.tipo==="area"?C.accent:C.blue}}>{resultadoMedicao.valor}</div>
              <div style={{fontSize:10,color:C.textMuted,marginTop:2}}>{resultadoMedicao.pontos} ponto(s)</div>
            </div>
          )}
          {modoMedicao&&(
            <button onClick={pararMedicao} style={{width:"100%",padding:"6px 0",borderRadius:8,border:`1px solid ${C.red}40`,background:`${C.red}15`,color:C.red,fontSize:11,fontWeight:600,cursor:"pointer"}}>
              ✕ Cancelar medição
            </button>
          )}
          {!modoMedicao&&!resultadoMedicao&&<div style={{fontSize:10,color:C.textDim,fontStyle:"italic"}}>Selecione uma ferramenta e clique no mapa</div>}
        </div>

        {/* Coordenadas */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>📍 Coordenadas</div>
          <div style={{fontSize:11,padding:"4px 0",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between"}}><span style={{color:C.textMuted}}>Latitude</span><span style={{color:C.text,fontWeight:600}}>{fazenda.coordenadas.lat}°</span></div>
          <div style={{fontSize:11,padding:"4px 0",display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:C.textMuted}}>Longitude</span><span style={{color:C.text,fontWeight:600}}>{fazenda.coordenadas.lng}°</span></div>
          <button onClick={()=>leafletMap.current?.setView([fazenda.coordenadas.lat,fazenda.coordenadas.lng],13)} style={{width:"100%",padding:"7px 0",borderRadius:8,background:`${C.green1}60`,border:`1px solid ${C.borderLight}`,color:C.accentBright,fontSize:11,fontWeight:600,cursor:"pointer"}}>🎯 Centralizar no Mapa</button>
        </div>

        {clima&&<div style={{padding:14,borderBottom:`1px solid ${C.border}`}}><CardClima clima={clima}/></div>}
        {nasa&&<div style={{padding:14,borderBottom:`1px solid ${C.border}`}}><CardNASA nasa={nasa}/></div>}
        {dadosReais?.cotacoes&&<div style={{padding:14,borderBottom:`1px solid ${C.border}`}}><CardCotacoes cotacoes={dadosReais.cotacoes}/></div>}

        {/* Ações */}
        <div style={{padding:14}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>⚡ Ações</div>
          <input type="file" accept=".kml,.kmz" ref={fileRef} style={{display:"none"}} onChange={importarKML}/>
          <button onClick={()=>fileRef.current?.click()} style={{display:"block",width:"100%",marginBottom:7,padding:"8px 12px",borderRadius:8,textAlign:"left",background:`${C.blue}15`,border:`1px solid ${C.blue}40`,color:C.blue,fontWeight:600,fontSize:11.5,cursor:"pointer"}}>📥 Importar KML</button>
          <button onClick={exportarKML} style={{display:"block",width:"100%",marginBottom:7,padding:"8px 12px",borderRadius:8,textAlign:"left",background:`${C.accent}15`,border:`1px solid ${C.accent}40`,color:C.accent,fontWeight:600,fontSize:11.5,cursor:"pointer"}}>📤 Exportar KML</button>
          <button onClick={()=>gerarLaudoPDF(fazenda,dadosReais,setGerandoPDF)} disabled={gerandoPDF} style={{display:"flex",alignItems:"center",gap:8,width:"100%",marginBottom:7,padding:"8px 12px",borderRadius:8,background:gerandoPDF?`${C.textDim}15`:`${C.yellow}15`,border:`1px solid ${gerandoPDF?C.textDim+"40":C.yellow+"40"}`,color:gerandoPDF?C.textDim:C.yellow,fontWeight:600,fontSize:11.5,cursor:gerandoPDF?"default":"pointer"}}>
            {gerandoPDF?<><div style={{width:12,height:12,border:`2px solid ${C.textDim}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>Gerando...</>:"📄 Gerar Laudo PDF"}
          </button>
          {kmlNome&&<div style={{fontSize:11,color:C.accent,marginTop:4}}>✅ KML: {kmlNome}</div>}
        </div>
      </div>

      {/* ── MAPA ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
        <div className="mapa-centro" style={{flex:1,position:"relative",display:"flex",flexDirection:"column",minWidth:0}}>

          {/* Toolbar */}
          <div style={{background:`${C.surface}f0`,backdropFilter:"blur(12px)",borderBottom:`1px solid ${C.border}`,padding:"8px 14px",display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap"}}>
            <div style={{display:"flex",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:3,gap:2}}>
              {[["satellite","🛰️ Satélite"],["mapa","🗺️ Mapa"],["terreno","🏔️ Terreno"]].map(([k,l])=>(
                <button key={k} onClick={()=>trocarMapa(k)} style={{padding:"5px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:tipoMapa===k?700:400,background:tipoMapa===k?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent",color:tipoMapa===k?C.text:C.textMuted}}>{l}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {camadas.slice(0,5).map(c=>(<button key={c.id} onClick={()=>toggleCamada(c.id)} style={{padding:"4px 9px",borderRadius:20,border:`1px solid ${c.ativa?c.color+"60":C.border}`,background:c.ativa?`${c.color}20`:"transparent",color:c.ativa?c.color:C.textDim,fontSize:11,cursor:"pointer"}}>{c.icon} {c.label}</button>))}
            </div>
            {/* Botões de medição na toolbar */}
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              <button onClick={()=>iniciarMedicao("distancia")} style={{padding:"5px 10px",borderRadius:8,background:modoMedicao==="distancia"?`${C.blue}30`:C.card,border:`1px solid ${modoMedicao==="distancia"?C.blue:C.border}`,color:modoMedicao==="distancia"?C.blue:C.textMuted,fontSize:11,fontWeight:600,cursor:"pointer"}}>📏 Distância</button>
              <button onClick={()=>iniciarMedicao("area")} style={{padding:"5px 10px",borderRadius:8,background:modoMedicao==="area"?`${C.accent}30`:C.card,border:`1px solid ${modoMedicao==="area"?C.accent:C.border}`,color:modoMedicao==="area"?C.accent:C.textMuted,fontSize:11,fontWeight:600,cursor:"pointer"}}>📐 Área</button>
              {modoMedicao&&<button onClick={pararMedicao} style={{padding:"5px 10px",borderRadius:8,background:`${C.red}20`,border:`1px solid ${C.red}40`,color:C.red,fontSize:11,fontWeight:600,cursor:"pointer"}}>✕</button>}
            </div>
          </div>

          {/* Leaflet map */}
          <div ref={mapRef} style={{flex:1,background:`linear-gradient(135deg,${C.bg},#0d2010)`}}/>

          {/* Legenda */}
          <div style={{position:"absolute",bottom:40,left:16,background:`${C.surface}ee`,backdropFilter:"blur(12px)",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",zIndex:1000}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>Legenda</div>
            {camadas.filter(c=>c.ativa).map(c=>(<div key={c.id} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,fontSize:11}}><div style={{width:16,height:4,borderRadius:2,background:c.color,flexShrink:0}}/><span style={{color:C.textMuted}}>{c.label}</span></div>))}
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,fontSize:11}}><div style={{width:16,height:4,borderRadius:2,background:C.orange,flexShrink:0}}/><span style={{color:C.textMuted}}>CAR Vizinhos</span></div>
            {modoMedicao&&<div style={{display:"flex",alignItems:"center",gap:7,marginTop:4,fontSize:11}}><div style={{width:16,height:4,borderRadius:2,background:modoMedicao==="area"?C.accent:C.blue,flexShrink:0}}/><span style={{color:modoMedicao==="area"?C.accent:C.blue}}>Medição {modoMedicao==="area"?"Área":"Distância"}</span></div>}
          </div>

          {/* Score */}
          <div style={{position:"absolute",top:70,right:16,background:`${C.surface}ee`,backdropFilter:"blur(12px)",border:`1px solid ${scoreCor}40`,borderRadius:12,padding:"12px 14px",zIndex:1000,textAlign:"center",minWidth:110}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>🤖 Score IA</div>
            <div style={{fontSize:30,fontWeight:900,color:scoreCor,lineHeight:1}}>{scoreValor}</div>
            <div style={{fontSize:10,color:C.textMuted}}>/100</div>
            <div style={{fontSize:10,color:scoreCor,marginTop:4,fontWeight:600}}>{score?.nivel??"Baixo Risco"}</div>
          </div>

          {/* Resultado medição flutuante */}
          {resultadoMedicao&&(
            <div style={{position:"absolute",top:70,left:"50%",transform:"translateX(-50%)",background:`${C.surface}f0`,backdropFilter:"blur(12px)",border:`1px solid ${resultadoMedicao.tipo==="area"?C.accent:C.blue}60`,borderRadius:12,padding:"12px 20px",zIndex:1100,textAlign:"center",boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:2}}>{resultadoMedicao.tipo==="area"?"📐 Área medida":"📏 Distância total"}</div>
              <div style={{fontSize:22,fontWeight:900,color:resultadoMedicao.tipo==="area"?C.accent:C.blue}}>{resultadoMedicao.valor}</div>
              <button onClick={pararMedicao} style={{marginTop:8,padding:"4px 14px",borderRadius:20,border:`1px solid ${C.red}40`,background:`${C.red}15`,color:C.red,fontSize:11,cursor:"pointer"}}>✕ Limpar</button>
            </div>
          )}

          {/* Status ambiental */}
          <div style={{position:"absolute",top:70,left:16,background:`${C.surface}ee`,backdropFilter:"blur(12px)",border:`1px solid ${C.accent}40`,borderRadius:10,padding:"10px 12px",zIndex:1000}}>
            <div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:4}}>{temDadosReais?"📡 Dados Reais":"✅ Status"}</div>
            <div style={{fontSize:11,color:fazenda.embargo?C.red:C.textMuted,cursor:"pointer"}} onClick={()=>setCampoPainel("ibama")}>{fazenda.embargo?"⛔ Embargo ativo":"✅ Sem embargo"}</div>
            <div style={{fontSize:11,color:fazenda.prodes?C.orange:C.textMuted,cursor:"pointer"}} onClick={()=>setCampoPainel("prodes")}>{fazenda.prodes?"🔴 Alerta PRODES":"📡 Sem alerta"}</div>
          </div>

          {/* Cursor de medição */}
          {modoMedicao&&(
            <div style={{position:"absolute",bottom:100,left:"50%",transform:"translateX(-50%)",background:`${modoMedicao==="area"?C.accent:C.blue}20`,border:`1px solid ${modoMedicao==="area"?C.accent:C.blue}60`,borderRadius:20,padding:"6px 16px",zIndex:1000,fontSize:11,color:modoMedicao==="area"?C.accent:C.blue,fontWeight:600,pointerEvents:"none"}}>
              {modoMedicao==="area"?"📐 Clique para marcar vértices da área — mínimo 3 pontos":"📏 Clique para marcar pontos de distância"}
            </div>
          )}

          {/* Loadings */}
          {buscando&&(<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,backdropFilter:"blur(4px)"}}><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"24px 32px",textAlign:"center"}}><div style={{fontSize:36,marginBottom:10}}>🔍</div><div style={{fontSize:14,fontWeight:700,color:C.accentBright}}>Consultando...</div></div></div>)}
          {gerandoPDF&&(<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,backdropFilter:"blur(4px)"}}><div style={{background:C.card,border:`1px solid ${C.yellow}40`,borderRadius:16,padding:"28px 36px",textAlign:"center"}}><div style={{fontSize:36,marginBottom:10}}>📄</div><div style={{fontSize:14,fontWeight:700,color:C.yellow}}>Gerando Laudo PDF...</div></div></div>)}

          <PainelDetalhe campo={campoPainel} fazenda={fazenda} dadosReais={dadosReais} onFechar={()=>setCampoPainel(null)}/>
          <DrawerVizinho vizinho={vizinhoDrawer} onFechar={()=>setVizinhoDrawer(null)}/>
        </div>
      </div>

      {/* ── PAINEL DIREITO ── */}
      <div className="mapa-painel-dir" style={{width:230,background:C.surface,borderLeft:`1px solid ${C.border}`,padding:"16px 14px",flexShrink:0,overflowY:"auto"}}>
        {score&&<CardScore score={score}/>}
        <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>🗂️ Camadas</div>
        {camadas.map(c=>(<div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:10,height:10,borderRadius:2,background:c.color,flexShrink:0}}/><span style={{fontSize:12,color:c.ativa?C.text:C.textDim}}>{c.icon} {c.label}</span></div><div onClick={()=>toggleCamada(c.id)} style={{width:34,height:18,borderRadius:9,background:c.ativa?C.green3:C.border,position:"relative",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:c.ativa?18:2,width:14,height:14,borderRadius:"50%",background:"white",transition:"left 0.2s"}}/></div></div>))}
        <div style={{marginTop:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📊 Estatísticas</div>
          {[["Área Total",fazenda.area,C.accent],["APP",fazenda.app,C.blue],["Reserva Legal",fazenda.rl,C.accentBright]].map(([l,v,c])=>(<div key={l} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:700,color:c}}>{v||"—"}</span></div><div style={{height:4,background:C.bg,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:l==="Área Total"?"100%":"30%",background:`linear-gradient(90deg,${c}80,${c})`,borderRadius:2}}/></div></div>))}
        </div>
        <div style={{marginTop:8}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>🔗 Links Úteis</div>
          {[["🌿 SICAR","https://www.car.gov.br"],["⛔ IBAMA","https://ibama.gov.br"],["📡 INPE","http://terrabrasilis.dpi.inpe.br"],["🗂️ SIGEF","https://sigef.incra.gov.br"],["📋 INCRA","https://www.gov.br/incra"],["🏕️ FUNAI","https://www.gov.br/funai"],["🌳 ICMBio","https://www.gov.br/icmbio"]].map(([l,url])=>(<a key={l} href={url} target="_blank" rel="noreferrer" style={{display:"block",fontSize:11,color:C.textMuted,padding:"5px 0",borderBottom:`1px solid ${C.border}`,textDecoration:"none"}}>{l} ↗</a>))}
        </div>
      </div>
    </div>
  );
}