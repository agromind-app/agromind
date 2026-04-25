import { useState, useEffect, useCallback, useRef } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "firebase/auth";
import { doc, onSnapshot, getDoc, setDoc, updateDoc, increment, serverTimestamp, collection, addDoc } from "firebase/firestore";
import MapaPage from "./mapapage";

const C = {
  bg:"#0a0f0a",surface:"#0f1a0f",card:"#111d11",
  border:"#1e3a1e",borderLight:"#2a4f2a",
  green1:"#0d5c2e",green2:"#12803f",green3:"#16a34a",
  accent:"#22c55e",accentBright:"#4ade80",
  text:"#e8f5e9",textMuted:"#6b9e6b",textDim:"#3d6b3d",
  yellow:"#fbbf24",red:"#ef4444",orange:"#f97316",blue:"#3b82f6",
  purple:"#a78bfa",
};
const S = {
  app:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"},
  authPage:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`radial-gradient(ellipse at 30% 20%, ${C.green1}40, transparent 60%), ${C.bg}`,padding:20},
  authBox:{background:C.card,border:`1px solid ${C.border}`,borderRadius:24,padding:"40px 36px",width:"100%",maxWidth:420,boxShadow:`0 0 60px ${C.green1}40`},
  authLogoIcon:{width:56,height:56,borderRadius:16,margin:"0 auto 12px",background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28},
  authLogoText:{fontSize:26,fontWeight:900,background:`linear-gradient(135deg,${C.accentBright},${C.accent})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  label:{fontSize:12,color:C.textMuted,marginBottom:6,display:"block",fontWeight:600},
  input:{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"},
  btn:{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:15,cursor:"pointer",marginTop:8},
  errorBox:{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.red,marginBottom:16},
  successBox:{background:`${C.accent}15`,border:`1px solid ${C.accent}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.accentBright,marginBottom:16},
  chip:(c)=>({display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:`${c}20`,color:c,border:`1px solid ${c}30`}),
  card:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px"},
  chartBar:(p,c)=>({height:"100%",width:`${p}%`,background:`linear-gradient(90deg,${c}80,${c})`,borderRadius:3}),
  scoreRing:{width:110,height:110,borderRadius:"50%",background:`conic-gradient(${C.accent} 0deg,${C.accent} ${0.78*360}deg,${C.border} ${0.78*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"},
  scoreInner:{width:82,height:82,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"},
  precipBar:{display:"flex",alignItems:"flex-end",gap:3,height:70,marginBottom:6},
  precipCol:(h)=>({flex:1,height:`${h}%`,background:`linear-gradient(180deg,${C.blue}90,${C.blue}40)`,borderRadius:"3px 3px 0 0",minHeight:3}),
  tableTh:{padding:"10px",fontSize:10,fontWeight:700,color:C.textMuted,letterSpacing:"0.5px",textTransform:"uppercase",textAlign:"left"},
  tableTd:{padding:"10px",fontSize:12,borderBottom:`1px solid ${C.border}`,color:C.text},
};

const TIPOS_BUSCA = [
  { id:"car",          label:"CAR",          icon:"📋", placeholder:"Ex: MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C" },
  { id:"gps",          label:"GPS",          icon:"📍", placeholder:"Ex: -11.8456, -55.1987" },
  { id:"ccir",         label:"CCIR",         icon:"📄", placeholder:"Ex: 800.429.7412-9" },
  { id:"endereco",     label:"Endereço",     icon:"🏠", placeholder:"Ex: Sinop, Mato Grosso" },
  { id:"proprietario", label:"Proprietário", icon:"👤", placeholder:"Ex: João da Silva" },
  { id:"fazenda",      label:"Fazenda",      icon:"🌾", placeholder:"Ex: Fazenda Horizonte Verde" },
];

const NAV=[
  {section:"Principal",items:[{icon:"⊞",label:"Dashboard",id:"dashboard"},{icon:"🔍",label:"Consultar Imóvel",id:"consulta"},{icon:"🗺️",label:"Mapa Interativo",id:"mapa"},{icon:"🤖",label:"IA & Score",id:"ia"}]},
  {section:"Ambiental",items:[{icon:"🌿",label:"Embargos IBAMA",id:"embargos"},{icon:"📡",label:"PRODES/INPE",id:"prodes"},{icon:"💧",label:"Precipitação",id:"precipitacao"}]},
  {section:"Sistema",items:[{icon:"💬",label:"WhatsApp Bot",id:"whatsapp"},{icon:"💳",label:"Planos & Preços",id:"planos"},{icon:"🛡️",label:"Painel Admin",id:"admin"}]},
];
const BOTTOM_NAV=[{icon:"⊞",label:"Início",id:"dashboard"},{icon:"🗺️",label:"Mapa",id:"mapa"},{icon:"🔍",label:"Buscar",id:"consulta"},{icon:"💳",label:"Planos",id:"planos"},{icon:"🛡️",label:"Admin",id:"admin"}];

async function criarUsuarioFS(uid,email,nome){try{const ref=doc(db,"usuarios",uid);const snap=await getDoc(ref);if(snap.exists())return snap.data();const dados={uid,email,nome,plano:"gratuito",creditos:3,creditosUsados:0,totalConsultas:0,criadoEm:serverTimestamp()};await setDoc(ref,dados);return dados;}catch(e){console.error(e);}}
async function descontarCreditoFS(uid,descricao="Consulta"){try{const ref=doc(db,"usuarios",uid);const snap=await getDoc(ref);if(!snap.exists()||snap.data().creditos<=0)return{sucesso:false,motivo:"sem_creditos"};const dados=snap.data();await updateDoc(ref,{creditos:increment(-1),creditosUsados:increment(1),totalConsultas:increment(1),ultimaConsulta:serverTimestamp()});await addDoc(collection(db,"usuarios",uid,"consultas"),{descricao,creditosAntes:dados.creditos,creditosDepois:dados.creditos-1,criadoEm:serverTimestamp()});return{sucesso:true,creditos:dados.creditos-1};}catch(e){return{sucesso:false};}}
async function adicionarExtrasFS(uid,qtd,plano){try{await updateDoc(doc(db,"usuarios",uid),{creditos:increment(qtd)});await addDoc(collection(db,"usuarios",uid,"pagamentos"),{tipo:"extras",quantidade:qtd,valor:qtd*(plano?.includes("anual")?1.50:2.00),criadoEm:serverTimestamp(),status:"aprovado"});return{sucesso:true};}catch(e){return{sucesso:false};}}

function useCredits(user){
  const[creditos,setCreditos]=useState(0);const[plano,setPlano]=useState("gratuito");const[loading,setLoading]=useState(true);
  useEffect(()=>{if(!user?.uid)return;criarUsuarioFS(user.uid,user.email,user.displayName||"Usuário");const ref=doc(db,"usuarios",user.uid);const unsub=onSnapshot(ref,(snap)=>{if(snap.exists()){const d=snap.data();setCreditos(d.creditos||0);setPlano(d.plano||"gratuito");}setLoading(false);});return unsub;},[user]);
  const usarCredito=useCallback(async(desc)=>{if(!user?.uid)return{sucesso:false};return await descontarCreditoFS(user.uid,desc);},[user]);
  const cor=creditos>10?"#22c55e":creditos>3?"#fbbf24":"#ef4444";
  return{creditos,plano,loading,cor,usarCredito};
}

function SemCreditosModal({user,plano,onClose,onUpgrade}){
  const[qtd,setQtd]=useState(10);const[loading,setLoading]=useState(false);
  const isAnual=plano?.includes("anual");const preco=isAnual?1.50:2.00;
  const comprar=async()=>{setLoading(true);await adicionarExtrasFS(user.uid,qtd,plano);setLoading(false);onClose();alert(`✅ ${qtd} créditos adicionados!`);};
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"28px 24px",maxWidth:380,width:"100%"}}><div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:44,marginBottom:8}}>⚡</div><div style={{fontSize:19,fontWeight:800,color:C.text,marginBottom:6}}>Créditos esgotados!</div><div style={{fontSize:13,color:C.textMuted}}>Escolha como continuar.</div></div><div style={{background:`${C.green2}15`,border:`1px solid ${C.green2}40`,borderRadius:12,padding:"16px",marginBottom:10}}><div style={{fontSize:13,fontWeight:700,color:C.accentBright,marginBottom:10}}>⚡ Comprar créditos extras</div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><button onClick={()=>setQtd(q=>Math.max(5,q-5))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,color:C.text,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button><div style={{flex:1,textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:C.accent}}>{qtd}</div><div style={{fontSize:10,color:C.textMuted}}>créditos · R$ {(qtd*preco).toFixed(2)}</div></div><button onClick={()=>setQtd(q=>q+5)} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,color:C.text,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button></div><button onClick={comprar} disabled={loading} style={{width:"100%",padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:13,cursor:"pointer",opacity:loading?0.7:1}}>{loading?"⏳ Processando...":"💳 Comprar agora"}</button></div><button onClick={onUpgrade} style={{width:"100%",padding:"10px",borderRadius:10,border:`1px solid ${C.yellow}40`,background:`${C.yellow}10`,color:C.yellow,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8}}>🚀 Ver planos →</button><button onClick={onClose} style={{width:"100%",padding:"10px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:13,cursor:"pointer"}}>Cancelar</button></div></div>);
}

// ── Componente de Busca reutilizável ──
function BuscaBox({ onConsultar, buscando }) {
  const [tipo, setTipo] = useState("car");
  const [val, setVal] = useState("");
  const tipoAtual = TIPOS_BUSCA.find(t => t.id === tipo);
  const handleConsultar = () => { if (val.trim()) onConsultar(tipo, val.trim()); };
  return (
    <div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
        {TIPOS_BUSCA.map(t => (
          <button key={t.id} onClick={() => { setTipo(t.id); setVal(""); }} style={{ padding:"5px 12px", borderRadius:20, border:`1px solid ${tipo===t.id?C.accent:C.border}`, background:tipo===t.id?`${C.accent}20`:"transparent", color:tipo===t.id?C.accent:C.textMuted, fontSize:11, fontWeight:tipo===t.id?700:400, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <input style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"0 14px", color:C.text, fontSize:13, outline:"none", height:42 }} placeholder={tipoAtual?.placeholder||""} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleConsultar()}/>
        <button onClick={handleConsultar} disabled={buscando||!val.trim()} style={{ background:buscando||!val.trim()?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`, border:"none", borderRadius:10, color:C.text, fontWeight:700, fontSize:13, padding:"0 20px", cursor:buscando||!val.trim()?"default":"pointer", height:42, whiteSpace:"nowrap", flexShrink:0 }}>
          {buscando?"⏳ Buscando...":"🔍 Consultar"}
        </button>
      </div>
    </div>
  );
}

const PERGUNTAS_RAPIDAS=["Qual o score de risco?","Tem embargo ativo?","A Reserva Legal está regular?","Pode financiar esta propriedade?","Situação ambiental geral?","Calcule o ITR estimado"];
function ScoreGauge({score}){const cor=score>=70?C.accent:score>=40?C.yellow:C.red;const label=score>=70?"Baixo Risco":score>=40?"Risco Médio":"Alto Risco";return(<div style={{textAlign:"center",padding:"12px 0"}}><div style={{width:90,height:90,borderRadius:"50%",background:`conic-gradient(${cor} 0deg,${cor} ${(score/100)*360}deg,${C.border} ${(score/100)*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px"}}><div style={{width:68,height:68,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:20,fontWeight:900,color:cor,lineHeight:1}}>{score}</div><div style={{fontSize:9,color:C.textMuted}}>/100</div></div></div><div style={{fontSize:12,fontWeight:700,color:cor}}>{label}</div></div>);}

// ── CONSULTA PAGE ──
function ConsultaPage({ usarCredito, creditos, onSemCreditos, setPage }) {
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  const consultar = async (tipo, val) => {
    if (buscando) return;
    if (creditos <= 0) { onSemCreditos?.(); return; }
    const cr = await usarCredito?.(`Consulta ${tipo}: ${val.substring(0,40)}`);
    if (cr?.motivo === "sem_creditos") { onSemCreditos?.(); return; }
    setBuscando(true); setErro(null); setResultado(null);
    try {
      let body = {};
      if (tipo === "gps") {
        const gps = val.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
        if (!gps) { setErro("GPS inválido. Use: -11.8456, -55.1987"); setBuscando(false); return; }
        body = { lat: parseFloat(gps[1]), lng: parseFloat(gps[2]) };
      } else if (tipo === "ccir") { body = { ccir: val };
      } else if (tipo === "endereco") {
        const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=1&countrycodes=br`);
        const gd = await geo.json();
        if (!gd?.length) { setErro("Endereço não encontrado."); setBuscando(false); return; }
        body = { lat: parseFloat(gd[0].lat), lng: parseFloat(gd[0].lon) };
      } else if (tipo === "proprietario") { body = { proprietario: val };
      } else if (tipo === "fazenda") { body = { nomeFazenda: val };
      } else { body = { car: val }; }

      const resp = await fetch("/api/consulta", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      const dados = await resp.json();
      if (!dados.sucesso) { setErro(dados.error || "Erro na consulta."); setBuscando(false); return; }
      setResultado(dados);
    } catch { setErro("Erro de conexão. Tente novamente."); }
    setBuscando(false);
  };

  const r = resultado;
  const score = r?.score;
  const scoreCor = score?.cor ?? C.accent;

  return (
    <div style={{ padding:"20px 16px", maxWidth:900, margin:"0 auto" }}>
      <div style={{ ...S.card, background:`linear-gradient(135deg,${C.card} 0%,${C.green1}40 50%,${C.card} 100%)`, borderRadius:20, padding:"24px 20px", marginBottom:20 }}>
        <div style={{ fontSize:"clamp(17px,4vw,22px)", fontWeight:800, marginBottom:4 }}>🔍 Consultar Imóvel Rural</div>
        <div style={{ color:C.textMuted, fontSize:12, marginBottom:16 }}>Clique no tipo de busca desejado e digite abaixo</div>
        <BuscaBox onConsultar={consultar} buscando={buscando} />
        {erro && <div style={{ marginTop:12, padding:"10px 14px", background:`${C.red}15`, border:`1px solid ${C.red}40`, borderRadius:8, fontSize:13, color:C.red }}>⚠️ {erro}</div>}
        <div style={{ marginTop:10, fontSize:11, color:C.textMuted }}>⚡ 1 crédito por consulta · Créditos restantes: <strong style={{ color:creditos>3?C.accent:C.red }}>{creditos}</strong></div>
      </div>

      {buscando && (
        <div style={{ ...S.card, textAlign:"center", padding:"40px 20px" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🔍</div>
          <div style={{ fontSize:16, fontWeight:700, color:C.accentBright, marginBottom:8 }}>Consultando fontes oficiais...</div>
          <div style={{ fontSize:13, color:C.textMuted, marginBottom:16 }}>SICAR · IBAMA · PRODES · SIGEF · Open-Meteo · NASA POWER · CEPEA</div>
          <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
            {["SICAR","IBAMA","PRODES","SIGEF","Clima","NASA","Cotações"].map(s=>(
              <span key={s} style={{ ...S.chip(C.accent), fontSize:11, padding:"4px 10px" }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {r && !buscando && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ ...S.card, background:`linear-gradient(135deg,${C.card},${C.green1}30)`, borderRadius:18, padding:"20px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:C.accentBright, marginBottom:4 }}>{r.sicar?.nome || r.car || "Imóvel Rural"}</div>
                <div style={{ fontSize:13, color:C.textMuted, marginBottom:8 }}>📍 {r.sicar?.municipio&&`${r.sicar.municipio}, `}{r.sicar?.uf||""}</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <span style={S.chip(r.sicar?.encontrado?C.accent:C.red)}>{r.sicar?.encontrado?"✅ CAR Localizado":"❌ CAR não encontrado"}</span>
                  <span style={S.chip(r.ibama?.temEmbargo?C.red:C.accent)}>{r.ibama?.temEmbargo?`⛔ ${r.ibama.totalEmbargos} Embargo(s)`:"✅ Sem Embargo"}</span>
                  <span style={S.chip(r.prodes?.temAlerta?C.orange:C.accent)}>{r.prodes?.temAlerta?`🔴 ${r.prodes.totalAlertas} Alerta(s)`:"📡 Sem Alerta PRODES"}</span>
                  <span style={S.chip(r.sigef?.certificado?C.accent:C.yellow)}>{r.sigef?.certificado?"🗂️ SIGEF Certificado":"🗂️ SIGEF: "+(r.sigef?.situacaoLabel||"Não localizado")}</span>
                </div>
              </div>
              <div style={{ background:C.card, border:`1px solid ${scoreCor}40`, borderRadius:14, padding:"16px 20px", textAlign:"center", minWidth:100 }}>
                <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>🤖 Score IA</div>
                <div style={{ fontSize:36, fontWeight:900, color:scoreCor, lineHeight:1 }}>{score?.valor??0}</div>
                <div style={{ fontSize:10, color:C.textMuted }}>/100</div>
                <div style={{ fontSize:11, color:scoreCor, marginTop:4, fontWeight:700 }}>{score?.nivel}</div>
              </div>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:14 }}>
            {r.sicar?.encontrado && (
              <div style={S.card}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:C.accentBright }}>🌿 Dados SICAR/CAR</div>
                {[["📋 CAR",r.sicar.car?.substring(0,22)+"..."],["🌾 Área Total",r.sicar.area],["📐 Módulos",r.sicar.modulos],["👤 Proprietário",r.sicar.proprietario],["✅ Situação",r.sicar.situacaoLabel],["💧 APP",r.sicar.app],["🌱 Res. Legal",r.sicar.rl]].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:11 }}>
                    <span style={{ color:C.textMuted }}>{l}</span><span style={{ fontWeight:600, color:C.text, textAlign:"right", maxWidth:150 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {r.sigef?.encontrado && (
              <div style={S.card}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:C.blue }}>🗂️ SIGEF/INCRA</div>
                {[["Denominação",r.sigef.denominacao],["Área",r.sigef.area],["Município",r.sigef.municipio],["UF",r.sigef.uf],["CCIR",r.sigef.ccir],["Cód. INCRA",r.sigef.codigoIncra],["Situação",r.sigef.situacaoLabel]].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:11 }}>
                    <span style={{ color:C.textMuted }}>{l}</span><span style={{ fontWeight:600, color:C.text }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ ...S.card, border:`1px solid ${r.ibama?.temEmbargo?C.red:C.accent}30` }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:r.ibama?.temEmbargo?C.red:C.accent }}>⛔ Embargos IBAMA</div>
              {!r.ibama?.temEmbargo?(<div style={{ textAlign:"center", padding:"12px 0" }}><div style={{ fontSize:32, marginBottom:8 }}>✅</div><div style={{ fontSize:13, fontWeight:700, color:C.accent }}>Nenhum embargo ativo</div><div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>Propriedade sem restrições IBAMA</div></div>):r.ibama.embargos?.map((e,i)=>(<div key={i} style={{ padding:"8px 10px", marginBottom:8, border:`1px solid ${C.red}30`, borderRadius:8, background:`${C.red}08` }}><div style={{ fontSize:12, fontWeight:700, color:C.red }}>{e.numero}</div><div style={{ fontSize:11, color:C.textMuted }}>{e.tipo} · {e.data}</div>{e.area&&<div style={{ fontSize:11, color:C.textMuted }}>Área: {e.area}</div>}</div>))}
            </div>
            <div style={{ ...S.card, border:`1px solid ${r.prodes?.temAlerta?C.orange:C.accent}30` }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:r.prodes?.temAlerta?C.orange:C.accent }}>📡 PRODES/INPE — Desmatamento</div>
              {!r.prodes?.temAlerta?(<div style={{ textAlign:"center", padding:"12px 0" }}><div style={{ fontSize:32, marginBottom:8 }}>✅</div><div style={{ fontSize:13, fontWeight:700, color:C.accent }}>Nenhum alerta de desmatamento</div><div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>Área dentro dos padrões PRODES</div></div>):(<><div style={{ padding:"8px 12px", marginBottom:10, border:`1px solid ${C.orange}30`, borderRadius:8, background:`${C.orange}08` }}><div style={{ fontSize:13, fontWeight:700, color:C.orange }}>{r.prodes.totalAlertas} alerta(s) detectado(s)</div><div style={{ fontSize:11, color:C.textMuted }}>Área total: {r.prodes.areaDesmatadaKm2} km²</div></div>{r.prodes.alertas?.map((a,i)=>(<div key={i} style={{ padding:"6px 8px", marginBottom:6, border:`1px solid ${C.orange}20`, borderRadius:6 }}><div style={{ fontSize:12, fontWeight:600, color:C.orange }}>{a.classname}</div><div style={{ fontSize:11, color:C.textMuted }}>{a.data} · {a.areaKm2} km²</div></div>))}</>)}
            </div>
            {r.clima?.encontrado && (
              <div style={S.card}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:C.blue }}>🌤️ Clima & Precipitação</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                  {[["🌡️ Temperatura",`${r.clima.atual?.temperatura??'--'}°C`],["💧 Umidade",`${r.clima.atual?.umidade??'--'}%`],["💨 Vento",`${r.clima.atual?.vento??'--'} km/h`],["🌧️ Chuva 30d",`${r.clima.precipTotal30d??0} mm`]].map(([l,v])=>(<div key={l} style={{ background:`${C.blue}10`, border:`1px solid ${C.blue}20`, borderRadius:8, padding:"8px 10px" }}><div style={{ fontSize:10, color:C.textMuted }}>{l}</div><div style={{ fontSize:14, fontWeight:800, color:C.blue }}>{v}</div></div>))}
                </div>
                {r.clima.precipitacao30d?.length>0&&(<><div style={{ fontSize:10, color:C.textMuted, marginBottom:5 }}>🌧️ Precipitação — últimos 30 dias</div><div style={{ display:"flex", alignItems:"flex-end", gap:2, height:40 }}>{r.clima.precipitacao30d.slice(-30).map((v,i)=>{const max=Math.max(...r.clima.precipitacao30d,1);return <div key={i} style={{ flex:1, height:`${Math.max(4,(v/max)*100)}%`, background:`linear-gradient(180deg,${C.blue}90,${C.blue}40)`, borderRadius:"2px 2px 0 0" }}/>;})}</div></>)}
                {r.clima.previsao7dias?.length>0&&(<><div style={{ fontSize:10, color:C.textMuted, margin:"10px 0 5px" }}>📅 Previsão 7 dias</div><div style={{ display:"flex", gap:4, overflowX:"auto" }}>{r.clima.previsao7dias.map((d,i)=>(<div key={i} style={{ flex:"0 0 auto", minWidth:46, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 4px", textAlign:"center", fontSize:10 }}><div style={{ color:C.textMuted }}>{d.dataFormatada}</div><div style={{ fontSize:14, margin:"3px 0" }}>{d.chuva>10?"🌧️":d.chuva>2?"🌦️":"☀️"}</div><div style={{ color:C.blue, fontWeight:700 }}>{d.chuva?.toFixed(0)}mm</div>{d.tempMax&&<div style={{ color:C.textMuted }}>{Math.round(d.tempMax)}°</div>}</div>))}</div></>)}
                <div style={{ marginTop:8, fontSize:11, color:C.textMuted }}>{r.clima.atual?.descricao}</div>
              </div>
            )}
            {r.nasa?.encontrado && (
              <div style={S.card}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:C.purple }}>🛰️ Dados Agroclimáticos — NASA</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[["☀️ Radiação Solar",r.nasa.radiacaoSolar?`${r.nasa.radiacaoSolar} MJ/m²/d`:"—"],["🌡️ Temp. Média",r.nasa.temperaturaMedia?`${r.nasa.temperaturaMedia}°C`:"—"],["🌧️ Precip. Média",r.nasa.precipitacaoMedia?`${r.nasa.precipitacaoMedia} mm/d`:"—"],["💧 Umidade Rel.",r.nasa.umidadeRelativa?`${r.nasa.umidadeRelativa}%`:"—"]].map(([l,v])=>(<div key={l} style={{ background:`${C.purple}10`, border:`1px solid ${C.purple}20`, borderRadius:8, padding:"8px 10px" }}><div style={{ fontSize:10, color:C.textMuted }}>{l}</div><div style={{ fontSize:13, fontWeight:800, color:C.purple }}>{v}</div></div>))}
                </div>
                <div style={{ marginTop:8, fontSize:10, color:C.textDim, textAlign:"center" }}>Média 7 dias · Fonte: NASA POWER AG</div>
              </div>
            )}
            {r.cotacoes?.encontrado && (
              <div style={S.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.yellow }}>📊 Cotações CEPEA</div>
                  {r.cotacoes.dolarHoje&&<span style={{ fontSize:11, color:C.textMuted }}>💵 R$ {Number(r.cotacoes.dolarHoje).toFixed(2)}</span>}
                </div>
                {Object.entries(r.cotacoes.produtos||{}).map(([k,v])=>(<div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${C.border}` }}><div><div style={{ fontSize:12, fontWeight:600 }}>{v.nome}</div><div style={{ fontSize:10, color:C.textMuted }}>{v.unidade}</div></div><div style={{ textAlign:"right" }}><div style={{ fontSize:13, fontWeight:800, color:C.yellow }}>{v.preco?`R$ ${Number(v.preco).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—"}</div>{v.variacao!==null&&<div style={{ fontSize:10, color:v.variacao>=0?C.accent:C.red }}>{v.variacao>=0?"▲":"▼"} {Math.abs(v.variacao).toFixed(1)}%</div>}</div></div>))}
              </div>
            )}
            {score?.fatores && (
              <div style={S.card}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🤖 Análise de Risco IA</div>
                {score.fatores.map((f,i)=>(<div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 10px", marginBottom:6, borderRadius:8, border:`1px solid ${f.cor}30`, background:`${f.cor}08` }}><span style={{ fontSize:12, color:C.textMuted }}>{f.label}</span><span style={{ fontSize:12, fontWeight:700, color:f.cor }}>{f.impacto===0?"✅ OK":f.impacto}</span></div>))}
                <div style={{ marginTop:10, padding:"10px 12px", borderRadius:10, background:`${scoreCor}15`, border:`1px solid ${scoreCor}40`, textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:900, color:scoreCor }}>{score.valor}/100</div>
                  <div style={{ fontSize:12, color:scoreCor, fontWeight:700 }}>{score.nivel}</div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button onClick={()=>setPage("mapa")} style={{ flex:1, minWidth:140, padding:"12px", borderRadius:10, background:`linear-gradient(135deg,${C.green2},${C.green3})`, border:"none", color:C.text, fontWeight:700, fontSize:13, cursor:"pointer" }}>🗺️ Ver no Mapa</button>
            <button onClick={()=>setPage("ia")} style={{ flex:1, minWidth:140, padding:"12px", borderRadius:10, background:`linear-gradient(135deg,${C.blue},#6366f1)`, border:"none", color:C.text, fontWeight:700, fontSize:13, cursor:"pointer" }}>🤖 Consultar IA</button>
            <button onClick={()=>alert("Em breve!")} style={{ flex:1, minWidth:140, padding:"12px", borderRadius:10, background:`${C.yellow}15`, border:`1px solid ${C.yellow}40`, color:C.yellow, fontWeight:700, fontSize:13, cursor:"pointer" }}>📄 Gerar Laudo PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}

const FAZENDA_MOCK={nome:"Fazenda Horizonte Verde",car:"MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C",municipio:"Sinop, MT",area:"1.284,7 ha",proprietario:"Agropecuária Horizonte Ltda.",modulos:"42,8 módulos fiscais",app:"183,4 ha (14,3%)",rl:"399,8 ha (31,1%)",sigef:"Certificado",embargo:false,prodes:false,itr:"R$ 2.847,00/ano"};

function IAPage({usarCredito,creditos,onSemCreditos}){
  const score=78;const[msgs,setMsgs]=useState([{role:"assistant",content:`🌿 Olá! Sou a IA do AgroMind.\n\nAnalisando: ${FAZENDA_MOCK.nome} (${FAZENDA_MOCK.municipio})\n\nPosso analisar situação ambiental, score de risco, regularidade fundiária e potencial de financiamento.\n\nO que você quer saber?`}]);
  const[input,setInput]=useState("");const[loadingIA,setLoadingIA]=useState(false);const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const enviar=async(texto)=>{const pergunta=texto||input.trim();if(!pergunta||loadingIA)return;setInput("");if(creditos<=0){onSemCreditos?.();return;}const resultado=await usarCredito?.(`IA: ${pergunta.substring(0,50)}`);if(resultado?.motivo==="sem_creditos"){onSemCreditos?.();return;}setMsgs(prev=>[...prev,{role:"user",content:pergunta}]);setLoadingIA(true);setMsgs(prev=>[...prev,{role:"assistant",content:"",loading:true}]);try{const systemPrompt=`Você é a IA especialista em imóveis rurais do AgroMind.\n\nFAZENDA:\n- Nome: ${FAZENDA_MOCK.nome}\n- CAR: ${FAZENDA_MOCK.car}\n- Município: ${FAZENDA_MOCK.municipio}\n- Área: ${FAZENDA_MOCK.area}\n- Embargo: ${FAZENDA_MOCK.embargo?"SIM":"Não"}\n- PRODES: ${FAZENDA_MOCK.prodes?"SIM":"Não"}\n- Score: ${score}/100\n\nResponda em português, seja direto e use emojis. Máximo 200 palavras.`;const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:systemPrompt,messages:[...msgs.filter(m=>!m.loading).map(m=>({role:m.role,content:m.content})),{role:"user",content:pergunta}]})});const data=await response.json();setMsgs(prev=>[...prev.filter(m=>!m.loading),{role:"assistant",content:data.content?.[0]?.text||"Erro."}]);}catch{setMsgs(prev=>[...prev.filter(m=>!m.loading),{role:"assistant",content:"❌ Erro de conexão."}]);}setLoadingIA(false);};
  return(<div style={{display:"flex",height:"calc(100vh - 64px)",overflow:"hidden"}}><style>{`@keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}.ia-painel{display:flex!important;}@media(max-width:768px){.ia-painel{display:none!important;}}`}</style><div className="ia-painel" style={{width:240,flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,flexDirection:"column",overflowY:"auto"}}><div style={{padding:"14px 12px",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:11,fontWeight:700,color:C.textMuted,marginBottom:8,textTransform:"uppercase"}}>🌾 Fazenda</div><div style={{fontSize:13,fontWeight:800,color:C.accentBright,marginBottom:3}}>{FAZENDA_MOCK.nome}</div><div style={{fontSize:11,color:C.textMuted}}>📍 {FAZENDA_MOCK.municipio}</div></div><div style={{padding:"12px",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:11,fontWeight:700,color:C.textMuted,marginBottom:4,textTransform:"uppercase"}}>🤖 Score IA</div><ScoreGauge score={score}/></div><div style={{padding:"12px",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:11,fontWeight:700,color:C.textMuted,marginBottom:8,textTransform:"uppercase"}}>📋 Dados</div>{[["🌾 Área",FAZENDA_MOCK.area],["💧 APP",FAZENDA_MOCK.app],["🌱 Res. Legal",FAZENDA_MOCK.rl],["🗂️ SIGEF",FAZENDA_MOCK.sigef],["⛔ Embargo",FAZENDA_MOCK.embargo?"🔴 Ativo":"✅ Nenhum"],["📡 PRODES",FAZENDA_MOCK.prodes?"🔴 Alerta":"✅ Normal"]].map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:600,color:C.text}}>{v}</span></div>))}</div><div style={{padding:"12px"}}><div style={{background:`${C.green1}40`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.textMuted}}>⚡ Créditos</span><span style={{fontSize:16,fontWeight:900,color:creditos>3?C.accent:C.red}}>{creditos}</span></div><div style={{fontSize:10,color:C.textDim,marginTop:6,textAlign:"center"}}>1 crédito por pergunta</div></div></div><div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",alignItems:"center",gap:10,flexShrink:0}}><div style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},#6366f1)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🤖</div><div><div style={{fontSize:13,fontWeight:700}}>IA AgroMind</div><div style={{fontSize:10,color:C.accent}}>● Online · Especialista em imóveis rurais</div></div></div><div style={{flex:1,overflowY:"auto",padding:"16px"}}>{msgs.map((m,i)=>(<div key={i} style={{display:"flex",gap:8,marginBottom:14,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}><div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:m.role==="user"?`linear-gradient(135deg,${C.green2},${C.accent})`:`linear-gradient(135deg,${C.blue},#6366f1)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{m.role==="user"?"👤":"🤖"}</div><div style={{maxWidth:"78%",padding:"10px 14px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?`linear-gradient(135deg,${C.green2},${C.green3})`:C.card,border:m.role==="user"?"none":`1px solid ${C.border}`,color:C.text,fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.content}{m.loading&&<span style={{display:"inline-flex",gap:3,marginLeft:6}}>{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:C.accent,animation:`pulse 1s ease-in-out ${i*0.2}s infinite`,display:"inline-block"}}/>)}</span>}</div></div>))}<div ref={bottomRef}/></div><div style={{padding:"6px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:6,overflowX:"auto",flexShrink:0,background:C.surface}}>{PERGUNTAS_RAPIDAS.map((p,i)=>(<button key={i} onClick={()=>enviar(p)} style={{flexShrink:0,padding:"4px 10px",borderRadius:20,border:`1px solid ${C.borderLight}`,background:`${C.green1}40`,color:C.textMuted,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>{p}</button>))}</div><div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,background:C.surface,display:"flex",gap:8,alignItems:"flex-end",flexShrink:0}}><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar();}}} placeholder="Pergunte sobre a fazenda..." rows={1} style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",color:C.text,fontSize:13,outline:"none",resize:"none",fontFamily:"inherit",lineHeight:1.5,maxHeight:80,overflowY:"auto"}}/><button onClick={()=>enviar()} disabled={loadingIA||!input.trim()} style={{width:40,height:40,borderRadius:10,border:"none",background:loadingIA||!input.trim()?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,cursor:loadingIA||!input.trim()?"default":"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{loadingIA?"⏳":"➤"}</button></div></div></div>);
}

const precipData=[45,70,30,90,55,20,80,65,40,75,50,35,60,88,42,30,55,70,45,60,30,85,65,50,40,75,60,50,45,70];
const recentConsultas=[{fazenda:"Faz. Horizonte Verde",car:"MT-5107040-9B4D7A...",data:"20/04/2026",status:"ok"},{fazenda:"Sítio Bela Vista",car:"PA-1502301-AB3D9F...",data:"19/04/2026",status:"alerta"},{fazenda:"Fazenda São João",car:"GO-5208004-C4E2A1...",data:"18/04/2026",status:"ok"},{fazenda:"Agropec. Santa Rosa",car:"MS-5003108-D7F3B2...",data:"17/04/2026",status:"embargo"}];

function Dashboard({user,setPage}){
  const[buscando]=useState(false);
  const irConsultar=(tipo,val)=>{if(val.trim())setPage("consulta");};
  return(<div><div style={{...S.card,background:`linear-gradient(135deg,${C.card} 0%,${C.green1}40 50%,${C.card} 100%)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}><div style={{fontSize:"clamp(17px,4vw,24px)",fontWeight:800,marginBottom:4}}>🌿 Bem-vindo, {user?.displayName?.split(" ")[0]||"Usuário"}!</div><div style={{color:C.textMuted,fontSize:13,marginBottom:16}}>CAR · CCIR · GPS · SIGEF · IBAMA · PRODES · Clima · NASA · Cotações</div><BuscaBox onConsultar={irConsultar} buscando={buscando}/></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>{[{icon:"🔍",val:"1.847",label:"Consultas Hoje",color:C.accent},{icon:"🌾",val:"34.291",label:"Imóveis",color:C.yellow},{icon:"🚨",val:"128",label:"Alertas",color:C.red},{icon:"✅",val:"98,4%",label:"Disponibilidade",color:C.blue}].map((s,i)=>(<div key={i} style={{...S.card,display:"flex",alignItems:"center",gap:10,padding:"14px"}}><div style={{width:38,height:38,borderRadius:10,background:`${s.color}20`,border:`1px solid ${s.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{s.icon}</div><div><div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.val}</div><div style={{fontSize:10,color:C.textMuted,marginTop:1}}>{s.label}</div></div></div>))}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,marginBottom:14}}><div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><span style={{fontSize:14,fontWeight:700}}>📋 Consultas Recentes</span><span style={S.chip(C.accent)}>Hoje</span></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:260}}><thead><tr>{["Fazenda","Data","Status"].map(h=><th key={h} style={S.tableTh}>{h}</th>)}</tr></thead><tbody>{recentConsultas.map((r,i)=>(<tr key={i}><td style={S.tableTd}><div style={{fontWeight:600}}>{r.fazenda}</div><div style={{fontSize:10,color:C.textMuted}}>{r.car}</div></td><td style={{...S.tableTd,color:C.textMuted}}>{r.data}</td><td style={S.tableTd}><span style={S.chip(r.status==="ok"?C.accent:r.status==="alerta"?C.yellow:C.red)}>{r.status==="ok"?"✓ OK":r.status==="alerta"?"⚠ Alerta":"⛔"}</span></td></tr>))}</tbody></table></div></div><div style={{display:"flex",flexDirection:"column",gap:14}}><div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:12,textAlign:"center"}}>🤖 Score IA Médio</div><div style={S.scoreRing}><div style={S.scoreInner}><div style={{fontSize:24,fontWeight:900,color:C.accentBright,lineHeight:1}}>78</div><div style={{fontSize:11,color:C.textMuted}}>/ 100</div></div></div><div style={{textAlign:"center",fontSize:11,color:C.textMuted}}>1.847 consultas hoje</div></div><div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:10}}>📡 Alertas Recentes</div>{[{msg:"Embargo IBAMA ativo",sub:"Faz. Santa Rosa · MS",color:C.red,icon:"⛔"},{msg:"Desmatamento detectado",sub:"Sítio Bela Vista · PA",color:C.orange,icon:"🛸"},{msg:"Moratória do Cerrado",sub:"Faz. Chapada · BA",color:C.yellow,icon:"🌱"}].map((a,i)=>(<div key={i} style={{display:"flex",gap:8,padding:"8px 10px",borderRadius:8,marginBottom:6,border:`1px solid ${a.color}40`,background:`${a.color}08`}}><span>{a.icon}</span><div><div style={{fontSize:12,fontWeight:600,color:a.color}}>{a.msg}</div><div style={{fontSize:11,opacity:0.7}}>{a.sub}</div></div></div>))}</div></div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}><div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:13,fontWeight:700}}>🌧️ Precipitação — 30 dias</span><span style={S.chip(C.blue)}>Sinop/MT</span></div><div style={S.precipBar}>{precipData.map((v,i)=><div key={i} style={S.precipCol(v)}/>)}</div><div style={{display:"flex",justifyContent:"space-between"}}>{["01","05","10","15","20","25","30"].map(d=><span key={d} style={{fontSize:10,color:C.textDim}}>{d}</span>)}</div></div><div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:14}}>🌿 Composição do Solo</div>{[["Argila",52,C.orange],["Areia",30,C.yellow],["Silte",18,C.accent]].map(([l,p,c])=>(<div key={l} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:700,color:c}}>{p}%</span></div><div style={{height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}><div style={S.chartBar(p,c)}/></div></div>))}<div style={{marginTop:10,padding:"8px 12px",background:`${C.bg}80`,borderRadius:8,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:C.textMuted}}>pH do solo</span><span style={{fontWeight:700,color:C.accentBright}}>6.2 — Ideal</span></div></div></div></div>);
}

function PlanosPage({user}){const[loadingPlano,setLoadingPlano]=useState(null);const[msgPagamento,setMsgPagamento]=useState(null);useEffect(()=>{const params=new URLSearchParams(window.location.search);const status=params.get("pagamento");if(status==="sucesso")setMsgPagamento({tipo:"sucesso",texto:"✅ Pagamento aprovado! Seus créditos foram liberados."});else if(status==="pendente")setMsgPagamento({tipo:"aviso",texto:"⏳ Pagamento pendente. Aguarde a confirmação."});else if(status==="erro")setMsgPagamento({tipo:"erro",texto:"❌ Pagamento não concluído. Tente novamente."});},[]);const assinar=async(planoId)=>{setLoadingPlano(planoId);try{const res=await fetch("/api/pagamento",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plano:planoId,userId:user?.uid,userEmail:user?.email})});const data=await res.json();if(data.sandboxInitPoint){window.location.href=data.sandboxInitPoint;}else{alert("Erro ao gerar pagamento.");}}catch{alert("Erro de conexão.");}setLoadingPlano(null);};const planos=[{id:"starter_mensal",title:"Starter",price:"49",per:"/mês",sub:"20 consultas inclusas",featured:false,features:["20 consultas/mês","Dados CAR completo","Score IA básico","Mapa interativo","Suporte por e-mail"]},{id:"pro_mensal",title:"Pro Mensal",price:"99",per:"/mês",sub:"100 consultas inclusas",featured:true,badge:"🔥 MAIS VENDIDO",features:["100 consultas/mês","INCRA, IBAMA, PRODES","Score IA avançado","Laudo PDF automático","Chat IA com a fazenda","WhatsApp Bot","Exportar KML"]},{id:"pro_anual",title:"Pro Anual",price:"79",per:"/mês · cobrado anualmente",sub:"100 consultas inclusas",featured:false,badge:"💰 ECONOMIA 20%",features:["100 consultas/mês","Tudo do Pro Mensal","Relatórios avançados","Alertas automáticos","Suporte prioritário"]}];return(<div style={{padding:"20px 16px"}}>{msgPagamento&&(<div style={{background:msgPagamento.tipo==="sucesso"?`${C.accent}15`:msgPagamento.tipo==="aviso"?`${C.yellow}15`:`${C.red}15`,border:`1px solid ${msgPagamento.tipo==="sucesso"?C.accent:msgPagamento.tipo==="aviso"?C.yellow:C.red}40`,borderRadius:12,padding:"14px 18px",marginBottom:20,fontSize:14,fontWeight:600,color:msgPagamento.tipo==="sucesso"?C.accentBright:msgPagamento.tipo==="aviso"?C.yellow:C.red,textAlign:"center"}}>{msgPagamento.texto}</div>)}<div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:"clamp(20px,5vw,30px)",fontWeight:900,marginBottom:8}}>Planos AGROMIND</div><div style={{color:C.textMuted,fontSize:13}}>Mais completo que o Dados Fazenda · Cancele quando quiser</div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,maxWidth:880,margin:"0 auto"}}>{planos.map((p)=>(<div key={p.id} style={{background:p.featured?`linear-gradient(160deg,${C.green1},${C.card})`:C.card,border:`1px solid ${p.featured?C.borderLight:C.border}`,borderRadius:18,padding:"24px 18px",position:"relative",boxShadow:p.featured?`0 0 40px ${C.green2}30`:"none"}}>{p.badge&&<div style={{position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",background:`linear-gradient(135deg,${C.accent},${C.green2})`,color:C.bg,fontSize:10,fontWeight:800,padding:"3px 12px",borderRadius:20,whiteSpace:"nowrap"}}>{p.badge}</div>}<div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{p.title}</div><div style={{fontSize:34,fontWeight:900,color:C.accentBright,lineHeight:1.1}}>R${p.price}</div><div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>{p.per}</div><div style={{fontSize:11,color:C.accent,fontWeight:600,marginBottom:16}}>✓ {p.sub} · Extras R$2,00</div>{p.features.map(f=><div key={f} style={{display:"flex",gap:8,fontSize:12,marginBottom:7,color:C.textMuted}}><span style={{color:C.accent}}>✓</span>{f}</div>)}<button onClick={()=>assinar(p.id)} disabled={loadingPlano===p.id} style={{width:"100%",padding:"11px 0",borderRadius:10,border:p.featured?"none":`1px solid ${C.borderLight}`,background:p.featured?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent",color:p.featured?C.text:C.accentBright,fontWeight:700,fontSize:13,cursor:loadingPlano===p.id?"default":"pointer",marginTop:18,opacity:loadingPlano===p.id?0.7:1}}>{loadingPlano===p.id?"⏳ Aguarde...":p.featured?"💳 Assinar Agora":"Começar"}</button></div>))}</div><div style={{textAlign:"center",marginTop:24,fontSize:12,color:C.textMuted}}>💳 PIX · Cartão · Boleto · 🔒 Pagamento 100% seguro via Mercado Pago</div></div>);}

function AdminPage(){const users=[{nome:"Carlos Mendes",email:"carlos@email.com",plano:"Anual Pro",consultas:87,status:"ativo"},{nome:"Ana Rodrigues",email:"ana@email.com",plano:"Mensal",consultas:23,status:"ativo"},{nome:"Faz. Pioneira",email:"contato@fazpioneira.com.br",plano:"Anual Pro",consultas:145,status:"ativo"},{nome:"João Pereira",email:"joao@email.com",plano:"Mensal",consultas:8,status:"inativo"}];return(<div style={{padding:"20px 14px"}}><div style={{marginBottom:18}}><div style={{fontSize:20,fontWeight:800,marginBottom:4}}>🛡️ Painel Administrativo</div><div style={{fontSize:12,color:C.textMuted}}>Visão exclusiva do dono</div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:18}}>{[{label:"Usuários Ativos",val:"1.247",icon:"👥",color:C.accent},{label:"Receita Mensal",val:"R$ 87.430",icon:"💰",color:C.yellow},{label:"Consultas Hoje",val:"4.821",icon:"🔍",color:C.blue},{label:"Churn Mensal",val:"2,1%",icon:"📉",color:C.orange},{label:"Ticket Médio",val:"R$ 94,60",icon:"💳",color:C.accentBright},{label:"NPS",val:"72",icon:"⭐",color:C.yellow}].map((a,i)=>(<div key={i} style={{...S.card,borderLeft:`3px solid ${a.color}`,padding:"14px"}}><div style={{fontSize:18,marginBottom:4}}>{a.icon}</div><div style={{fontSize:18,fontWeight:900,color:a.color}}>{a.val}</div><div style={{fontSize:10,color:C.textMuted,marginTop:2}}>{a.label}</div></div>))}</div><div style={{...S.card,padding:0,overflow:"hidden"}}><div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,fontSize:14,fontWeight:700}}>👤 Usuários Recentes</div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:360}}><thead><tr style={{background:`${C.green1}50`}}>{["Nome","Plano","Consultas","Status"].map(h=><th key={h} style={S.tableTh}>{h}</th>)}</tr></thead><tbody>{users.map((u,i)=><tr key={i}><td style={S.tableTd}><div style={{fontWeight:600}}>{u.nome}</div><div style={{fontSize:10,color:C.textMuted}}>{u.email}</div></td><td style={S.tableTd}><span style={S.chip(C.blue)}>{u.plano}</span></td><td style={S.tableTd}>{u.consultas}</td><td style={S.tableTd}><span style={S.chip(u.status==="ativo"?C.accent:C.textDim)}>{u.status}</span></td></tr>)}</tbody></table></div></div></div>);}

function PlaceholderPage({title,icon,desc}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:300,gap:16,padding:24,textAlign:"center"}}><div style={{fontSize:56}}>{icon}</div><div style={{fontSize:20,fontWeight:800}}>{title}</div><div style={{fontSize:13,color:C.textMuted,maxWidth:380}}>{desc}</div><div style={{...S.chip(C.accent),fontSize:13,padding:"6px 16px"}}>Em desenvolvimento 🚀</div></div>);}

function AuthScreen(){const[mode,setMode]=useState("login");const[name,setName]=useState("");const[email,setEmail]=useState("");const[password,setPassword]=useState("");const[confirm,setConfirm]=useState("");const[loading,setLoading]=useState(false);const[error,setError]=useState("");const[success,setSuccess]=useState("");const errMsg=(code)=>({"auth/user-not-found":"E-mail não encontrado.","auth/wrong-password":"Senha incorreta.","auth/email-already-in-use":"Este e-mail já está cadastrado.","auth/weak-password":"Senha fraca. Use no mínimo 6 caracteres.","auth/invalid-email":"E-mail inválido.","auth/invalid-credential":"E-mail ou senha incorretos.","auth/too-many-requests":"Muitas tentativas. Aguarde."}[code]||"Erro inesperado.");const handleLogin=async()=>{setError("");setLoading(true);try{await signInWithEmailAndPassword(auth,email,password);}catch(e){setError(errMsg(e.code));}setLoading(false);};const handleRegister=async()=>{setError("");setSuccess("");if(!name.trim())return setError("Digite seu nome.");if(password!==confirm)return setError("As senhas não coincidem.");if(password.length<6)return setError("Senha precisa ter pelo menos 6 caracteres.");setLoading(true);try{const cred=await createUserWithEmailAndPassword(auth,email,password);await updateProfile(cred.user,{displayName:name.trim()});setSuccess("Conta criada! Entrando...");}catch(e){setError(errMsg(e.code));}setLoading(false);};return(<div style={S.authPage}><div style={S.authBox}><div style={{textAlign:"center",marginBottom:32}}><div style={S.authLogoIcon}>🌿</div><div style={S.authLogoText}>AGROMIND</div><div style={{fontSize:13,color:C.textMuted,marginTop:4}}>Inteligência Rural · Plataforma SaaS</div></div><div style={{fontSize:20,fontWeight:800,marginBottom:6,textAlign:"center"}}>{mode==="login"?"Entrar na plataforma":"Criar sua conta"}</div><div style={{fontSize:13,color:C.textMuted,textAlign:"center",marginBottom:28}}>{mode==="login"?"Acesse seu painel":"Comece gratuitamente hoje"}</div>{error&&<div style={S.errorBox}>⚠️ {error}</div>}{success&&<div style={S.successBox}>✅ {success}</div>}{mode==="register"&&<div style={{marginBottom:16}}><label style={S.label}>Nome completo</label><input style={S.input} placeholder="Ex: João da Silva" value={name} onChange={e=>setName(e.target.value)}/></div>}<div style={{marginBottom:16}}><label style={S.label}>E-mail</label><input style={S.input} type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)}/></div><div style={{marginBottom:16}}><label style={S.label}>Senha</label><input style={S.input} type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&mode==="login"&&handleLogin()}/></div>{mode==="register"&&<div style={{marginBottom:16}}><label style={S.label}>Confirmar senha</label><input style={S.input} type="password" placeholder="••••••••" value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>}<button style={{...S.btn,opacity:loading?0.7:1}} onClick={mode==="login"?handleLogin:handleRegister} disabled={loading}>{loading?"⏳ Aguarde...":mode==="login"?"🚀 Entrar":"✅ Criar conta"}</button><div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0"}}><div style={{flex:1,height:1,background:C.border}}/><span style={{fontSize:12,color:C.textDim}}>ou</span><div style={{flex:1,height:1,background:C.border}}/></div><div style={{textAlign:"center",fontSize:13,color:C.textMuted}}>{mode==="login"?<>Não tem conta? <span style={{color:C.accentBright,cursor:"pointer",fontWeight:600}} onClick={()=>{setMode("register");setError("");}}>Cadastre-se grátis</span></>:<>Já tem conta? <span style={{color:C.accentBright,cursor:"pointer",fontWeight:600}} onClick={()=>{setMode("login");setError("");}}>Entrar</span></>}</div><div style={{marginTop:20,padding:"12px",background:`${C.green1}30`,borderRadius:8,border:`1px solid ${C.border}`,textAlign:"center"}}><div style={{fontSize:11,color:C.textMuted}}>🔒 Dados protegidos · Firebase Google · SSL</div></div></div></div>);}

function SidebarContent({user,page,setPage,onClose,handleLogout,creditos,cor}){return(<><div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🌿</div><div><div style={{fontSize:19,fontWeight:800,background:`linear-gradient(135deg,${C.accentBright},${C.accent})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AGROMIND</div><div style={{fontSize:9,color:C.textMuted,letterSpacing:"2px",textTransform:"uppercase"}}>Inteligência Rural</div></div></div></div><nav style={{flex:1,padding:"14px 10px",overflowY:"auto"}}>{NAV.map(sec=>(<div key={sec.section} style={{marginBottom:20}}><div style={{fontSize:10,color:C.textDim,letterSpacing:"1.5px",textTransform:"uppercase",padding:"0 8px",marginBottom:6}}>{sec.section}</div>{sec.items.map(item=>(<div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,cursor:"pointer",marginBottom:2,background:page===item.id?`${C.green1}80`:"transparent",border:page===item.id?`1px solid ${C.border}`:"1px solid transparent",color:page===item.id?C.accentBright:C.textMuted,fontSize:13.5,fontWeight:page===item.id?600:400,WebkitTapHighlightColor:"transparent"}} onClick={()=>{setPage(item.id);onClose&&onClose();}}><span style={{fontSize:16,width:20,textAlign:"center"}}>{item.icon}</span>{item.label}</div>))}</div>))}</nav><div style={{padding:"14px 10px",borderTop:`1px solid ${C.border}`,flexShrink:0}}><div style={{background:`linear-gradient(135deg,${C.green1},${C.card})`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2}}>👤 {user.displayName||"Usuário"}</div><div style={{fontSize:11,color:C.textMuted,marginBottom:8}}>{user.email}</div><button style={{width:"100%",padding:"7px 0",borderRadius:8,background:`${C.red}15`,border:`1px solid ${C.red}30`,color:C.red,fontSize:12,fontWeight:600,cursor:"pointer"}} onClick={handleLogout}>🚪 Sair da conta</button></div><div style={{background:`${C.green1}30`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.textMuted}}>⚡ Créditos</span><span style={{fontSize:16,fontWeight:900,color:cor||C.accent}}>{creditos||0}</span></div></div></>);}

export default function App(){
  const[user,setUser]=useState(null);const[loading,setLoading]=useState(true);const[page,setPage]=useState("dashboard");const[drawerOpen,setDrawerOpen]=useState(false);const[showSemCreditos,setShowSemCreditos]=useState(false);
  useEffect(()=>{const unsub=onAuthStateChanged(auth,(u)=>{setUser(u);setLoading(false);});return unsub;},[]);
  const{creditos,plano,cor,usarCredito}=useCredits(user);
  if(loading)return(<div style={{...S.authPage,flexDirection:"column",gap:16}}><div style={{fontSize:48}}>🌿</div><div style={{fontSize:18,fontWeight:700,color:C.accentBright}}>Carregando AGROMIND...</div></div>);
  if(!user)return <AuthScreen/>;
  const handleLogout=async()=>{await signOut(auth);setUser(null);};
  const initials=user.displayName?user.displayName.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase():user.email.substring(0,2).toUpperCase();
  const allItems=NAV.flatMap(s=>s.items);
  const isFullPage=page==="mapa"||page==="planos"||page==="admin"||page==="ia"||page==="consulta";
  const pageMap={
    dashboard:<Dashboard user={user} setPage={setPage}/>,
    consulta:<ConsultaPage usarCredito={usarCredito} creditos={creditos} onSemCreditos={()=>setShowSemCreditos(true)} setPage={setPage}/>,
    mapa:<MapaPage/>,
    ia:<IAPage usarCredito={usarCredito} creditos={creditos} onSemCreditos={()=>setShowSemCreditos(true)}/>,
    embargos:<PlaceholderPage icon="⛔" title="Embargos IBAMA" desc="Consulta em tempo real de embargos ambientais ativos no IBAMA."/>,
    prodes:<PlaceholderPage icon="📡" title="PRODES/INPE" desc="Alertas de desmatamento e degradação florestal via PRODES e DETER."/>,
    precipitacao:<PlaceholderPage icon="💧" title="Precipitação" desc="Histórico de chuvas dos últimos 30 dias por região."/>,
    whatsapp:<PlaceholderPage icon="💬" title="WhatsApp Bot" desc="Consulte fazendas direto pelo WhatsApp."/>,
    planos:<PlanosPage user={user}/>,
    admin:<AdminPage/>,
  };
  return(<div style={S.app}><style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0f0a;overflow-x:hidden;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:#0a0f0a;}::-webkit-scrollbar-thumb{background:#1e3a1e;border-radius:3px;}input::placeholder{color:#3d6b3d;}.agro-sidebar{position:fixed;top:0;left:0;width:240px;height:100vh;background:${C.surface};border-right:1px solid ${C.border};display:flex;flex-direction:column;z-index:100;}.agro-main{margin-left:240px;min-height:100vh;display:flex;flex-direction:column;}.agro-topbar{background:${C.surface}ee;backdrop-filter:blur(12px);border-bottom:1px solid ${C.border};padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50;}.agro-content{padding:24px;flex:1;}.agro-content-full{flex:1;}.agro-hamburger{display:none;}.agro-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:200;backdrop-filter:blur(2px);}.agro-overlay.open{display:block;}.agro-drawer{display:none;position:fixed;top:0;left:0;bottom:0;width:280px;background:${C.surface};z-index:300;flex-direction:column;transform:translateX(-100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);overflow:hidden;}.agro-drawer.open{transform:translateX(0);}.agro-bottom-nav{display:none;}@media(max-width:768px){.agro-sidebar{display:none!important;}.agro-hamburger{display:flex!important;}.agro-drawer{display:flex!important;}.agro-main{margin-left:0!important;width:100%!important;}.agro-content{padding:14px 12px 80px!important;}.agro-content-full{padding-bottom:64px;}.agro-bottom-nav{display:flex!important;position:fixed;bottom:0;left:0;right:0;background:${C.surface};border-top:1px solid ${C.border};z-index:100;height:64px;}}@supports(padding-bottom:env(safe-area-inset-bottom)){@media(max-width:768px){.agro-bottom-nav{height:calc(64px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);}}}`}</style><div className={`agro-overlay ${drawerOpen?"open":""}`} onClick={()=>setDrawerOpen(false)}/><div className={`agro-drawer ${drawerOpen?"open":""}`}><SidebarContent user={user} page={page} setPage={setPage} onClose={()=>setDrawerOpen(false)} handleLogout={handleLogout} creditos={creditos} cor={cor}/></div><aside className="agro-sidebar"><SidebarContent user={user} page={page} setPage={setPage} handleLogout={handleLogout} creditos={creditos} cor={cor}/></aside><div className="agro-main"><div className="agro-topbar"><div style={{display:"flex",alignItems:"center",gap:10}}><button className="agro-hamburger" onClick={()=>setDrawerOpen(true)} style={{width:40,height:40,borderRadius:10,background:C.card,border:`1px solid ${C.border}`,color:C.text,cursor:"pointer",fontSize:20,alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>☰</button><div style={{fontSize:"clamp(14px,3vw,17px)",fontWeight:700}}>{allItems.find(i=>i.id===page)?.label||"Dashboard"}</div></div><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{display:"flex",alignItems:"center",gap:4,background:`${cor||C.accent}15`,border:`1px solid ${cor||C.accent}40`,borderRadius:20,padding:"4px 10px"}}><span style={{fontSize:11}}>⚡</span><span style={{fontSize:12,fontWeight:700,color:cor||C.accent}}>{creditos}</span></div><div style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px 5px 5px",cursor:"pointer"}}><div style={{width:26,height:26,borderRadius:6,background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{initials}</div><span style={{fontSize:13,fontWeight:600}}>{user.displayName?.split(" ")[0]||"Usuário"}</span></div></div></div><div className={isFullPage?"agro-content-full":"agro-content"}>{pageMap[page]||pageMap.dashboard}</div></div><nav className="agro-bottom-nav">{BOTTOM_NAV.map(item=>(<div key={item.id} onClick={()=>setPage(item.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",color:page===item.id?C.accent:C.textMuted,borderTop:page===item.id?`2px solid ${C.accent}`:"2px solid transparent",paddingTop:4,WebkitTapHighlightColor:"transparent",userSelect:"none"}}><span style={{fontSize:20}}>{item.icon}</span><span style={{fontSize:9,fontWeight:page===item.id?700:400}}>{item.label}</span></div>))}</nav>{showSemCreditos&&(<SemCreditosModal user={user} plano={plano} onClose={()=>setShowSemCreditos(false)} onUpgrade={()=>{setShowSemCreditos(false);setPage("planos");}}/>)}</div>);
}
