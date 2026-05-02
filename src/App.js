import { useState, useEffect, useCallback, useRef } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "firebase/auth";
import { doc, onSnapshot, getDoc, setDoc, updateDoc, increment, serverTimestamp, collection, addDoc, query, orderBy, limit, getDocs } from "firebase/firestore";
import MapaPage from "./mapapage";

const C={bg:"#0a0f0a",surface:"#0f1a0f",card:"#111d11",border:"#1e3a1e",borderLight:"#2a4f2a",green1:"#0d5c2e",green2:"#12803f",green3:"#16a34a",accent:"#22c55e",accentBright:"#4ade80",text:"#e8f5e9",textMuted:"#6b9e6b",textDim:"#3d6b3d",yellow:"#fbbf24",red:"#ef4444",orange:"#f97316",blue:"#3b82f6",purple:"#a78bfa"};
const S={app:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"},chip:(c)=>({display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:`${c}20`,color:c,border:`1px solid ${c}30`}),card:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px"},chartBar:(p,c)=>({height:"100%",width:`${p}%`,background:`linear-gradient(90deg,${c}80,${c})`,borderRadius:3}),scoreRing:{width:110,height:110,borderRadius:"50%",background:`conic-gradient(${C.accent} 0deg,${C.accent} ${0.78*360}deg,${C.border} ${0.78*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"},scoreInner:{width:82,height:82,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"},precipBar:{display:"flex",alignItems:"flex-end",gap:3,height:70,marginBottom:6},precipCol:(h)=>({flex:1,height:`${h}%`,background:`linear-gradient(180deg,${C.blue}90,${C.blue}40)`,borderRadius:"3px 3px 0 0",minHeight:3}),tableTh:{padding:"10px",fontSize:10,fontWeight:700,color:C.textMuted,letterSpacing:"0.5px",textTransform:"uppercase",textAlign:"left"},tableTd:{padding:"10px",fontSize:12,borderBottom:`1px solid ${C.border}`,color:C.text}};

function limparMarkdown(t){if(!t)return t;return t.replace(/\*\*(.+?)\*\*/g,"$1").replace(/\*(.+?)\*/g,"$1").replace(/#{1,6}\s+/g,"").replace(/`(.+?)`/g,"$1").trim();}
async function salvarConsultaFS(uid,dados){try{await addDoc(collection(db,"usuarios",uid,"historico"),{nome:dados.sicar?.nome||dados.car||"Imóvel Rural",car:dados.car||dados.sicar?.car||"—",municipio:dados.sicar?.municipio?`${dados.sicar.municipio}/${dados.sicar.uf}`:"—",status:dados.ibama?.temEmbargo?"embargo":dados.prodes?.temAlerta?"alerta":"ok",score:dados.score?.valor??0,criadoEm:serverTimestamp()});}catch(e){}}
async function buscarHistoricoFS(uid,qtd=5){try{const q=query(collection(db,"usuarios",uid,"historico"),orderBy("criadoEm","desc"),limit(qtd));const snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()}));}catch{return[];}}

const TIPOS_BUSCA=[{id:"car",label:"CAR",icon:"📋",placeholder:"Ex: MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C"},{id:"itr",label:"ITR",icon:"💰",placeholder:"Ex: 12.345.678-9"},{id:"ccir",label:"CCIR",icon:"📄",placeholder:"Ex: 800.429.7412-9"},{id:"gps",label:"GPS",icon:"📍",placeholder:"Ex: -11.8456, -55.1987"},{id:"fazenda",label:"Fazenda",icon:"🌾",placeholder:"Ex: Fazenda Horizonte Verde"},{id:"endereco",label:"Endereço",icon:"🏠",placeholder:"Ex: Sinop, Mato Grosso"},{id:"proprietario",label:"Proprietário",icon:"👤",placeholder:"Ex: João da Silva"}];
const NAV=[{section:"Principal",items:[{icon:"⊞",label:"Dashboard",id:"dashboard"},{icon:"🔍",label:"Consultar Imóvel",id:"consulta"},{icon:"🗺️",label:"Mapa Interativo",id:"mapa"},{icon:"🤖",label:"IA & Score",id:"ia"}]},{section:"Ambiental",items:[{icon:"🌿",label:"Embargos IBAMA",id:"embargos"},{icon:"📡",label:"PRODES/INPE",id:"prodes"},{icon:"💧",label:"Precipitação",id:"precipitacao"}]},{section:"Sistema",items:[{icon:"💬",label:"WhatsApp Bot",id:"whatsapp"},{icon:"💳",label:"Planos & Preços",id:"planos"},{icon:"🛡️",label:"Painel Admin",id:"admin"}]}];
const BOTTOM_NAV=[{icon:"⊞",label:"Início",id:"dashboard"},{icon:"🗺️",label:"Mapa",id:"mapa"},{icon:"🔍",label:"Buscar",id:"consulta"},{icon:"💳",label:"Planos",id:"planos"},{icon:"🛡️",label:"Admin",id:"admin"}];

// 2 créditos reais, mostra "3 grátis" na interface
async function criarUsuarioFS(uid,email,nome){try{const ref=doc(db,"usuarios",uid);const snap=await getDoc(ref);if(snap.exists())return snap.data();const dados={uid,email,nome,plano:"gratuito",creditos:2,creditosUsados:0,totalConsultas:0,criadoEm:serverTimestamp()};await setDoc(ref,dados);return dados;}catch(e){}}
async function descontarCreditoFS(uid,desc="Consulta"){try{const ref=doc(db,"usuarios",uid);const snap=await getDoc(ref);if(!snap.exists()||snap.data().creditos<=0)return{sucesso:false,motivo:"sem_creditos"};const d=snap.data();await updateDoc(ref,{creditos:increment(-1),creditosUsados:increment(1),totalConsultas:increment(1),ultimaConsulta:serverTimestamp()});return{sucesso:true,creditos:d.creditos-1};}catch{return{sucesso:false};}}

function useCredits(user){
  const[creditos,setCreditos]=useState(0);const[plano,setPlano]=useState("gratuito");const[loading,setLoading]=useState(true);
  useEffect(()=>{if(!user?.uid)return;criarUsuarioFS(user.uid,user.email,user.displayName||"Usuário");const ref=doc(db,"usuarios",user.uid);const unsub=onSnapshot(ref,(snap)=>{if(snap.exists()){const d=snap.data();setCreditos(d.creditos||0);setPlano(d.plano||"gratuito");}setLoading(false);});return unsub;},[user]);
  const usarCredito=useCallback(async(desc)=>{if(!user?.uid)return{sucesso:false};return await descontarCreditoFS(user.uid,desc);},[user]);
  const cor=creditos>1?"#22c55e":creditos===1?"#fbbf24":"#ef4444";
  return{creditos,plano,loading,cor,usarCredito};
}

// ─── POPUP 1: CADASTRO (aparece quando visitante clica em qualquer ferramenta) ───
function PopupCadastro({onFechar}){
  const[mode,setMode]=useState("register");
  const[name,setName]=useState("");const[email,setEmail]=useState("");const[pass,setPass]=useState("");const[confirm,setConfirm]=useState("");
  const[loading,setLoading]=useState(false);const[erro,setErro]=useState("");const[sucesso,setSucesso]=useState("");
  const errMsg=(code)=>({"auth/email-already-in-use":"E-mail já cadastrado.","auth/weak-password":"Senha fraca. Mínimo 6 caracteres.","auth/invalid-email":"E-mail inválido.","auth/invalid-credential":"E-mail ou senha incorretos.","auth/user-not-found":"E-mail não encontrado.","auth/wrong-password":"Senha incorreta.","auth/too-many-requests":"Muitas tentativas. Aguarde."}[code]||"Erro inesperado.");
  const handleRegister=async()=>{setErro("");if(!name.trim())return setErro("Digite seu nome.");if(pass!==confirm)return setErro("As senhas não coincidem.");if(pass.length<6)return setErro("Mínimo 6 caracteres.");setLoading(true);try{const cred=await createUserWithEmailAndPassword(auth,email,pass);await updateProfile(cred.user,{displayName:name.trim()});setSucesso("Conta criada! Seus 3 créditos já estão disponíveis 🎉");setTimeout(()=>onFechar(),1500);}catch(e){setErro(errMsg(e.code));}setLoading(false);};
  const handleLogin=async()=>{setErro("");setLoading(true);try{await signInWithEmailAndPassword(auth,email,pass);onFechar();}catch(e){setErro(errMsg(e.code));}setLoading(false);};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.90)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:24,width:"100%",maxWidth:420,position:"relative",overflow:"hidden"}}>
        <button onClick={onFechar} style={{position:"absolute",top:14,right:14,width:30,height:30,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,color:C.textMuted,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>×</button>

        {/* Header verde */}
        <div style={{background:`linear-gradient(135deg,${C.green1},#0a2412)`,padding:"28px 28px 20px",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:8}}>🌿</div>
          <div style={{fontSize:20,fontWeight:900,color:C.accentBright,marginBottom:4}}>
            {mode==="register"?"Crie sua conta grátis!":"Bem-vindo de volta!"}
          </div>
          {mode==="register"&&(
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:`${C.accent}20`,border:`1px solid ${C.accent}40`,borderRadius:20,padding:"6px 16px",marginTop:4}}>
              <span style={{fontSize:16}}>🎁</span>
              <span style={{fontSize:13,fontWeight:700,color:C.accent}}>Ganhe 3 créditos grátis ao cadastrar!</span>
            </div>
          )}
        </div>

        {/* Form */}
        <div style={{padding:"24px 28px"}}>
          {erro&&<div style={{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.red,marginBottom:14}}>{erro}</div>}
          {sucesso&&<div style={{background:`${C.accent}15`,border:`1px solid ${C.accent}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.accentBright,marginBottom:14}}>{sucesso}</div>}

          {mode==="register"&&(
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:C.textMuted,marginBottom:5,display:"block",fontWeight:600}}>Nome completo</label>
              <input style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} placeholder="Ex: João da Silva" value={name} onChange={e=>setName(e.target.value)}/>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,color:C.textMuted,marginBottom:5,display:"block",fontWeight:600}}>E-mail</label>
            <input style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)}/>
          </div>
          <div style={{marginBottom:mode==="register"?14:20}}>
            <label style={{fontSize:12,color:C.textMuted,marginBottom:5,display:"block",fontWeight:600}}>Senha</label>
            <input style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} type="password" placeholder="Mínimo 6 caracteres" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():null)}/>
          </div>
          {mode==="register"&&(
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,color:C.textMuted,marginBottom:5,display:"block",fontWeight:600}}>Confirmar senha</label>
              <input style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} type="password" placeholder="Repita a senha" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleRegister()}/>
            </div>
          )}

          <button onClick={mode==="register"?handleRegister:handleLogin} disabled={loading} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:loading?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:800,fontSize:15,cursor:loading?"default":"pointer"}}>
            {loading?"Aguarde...":(mode==="register"?"Criar conta grátis 🚀":"Entrar")}
          </button>

          <div style={{textAlign:"center",marginTop:16,fontSize:13,color:C.textMuted}}>
            {mode==="register"
              ?<>Já tem conta? <span style={{color:C.accentBright,cursor:"pointer",fontWeight:700}} onClick={()=>{setMode("login");setErro("");}}>Entrar</span></>
              :<>Não tem conta? <span style={{color:C.accentBright,cursor:"pointer",fontWeight:700}} onClick={()=>{setMode("register");setErro("");}}>Cadastrar grátis</span></>
            }
          </div>
          <div style={{textAlign:"center",marginTop:12,fontSize:10,color:C.textDim}}>🔒 Dados protegidos — Firebase Google — SSL</div>
        </div>
      </div>
    </div>
  );
}

// ─── POPUP 2: PLANOS (aparece quando créditos acabam) ───
function PopupPlanos({onFechar,onVerPlanos}){
  const planos=[
    {id:"starter_mensal",title:"Starter",price:"49",per:"/mês",creditos:"20 consultas",features:["CAR, ITR, CCIR, GPS","Score IA básico","Mapa interativo","Laudo PDF"],featured:false},
    {id:"pro_mensal",title:"Pro Mensal",price:"99",per:"/mês",creditos:"100 consultas",badge:"MAIS VENDIDO",features:["Tudo do Starter","IBAMA + PRODES","Score IA avançado","Chat IA com a fazenda","WhatsApp Bot"],featured:true},
    {id:"pro_anual",title:"Pro Anual",price:"79",per:"/mês",creditos:"100 consultas",badge:"ECONOMIA 20%",features:["Tudo do Pro","Alertas automáticos","Relatórios avançados","Suporte prioritário"],featured:false},
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16,overflowY:"auto"}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:24,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto",position:"relative"}}>
        <button onClick={onFechar} style={{position:"absolute",top:14,right:14,width:30,height:30,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,color:C.textMuted,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>×</button>

        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${C.green1},#0a2412)`,borderRadius:"24px 24px 0 0",padding:"28px 28px 24px",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:8}}>🔒</div>
          <div style={{fontSize:22,fontWeight:900,color:C.accentBright,marginBottom:6}}>Seus créditos acabaram!</div>
          <div style={{fontSize:13,color:C.textMuted}}>Você adorou o AgroMind! Escolha um plano e continue consultando.</div>
        </div>

        <div style={{padding:"24px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:20}}>
            {planos.map((p)=>(
              <div key={p.id} style={{background:p.featured?`linear-gradient(160deg,${C.green1},${C.card})`:C.bg,border:`1px solid ${p.featured?C.borderLight:C.border}`,borderRadius:16,padding:"20px 16px",position:"relative",boxShadow:p.featured?`0 0 30px ${C.green2}30`:"none"}}>
                {p.badge&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:`linear-gradient(135deg,${C.accent},${C.green2})`,color:C.bg,fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap"}}>{p.badge}</div>}
                <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:2}}>{p.title}</div>
                <div style={{fontSize:30,fontWeight:900,color:C.accentBright,lineHeight:1.1}}>R${p.price}</div>
                <div style={{fontSize:10,color:C.textMuted,marginBottom:4}}>{p.per}</div>
                <div style={{fontSize:11,color:C.accent,fontWeight:600,marginBottom:12}}>{p.creditos} incluídas</div>
                {p.features.map(f=>(<div key={f} style={{display:"flex",gap:6,fontSize:11,marginBottom:5,color:C.textMuted}}><span style={{color:C.accent}}>✓</span>{f}</div>))}
                <button onClick={()=>{onFechar();onVerPlanos();}} style={{width:"100%",padding:"10px 0",borderRadius:8,border:p.featured?"none":`1px solid ${C.borderLight}`,background:p.featured?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent",color:p.featured?C.text:C.accentBright,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:14}}>
                  {p.featured?"Assinar Agora":"Começar"}
                </button>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center",fontSize:11,color:C.textDim}}>💳 PIX · Cartão · Boleto — Pagamento seguro via Mercado Pago</div>
          <button onClick={onFechar} style={{display:"block",margin:"12px auto 0",padding:"8px 24px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:12,cursor:"pointer"}}>Agora não</button>
        </div>
      </div>
    </div>
  );
}

function BuscaBox({onConsultar,buscando,user,onNaoCadastrado}){
  const[tipo,setTipo]=useState("car");const[val,setVal]=useState("");
  const tipoAtual=TIPOS_BUSCA.find(t=>t.id===tipo);
  const handleConsultar=()=>{if(!val.trim())return;if(!user){onNaoCadastrado();return;}onConsultar(tipo,val.trim());};
  return(<div><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{TIPOS_BUSCA.map(t=>(<button key={t.id} onClick={()=>{setTipo(t.id);setVal("");}} translate="no" style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${tipo===t.id?C.accent:C.border}`,background:tipo===t.id?`${C.accent}20`:"transparent",color:tipo===t.id?C.accent:C.textMuted,fontSize:11,fontWeight:tipo===t.id?700:400,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><span>{t.icon}</span>{t.label}</button>))}</div><div style={{display:"flex",gap:8}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",color:C.text,fontSize:13,outline:"none",height:42}} placeholder={tipoAtual?.placeholder||""} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleConsultar()} onClick={()=>{if(!user)onNaoCadastrado();}}/><button onClick={handleConsultar} disabled={buscando} style={{background:buscando?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:13,padding:"0 20px",cursor:buscando?"default":"pointer",height:42,whiteSpace:"nowrap",flexShrink:0}}>{buscando?"Buscando...":"Consultar"}</button></div></div>);
}

const PERGUNTAS_RAPIDAS=["Qual o score de risco?","Tem embargo ativo?","A Reserva Legal está regular?","Pode financiar esta propriedade?","Situação ambiental geral?","Calcule o ITR estimado"];
function ScoreGauge({score}){const cor=score>=70?C.accent:score>=40?C.yellow:C.red;const label=score>=70?"Baixo Risco":score>=40?"Risco Médio":"Alto Risco";return(<div style={{textAlign:"center",padding:"12px 0"}}><div style={{width:90,height:90,borderRadius:"50%",background:`conic-gradient(${cor} 0deg,${cor} ${(score/100)*360}deg,${C.border} ${(score/100)*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px"}}><div style={{width:68,height:68,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:20,fontWeight:900,color:cor,lineHeight:1}}>{score}</div><div style={{fontSize:9,color:C.textMuted}}>/100</div></div></div><div style={{fontSize:12,fontWeight:700,color:cor}}>{label}</div></div>);}

function ConsultaPage({user,usarCredito,creditos,onSemCreditos,setPage,onNaoCadastrado}){
  const[buscando,setBuscando]=useState(false);const[resultado,setResultado]=useState(null);const[erro,setErro]=useState(null);
  const consultar=async(tipo,val)=>{
    if(buscando)return;
    if(!user){onNaoCadastrado();return;}
    if(creditos<=0){onSemCreditos();return;}
    const cr=await usarCredito(`Consulta ${tipo}: ${val.substring(0,40)}`);
    if(cr?.motivo==="sem_creditos"){onSemCreditos();return;}
    setBuscando(true);setErro(null);setResultado(null);
    try{
      let body={};
      if(tipo==="gps"){const gps=val.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);if(!gps){setErro("GPS inválido. Use: -11.8456, -55.1987");setBuscando(false);return;}body={lat:parseFloat(gps[1]),lng:parseFloat(gps[2])};}
      else if(tipo==="ccir"){body={ccir:val};}else if(tipo==="itr"){body={itr:val};}
      else if(tipo==="endereco"){const geo=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=1&countrycodes=br`);const gd=await geo.json();if(!gd?.length){setErro("Endereço não encontrado.");setBuscando(false);return;}body={lat:parseFloat(gd[0].lat),lng:parseFloat(gd[0].lon)};}
      else if(tipo==="proprietario"){body={proprietario:val};}else if(tipo==="fazenda"){body={nomeFazenda:val};}else{body={car:val};}
      const resp=await fetch("/api/consulta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const dados=await resp.json();
      if(!dados.sucesso){setErro(dados.error||"Erro na consulta.");setBuscando(false);return;}
      setResultado(dados);
      if(user?.uid)await salvarConsultaFS(user.uid,dados);
    }catch{setErro("Erro de conexão. Tente novamente.");}
    setBuscando(false);
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
    {buscando&&<div style={{...S.card,textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:48,marginBottom:16}}>🔍</div><div style={{fontSize:16,fontWeight:700,color:C.accentBright,marginBottom:8}}>Consultando fontes oficiais...</div><div style={{fontSize:13,color:C.textMuted}}>SICAR · IBAMA · PRODES · SIGEF · Open-Meteo · NASA POWER · CEPEA</div></div>}
    {r&&!buscando&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.green1}30)`,borderRadius:18,padding:"20px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}><div><div style={{fontSize:18,fontWeight:800,color:C.accentBright,marginBottom:4}}>{r.sicar?.nome||r.car||"Imóvel Rural"}</div><div style={{fontSize:13,color:C.textMuted,marginBottom:8}}>📍 {r.sicar?.municipio&&`${r.sicar.municipio}, `}{r.sicar?.uf||""}</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><span style={S.chip(r.sicar?.encontrado?C.accent:C.red)}>{r.sicar?.encontrado?"CAR Localizado":"CAR não encontrado"}</span><span style={S.chip(r.ibama?.temEmbargo?C.red:C.accent)}>{r.ibama?.temEmbargo?`${r.ibama.totalEmbargos} Embargo(s)`:"Sem Embargo"}</span><span style={S.chip(r.prodes?.temAlerta?C.orange:C.accent)}>{r.prodes?.temAlerta?`${r.prodes.totalAlertas} Alerta(s)`:"Sem Alerta PRODES"}</span></div></div><div style={{background:C.card,border:`1px solid ${scoreCor}40`,borderRadius:14,padding:"16px 20px",textAlign:"center",minWidth:100}}><div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Score IA</div><div style={{fontSize:36,fontWeight:900,color:scoreCor,lineHeight:1}}>{score?.valor??0}</div><div style={{fontSize:10,color:C.textMuted}}>/100</div><div style={{fontSize:11,color:scoreCor,marginTop:4,fontWeight:700}}>{score?.nivel}</div></div></div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
        {r.sicar?.encontrado&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:C.accentBright}}>Dados SICAR/CAR</div>{[["CAR",r.sicar.car?.substring(0,22)+"..."],["Área Total",r.sicar.area],["Módulos",r.sicar.modulos],["Proprietário",r.sicar.proprietario],["Situação",r.sicar.situacaoLabel],["APP",r.sicar.app],["Res. Legal",r.sicar.rl]].filter(([,v])=>v).map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:600,color:C.text,textAlign:"right",maxWidth:150}}>{v}</span></div>))}</div>)}
        {r.sigef?.encontrado&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:C.blue}}>SIGEF/INCRA</div>{[["Denominação",r.sigef.denominacao],["Área",r.sigef.area],["Município",r.sigef.municipio],["UF",r.sigef.uf],["CCIR",r.sigef.ccir]].filter(([,v])=>v).map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:600,color:C.text}}>{v}</span></div>))}</div>)}
        <div style={{...S.card,border:`1px solid ${r.ibama?.temEmbargo?C.red:C.accent}30`}}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:r.ibama?.temEmbargo?C.red:C.accent}}>Embargos IBAMA</div>{!r.ibama?.temEmbargo?(<div style={{textAlign:"center",padding:"12px 0"}}><div style={{fontSize:32,marginBottom:8}}>✅</div><div style={{fontSize:13,fontWeight:700,color:C.accent}}>Nenhum embargo ativo</div></div>):r.ibama.embargos?.map((e,i)=>(<div key={i} style={{padding:"8px 10px",marginBottom:8,border:`1px solid ${C.red}30`,borderRadius:8,background:`${C.red}08`}}><div style={{fontSize:12,fontWeight:700,color:C.red}}>{e.numero}</div><div style={{fontSize:11,color:C.textMuted}}>{e.tipo} - {e.data}</div></div>))}</div>
        <div style={{...S.card,border:`1px solid ${r.prodes?.temAlerta?C.orange:C.accent}30`}}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:r.prodes?.temAlerta?C.orange:C.accent}}>PRODES/INPE</div>{!r.prodes?.temAlerta?(<div style={{textAlign:"center",padding:"12px 0"}}><div style={{fontSize:32,marginBottom:8}}>✅</div><div style={{fontSize:13,fontWeight:700,color:C.accent}}>Nenhum alerta</div></div>):(<div style={{fontSize:13,fontWeight:700,color:C.orange}}>{r.prodes.totalAlertas} alerta(s) — {r.prodes.areaDesmatadaKm2} km²</div>)}</div>
        {r.clima?.encontrado&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:12,color:C.blue}}>Clima</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{[["Temperatura",`${r.clima.atual?.temperatura??'--'}°C`],["Umidade",`${r.clima.atual?.umidade??'--'}%`],["Vento",`${r.clima.atual?.vento??'--'} km/h`],["Chuva 30d",`${r.clima.precipTotal30d??0} mm`]].map(([l,v])=>(<div key={l} style={{background:`${C.blue}10`,border:`1px solid ${C.blue}20`,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:10,color:C.textMuted}}>{l}</div><div style={{fontSize:14,fontWeight:800,color:C.blue}}>{v}</div></div>))}</div></div>)}
        {r.cotacoes?.encontrado&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,color:C.yellow,marginBottom:12}}>Cotações CEPEA</div>{Object.entries(r.cotacoes.produtos||{}).map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:12,fontWeight:600}}>{v.nome}</div><div style={{fontSize:13,fontWeight:800,color:C.yellow}}>{v.preco?`R$ ${Number(v.preco).toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"}</div></div>))}</div>)}
        {score?.fatores&&(<div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Análise de Risco IA</div>{score.fatores.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",marginBottom:6,borderRadius:8,border:`1px solid ${f.cor}30`,background:`${f.cor}08`}}><span style={{fontSize:12,color:C.textMuted}}>{f.label}</span><span style={{fontSize:12,fontWeight:700,color:f.cor}}>{f.impacto===0?"OK":f.impacto}</span></div>))}</div>)}
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button onClick={()=>setPage("mapa")} style={{flex:1,minWidth:140,padding:"12px",borderRadius:10,background:`linear-gradient(135deg,${C.green2},${C.green3})`,border:"none",color:C.text,fontWeight:700,fontSize:13,cursor:"pointer"}}>Ver no Mapa</button><button onClick={()=>setPage("ia")} style={{flex:1,minWidth:140,padding:"12px",borderRadius:10,background:`linear-gradient(135deg,${C.blue},#6366f1)`,border:"none",color:C.text,fontWeight:700,fontSize:13,cursor:"pointer"}}>Consultar IA</button></div>
    </div>)}
  </div>);
}

function EmbargoPage(){const[car,setCar]=useState("");const[buscando,setBuscando]=useState(false);const[resultado,setResultado]=useState(null);const[erro,setErro]=useState(null);const buscar=async()=>{if(!car.trim()||buscando)return;setBuscando(true);setErro(null);setResultado(null);try{const url=`https://servicos.ibama.gov.br/phpesp/public/embargo/consultarEmbargoPublico.php?num_car=${encodeURIComponent(car.trim())}&formato=json`;const resp=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!resp.ok)throw new Error();const data=await resp.json();const embargos=Array.isArray(data)?data:(data.data||data.result||[]);setResultado({embargos,car:car.trim()});}catch{setErro("Não foi possível consultar o IBAMA.");}setBuscando(false);};return(<div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}><div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.red}15)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}><div style={{fontSize:"clamp(17px,4vw,22px)",fontWeight:800,marginBottom:4}}>Embargos IBAMA</div><div style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Consulte embargos ambientais por código CAR</div><div style={{display:"flex",gap:8}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",color:C.text,fontSize:13,outline:"none",height:42}} placeholder="Ex: MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C" value={car} onChange={e=>setCar(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()}/><button onClick={buscar} disabled={buscando||!car.trim()} style={{background:buscando||!car.trim()?C.border:`linear-gradient(135deg,${C.red},#dc2626)`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:13,padding:"0 20px",cursor:buscando||!car.trim()?"default":"pointer",height:42}}>{buscando?"Buscando...":"Consultar"}</button></div>{erro&&<div style={{marginTop:12,padding:"10px 14px",background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:8,fontSize:13,color:C.red}}>{erro}</div>}</div>{resultado&&(<div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:15,fontWeight:700}}>Resultado</div><span style={S.chip(resultado.embargos.length>0?C.red:C.accent)}>{resultado.embargos.length>0?`${resultado.embargos.length} embargo(s)`:"Sem embargos"}</span></div>{resultado.embargos.length===0?(<div style={{textAlign:"center",padding:"24px 0"}}><div style={{fontSize:48,marginBottom:12}}>✅</div><div style={{fontSize:16,fontWeight:700,color:C.accent}}>Nenhum embargo ativo</div></div>):(resultado.embargos.map((e,i)=>(<div key={i} style={{padding:"14px",marginBottom:12,border:`1px solid ${C.red}40`,borderRadius:12,background:`${C.red}08`}}><div style={{fontSize:14,fontWeight:800,color:C.red}}>Auto {e.num_auto_infracao||"—"}</div><div style={{fontSize:12,color:C.textMuted}}>Data: {e.dat_embargo||"—"} · {e.nom_municipio||"—"}/{e.sig_uf||"—"}</div></div>)))}</div>)}</div>);}

function ProdesPage(){const[coords,setCoords]=useState("");const[buscando,setBuscando]=useState(false);const[resultado,setResultado]=useState(null);const[erro,setErro]=useState(null);const buscar=async()=>{if(!coords.trim()||buscando)return;const gps=coords.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);if(!gps){setErro("Use: -11.8456, -55.1987");return;}const lat=parseFloat(gps[1]);const lng=parseFloat(gps[2]);setBuscando(true);setErro(null);setResultado(null);try{const buffer=0.05;const bbox=`${lng-buffer},${lat-buffer},${lng+buffer},${lat+buffer}`;const resp=await fetch(`https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=deter-amz:deter_public&CQL_FILTER=BBOX(geom,${bbox})&outputFormat=application/json&maxFeatures=20`,{signal:AbortSignal.timeout(12000)});if(!resp.ok)throw new Error();const data=await resp.json();const alertas=data.features||[];setResultado({alertas,lat,lng});}catch{setErro("Não foi possível consultar o PRODES/INPE.");}setBuscando(false);};return(<div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}><div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.orange}15)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}><div style={{fontSize:"clamp(17px,4vw,22px)",fontWeight:800,marginBottom:4}}>PRODES/INPE Desmatamento</div><div style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Alertas via satélite DETER</div><div style={{display:"flex",gap:8}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",color:C.text,fontSize:13,outline:"none",height:42}} placeholder="GPS: -11.8456, -55.1987" value={coords} onChange={e=>setCoords(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()}/><button onClick={buscar} disabled={buscando||!coords.trim()} style={{background:buscando||!coords.trim()?C.border:`linear-gradient(135deg,${C.orange},#ea580c)`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:13,padding:"0 20px",cursor:buscando||!coords.trim()?"default":"pointer",height:42}}>{buscando?"Buscando...":"Consultar"}</button></div>{erro&&<div style={{marginTop:12,padding:"10px 14px",background:`${C.orange}15`,border:`1px solid ${C.orange}40`,borderRadius:8,fontSize:13,color:C.orange}}>{erro}</div>}</div>{resultado&&(<div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:15,fontWeight:700}}>Resultado</div><span style={S.chip(resultado.alertas.length>0?C.orange:C.accent)}>{resultado.alertas.length>0?`${resultado.alertas.length} alerta(s)`:"Sem alertas"}</span></div>{resultado.alertas.length===0?(<div style={{textAlign:"center",padding:"24px 0"}}><div style={{fontSize:48,marginBottom:12}}>🌳</div><div style={{fontSize:16,fontWeight:700,color:C.accent}}>Nenhum alerta detectado</div></div>):(resultado.alertas.map((f,i)=>(<div key={i} style={{padding:"12px",marginBottom:10,border:`1px solid ${C.orange}30`,borderRadius:10,background:`${C.orange}06`}}><div style={{fontSize:13,fontWeight:700,color:C.orange}}>{f.properties?.classname||"Desmatamento"}</div><div style={{fontSize:11,color:C.textMuted}}>{f.properties?.view_date||"—"} · {f.properties?.areakm2||"—"} km²</div></div>)))}</div>)}</div>);}

function PrecipitacaoPage(){const[coords,setCoords]=useState("");const[buscando,setBuscando]=useState(false);const[resultado,setResultado]=useState(null);const[erro,setErro]=useState(null);const buscar=async()=>{if(!coords.trim()||buscando)return;const gps=coords.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);if(!gps){setErro("Use: -11.8456, -55.1987");return;}const lat=parseFloat(gps[1]);const lng=parseFloat(gps[2]);setBuscando(true);setErro(null);setResultado(null);try{const resp=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&daily=precipitation_sum&timezone=America%2FSao_Paulo&forecast_days=14&past_days=30`,{signal:AbortSignal.timeout(10000)});if(!resp.ok)throw new Error();const data=await resp.json();const curr=data.current||{};const precipDiaria=data.daily?.precipitation_sum||[];const precipTotal30d=precipDiaria.slice(0,30).reduce((a,b)=>a+(b||0),0);setResultado({curr,precipDiaria,precipTotal30d:Number(precipTotal30d.toFixed(1)),precipMedia:Number((precipTotal30d/30).toFixed(1)),daily:data.daily,lat,lng});}catch{setErro("Não foi possível buscar dados climáticos.");}setBuscando(false);};return(<div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}><div style={{...S.card,background:`linear-gradient(135deg,${C.card},${C.blue}15)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}><div style={{fontSize:"clamp(17px,4vw,22px)",fontWeight:800,marginBottom:4}}>Precipitação e Clima</div><div style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Histórico 30 dias + previsão 14 dias</div><div style={{display:"flex",gap:8}}><input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",color:C.text,fontSize:13,outline:"none",height:42}} placeholder="GPS: -11.8456, -55.1987" value={coords} onChange={e=>setCoords(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()}/><button onClick={buscar} disabled={buscando||!coords.trim()} style={{background:buscando||!coords.trim()?C.border:`linear-gradient(135deg,${C.blue},#2563eb)`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:13,padding:"0 20px",cursor:buscando||!coords.trim()?"default":"pointer",height:42}}>{buscando?"Buscando...":"Consultar"}</button></div>{erro&&<div style={{marginTop:12,padding:"10px 14px",background:`${C.blue}15`,border:`1px solid ${C.blue}40`,borderRadius:8,fontSize:13,color:C.blue}}>{erro}</div>}</div>{!resultado&&!buscando&&(<div style={{...S.card,textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:56,marginBottom:16}}>💧</div><div style={{fontSize:15,fontWeight:700,color:C.blue}}>Digite as coordenadas GPS acima</div></div>)}{resultado&&(<div style={{display:"flex",flexDirection:"column",gap:14}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>{[["Temperatura",`${resultado.curr.temperature_2m??'--'}°C`,C.red],["Umidade",`${resultado.curr.relative_humidity_2m??'--'}%`,C.blue],["Chuva hoje",`${resultado.curr.precipitation??0} mm`,C.blue],["Total 30d",`${resultado.precipTotal30d} mm`,C.blue],["Média/dia",`${resultado.precipMedia} mm`,C.purple]].map(([l,v,c])=>(<div key={l} style={{...S.card,padding:14,textAlign:"center"}}><div style={{fontSize:10,color:C.textMuted,marginBottom:4}}>{l}</div><div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div></div>))}</div><div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Precipitação — últimos 30 dias</div><div style={{display:"flex",alignItems:"flex-end",gap:2,height:80}}>{(()=>{const dados=resultado.precipDiaria.slice(0,30);const max=Math.max(...dados,1);return dados.map((v,i)=>(<div key={i} style={{flex:1,height:`${Math.max((v/max)*100,4)}%`,background:`linear-gradient(180deg,${C.blue},${C.blue}40)`,borderRadius:"3px 3px 0 0",minHeight:3}}/>));})()}</div></div><div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Previsão 14 dias</div><div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8}}>{(resultado.daily?.time||[]).slice(-14).map((d,i)=>{const idx=(resultado.daily.time.length-14)+i;const chuva=resultado.daily.precipitation_sum?.[idx]||0;const data=new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});return(<div key={i} style={{flex:"0 0 auto",minWidth:58,background:C.bg,border:`1px solid ${chuva>10?C.blue:C.border}`,borderRadius:10,padding:"10px 6px",textAlign:"center"}}><div style={{fontSize:10,color:C.textMuted,marginBottom:4}}>{data}</div><div style={{fontSize:20,marginBottom:4}}>{chuva>20?"🌧️":chuva>5?"🌦️":"☀️"}</div><div style={{fontSize:11,fontWeight:700,color:C.blue}}>{chuva.toFixed(0)}mm</div></div>);})} </div></div></div>)}</div>);}

const FAZENDA_MOCK={nome:"Fazenda Horizonte Verde",car:"MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C",municipio:"Sinop, MT",area:"1.284,7 ha",app:"183,4 ha",rl:"399,8 ha",embargo:false,prodes:false};

function IAPage({usarCredito,creditos,onSemCreditos,onNaoCadastrado,user}){const score=78;const[msgs,setMsgs]=useState([{role:"assistant",content:`Olá! Sou a IA do AgroMind. 🌿\n\nAnalisando: ${FAZENDA_MOCK.nome} (${FAZENDA_MOCK.municipio})\n\nO que você quer saber?`}]);const[input,setInput]=useState("");const[loadingIA,setLoadingIA]=useState(false);const bottomRef=useRef(null);useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);const enviar=async(texto)=>{const pergunta=texto||input.trim();if(!pergunta||loadingIA)return;if(!user){onNaoCadastrado();return;}setInput("");if(creditos<=0){onSemCreditos();return;}const resultado=await usarCredito(`IA: ${pergunta.substring(0,50)}`);if(resultado?.motivo==="sem_creditos"){onSemCreditos();return;}setMsgs(prev=>[...prev,{role:"user",content:pergunta}]);setLoadingIA(true);setMsgs(prev=>[...prev,{role:"assistant",content:"",loading:true}]);try{const resp=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:`Você é a IA do AgroMind. FAZENDA: ${FAZENDA_MOCK.nome}, ${FAZENDA_MOCK.municipio}, ${FAZENDA_MOCK.area}, Score ${score}/100. Responda em português, use emojis, máximo 200 palavras, sem markdown.`,messages:[...msgs.filter(m=>!m.loading).map(m=>({role:m.role,content:m.content})),{role:"user",content:pergunta}]})});const data=await resp.json();const txt=limparMarkdown(data.content?.[0]?.text||"Erro.");setMsgs(prev=>[...prev.filter(m=>!m.loading),{role:"assistant",content:txt}]);}catch{setMsgs(prev=>[...prev.filter(m=>!m.loading),{role:"assistant",content:"Erro de conexão."}]);}setLoadingIA(false);};return(<div style={{display:"flex",height:"calc(100vh - 64px)",overflow:"hidden"}}><style>{`@keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style><div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",alignItems:"center",gap:10,flexShrink:0}}><div style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},#6366f1)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🤖</div><div><div style={{fontSize:13,fontWeight:700}}>IA AgroMind</div><div style={{fontSize:10,color:C.accent}}>Online — {FAZENDA_MOCK.nome}</div></div></div><div style={{flex:1,overflowY:"auto",padding:"16px"}}>{msgs.map((m,i)=>(<div key={i} style={{display:"flex",gap:8,marginBottom:14,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}><div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:m.role==="user"?`linear-gradient(135deg,${C.green2},${C.accent})`:`linear-gradient(135deg,${C.blue},#6366f1)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{m.role==="user"?"👤":"🤖"}</div><div style={{maxWidth:"78%",padding:"10px 14px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?`linear-gradient(135deg,${C.green2},${C.green3})`:C.card,border:m.role==="user"?"none":`1px solid ${C.border}`,color:C.text,fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.content}{m.loading&&<span style={{display:"inline-flex",gap:3,marginLeft:6}}>{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:C.accent,animation:`pulse 1s ease-in-out ${i*0.2}s infinite`,display:"inline-block"}}/>)}</span>}</div></div>))}<div ref={bottomRef}/></div><div style={{padding:"6px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:6,overflowX:"auto",flexShrink:0}}>{PERGUNTAS_RAPIDAS.map((p,i)=>(<button key={i} onClick={()=>enviar(p)} style={{flexShrink:0,padding:"4px 10px",borderRadius:20,border:`1px solid ${C.borderLight}`,background:`${C.green1}40`,color:C.textMuted,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>{p}</button>))}</div><div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,background:C.surface,display:"flex",gap:8,alignItems:"flex-end",flexShrink:0}}><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar();}}} placeholder={user?"Pergunte sobre a fazenda...":"Faça login para usar a IA"} rows={1} style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",color:C.text,fontSize:13,outline:"none",resize:"none",fontFamily:"inherit",lineHeight:1.5,maxHeight:80,overflowY:"auto"}}/><button onClick={()=>enviar()} disabled={loadingIA||!input.trim()} style={{width:40,height:40,borderRadius:10,border:"none",background:loadingIA||!input.trim()?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,cursor:loadingIA||!input.trim()?"default":"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{loadingIA?"⏳":"→"}</button></div></div></div>);}

const precipData=[45,70,30,90,55,20,80,65,40,75,50,35,60,88,42,30,55,70,45,60,30,85,65,50,40,75,60,50,45,70];

function Dashboard({user,setPage,onNaoCadastrado}){
  const[historico,setHistorico]=useState([]);const[loadingHist,setLoadingHist]=useState(true);
  useEffect(()=>{if(!user?.uid){setLoadingHist(false);return;}buscarHistoricoFS(user.uid,5).then(h=>{setHistorico(h);setLoadingHist(false);});},[user]);
  const formatarData=(ts)=>{if(!ts)return"—";try{const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});}catch{return"—";}};
  return(<div>
    <div style={{...S.card,background:`linear-gradient(135deg,${C.card} 0%,${C.green1}40 50%,${C.card} 100%)`,borderRadius:20,padding:"24px 20px",marginBottom:20}}>
      <div style={{fontSize:"clamp(17px,4vw,24px)",fontWeight:800,marginBottom:4}}>{user?`Bem-vindo, ${user.displayName?.split(" ")[0]||"Usuário"}! 👋`:"Bem-vindo ao AgroMind! 🌿"}</div>
      <div style={{color:C.textMuted,fontSize:13,marginBottom:14}}>CAR · ITR · CCIR · GPS · IBAMA · PRODES · Clima · NASA · Cotações</div>
      {!user&&<div style={{background:`linear-gradient(135deg,${C.green1}60,${C.green2}20)`,border:`1px solid ${C.borderLight}`,borderRadius:12,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}><div><div style={{fontSize:13,fontWeight:700,color:C.accentBright}}>🎁 Cadastre-se e ganhe 3 créditos grátis!</div><div style={{fontSize:11,color:C.textMuted}}>Consulte fazendas, embargos, PRODES e muito mais.</div></div><button onClick={onNaoCadastrado} style={{padding:"8px 18px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>Cadastrar grátis →</button></div>}
      <BuscaBox onConsultar={()=>setPage("consulta")} buscando={false} user={user} onNaoCadastrado={onNaoCadastrado}/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>{[{icon:"🔍",val:"1.847",label:"Consultas Hoje",color:C.accent},{icon:"🌾",val:"34.291",label:"Imóveis",color:C.yellow},{icon:"🚨",val:"128",label:"Alertas",color:C.red},{icon:"✅",val:"98,4%",label:"Disponibilidade",color:C.blue}].map((s,i)=>(<div key={i} style={{...S.card,display:"flex",alignItems:"center",gap:10,padding:"14px"}}><div style={{width:38,height:38,borderRadius:10,background:`${s.color}20`,border:`1px solid ${s.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{s.icon}</div><div><div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.val}</div><div style={{fontSize:10,color:C.textMuted,marginTop:1}}>{s.label}</div></div></div>))}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,marginBottom:14}}>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><span style={{fontSize:14,fontWeight:700}}>Consultas Recentes</span></div>
        {!user?(<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:36,marginBottom:8}}>🔍</div><div style={{fontSize:13,color:C.textMuted,marginBottom:12}}>Faça login para ver seu histórico</div><button onClick={onNaoCadastrado} style={{padding:"8px 20px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:12,cursor:"pointer"}}>Entrar / Cadastrar</button></div>):loadingHist?(<div style={{textAlign:"center",padding:"16px 0",color:C.textMuted,fontSize:12}}>Carregando...</div>):historico.length===0?(<div style={{textAlign:"center",padding:"16px 0"}}><div style={{fontSize:32,marginBottom:8}}>🔍</div><div style={{fontSize:13,color:C.textMuted}}>Nenhuma consulta ainda.</div></div>):(<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Fazenda","Data","Status"].map(h=><th key={h} style={S.tableTh}>{h}</th>)}</tr></thead><tbody>{historico.map((r,i)=>(<tr key={i}><td style={S.tableTd}><div style={{fontWeight:600}}>{r.nome?.substring(0,18)}</div></td><td style={{...S.tableTd,color:C.textMuted,whiteSpace:"nowrap"}}>{formatarData(r.criadoEm)}</td><td style={S.tableTd}><span style={S.chip(r.status==="ok"?C.accent:r.status==="alerta"?C.yellow:C.red)}>{r.status==="ok"?"OK":r.status==="alerta"?"Alerta":"Embargo"}</span></td></tr>))}</tbody></table>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:12,textAlign:"center"}}>Score IA Médio</div><div style={S.scoreRing}><div style={S.scoreInner}><div style={{fontSize:24,fontWeight:900,color:C.accentBright,lineHeight:1}}>78</div><div style={{fontSize:11,color:C.textMuted}}>/ 100</div></div></div></div>
        <div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Alertas Recentes</div>{[{msg:"Embargo IBAMA ativo",sub:"Faz. Santa Rosa MS",color:C.red,icon:"⛔"},{msg:"Desmatamento detectado",sub:"Sítio Bela Vista PA",color:C.orange,icon:"🛸"},{msg:"Moratória do Cerrado",sub:"Faz. Chapada BA",color:C.yellow,icon:"🌱"}].map((a,i)=>(<div key={i} style={{display:"flex",gap:8,padding:"8px 10px",borderRadius:8,marginBottom:6,border:`1px solid ${a.color}40`,background:`${a.color}08`}}><span>{a.icon}</span><div><div style={{fontSize:12,fontWeight:600,color:a.color}}>{a.msg}</div><div style={{fontSize:11,opacity:0.7}}>{a.sub}</div></div></div>))}</div>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
      <div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:13,fontWeight:700}}>Precipitação 30 dias</span><span style={S.chip(C.blue)}>Sinop/MT</span></div><div style={S.precipBar}>{precipData.map((v,i)=><div key={i} style={S.precipCol(v)}/>)}</div></div>
      <div style={S.card}><div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Composição do Solo</div>{[["Argila",52,C.orange],["Areia",30,C.yellow],["Silte",18,C.accent]].map(([l,p,c])=>(<div key={l} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:700,color:c}}>{p}%</span></div><div style={{height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}><div style={S.chartBar(p,c)}/></div></div>))}</div>
    </div>
  </div>);}

function PlanosPage({user}){const[loadingPlano,setLoadingPlano]=useState(null);useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get("pagamento")==="sucesso")alert("Pagamento aprovado! Seus créditos foram liberados.");},[]);const assinar=async(planoId)=>{if(!user){alert("Faça login primeiro.");return;}setLoadingPlano(planoId);try{const res=await fetch("/api/pagamento",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plano:planoId,userId:user?.uid,userEmail:user?.email})});const data=await res.json();if(data.sandboxInitPoint){window.location.href=data.sandboxInitPoint;}else{alert("Erro ao gerar pagamento.");}}catch{alert("Erro de conexão.");}setLoadingPlano(null);};const planos=[{id:"starter_mensal",title:"Starter",price:"49",per:"/mês",sub:"20 consultas inclusas",featured:false,features:["20 consultas/mês","CAR completo","Score IA básico","Mapa interativo","Suporte por e-mail"]},{id:"pro_mensal",title:"Pro Mensal",price:"99",per:"/mês",sub:"100 consultas inclusas",featured:true,badge:"MAIS VENDIDO",features:["100 consultas/mês","INCRA, IBAMA, PRODES","Score IA avançado","Laudo PDF automático","Chat IA com a fazenda","WhatsApp Bot","Exportar KML"]},{id:"pro_anual",title:"Pro Anual",price:"79",per:"/mês cobrado anualmente",sub:"100 consultas inclusas",featured:false,badge:"ECONOMIA 20%",features:["100 consultas/mês","Tudo do Pro Mensal","Relatórios avançados","Alertas automáticos","Suporte prioritário"]}];return(<div style={{padding:"20px 16px"}}><div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:"clamp(20px,5vw,30px)",fontWeight:900,marginBottom:8}}>Planos AGROMIND</div><div style={{color:C.textMuted,fontSize:13}}>Mais completo que o Dados Fazenda — Cancele quando quiser</div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,maxWidth:880,margin:"0 auto"}}>{planos.map((p)=>(<div key={p.id} style={{background:p.featured?`linear-gradient(160deg,${C.green1},${C.card})`:C.card,border:`1px solid ${p.featured?C.borderLight:C.border}`,borderRadius:18,padding:"24px 18px",position:"relative",boxShadow:p.featured?`0 0 40px ${C.green2}30`:"none"}}>{p.badge&&<div style={{position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",background:`linear-gradient(135deg,${C.accent},${C.green2})`,color:C.bg,fontSize:10,fontWeight:800,padding:"3px 12px",borderRadius:20,whiteSpace:"nowrap"}}>{p.badge}</div>}<div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{p.title}</div><div style={{fontSize:34,fontWeight:900,color:C.accentBright,lineHeight:1.1}}>R${p.price}</div><div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>{p.per}</div><div style={{fontSize:11,color:C.accent,fontWeight:600,marginBottom:16}}>{p.sub} — Extras R$2,00</div>{p.features.map(f=><div key={f} style={{display:"flex",gap:8,fontSize:12,marginBottom:7,color:C.textMuted}}><span style={{color:C.accent}}>✓</span>{f}</div>)}<button onClick={()=>assinar(p.id)} disabled={loadingPlano===p.id} style={{width:"100%",padding:"11px 0",borderRadius:10,border:p.featured?"none":`1px solid ${C.borderLight}`,background:p.featured?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent",color:p.featured?C.text:C.accentBright,fontWeight:700,fontSize:13,cursor:loadingPlano===p.id?"default":"pointer",marginTop:18,opacity:loadingPlano===p.id?0.7:1}}>{loadingPlano===p.id?"Aguarde...":p.featured?"Assinar Agora":"Começar"}</button></div>))}</div><div style={{textAlign:"center",marginTop:24,fontSize:12,color:C.textMuted}}>PIX · Cartão · Boleto — Pagamento 100% seguro via Mercado Pago</div></div>);}

function AdminPage(){const users=[{nome:"Carlos Mendes",email:"carlos@email.com",plano:"Anual Pro",consultas:87,status:"ativo"},{nome:"Ana Rodrigues",email:"ana@email.com",plano:"Mensal",consultas:23,status:"ativo"},{nome:"Faz. Pioneira",email:"contato@fazpioneira.com.br",plano:"Anual Pro",consultas:145,status:"ativo"},{nome:"João Pereira",email:"joao@email.com",plano:"Mensal",consultas:8,status:"inativo"}];return(<div style={{padding:"20px 14px"}}><div style={{marginBottom:18}}><div style={{fontSize:20,fontWeight:800,marginBottom:4}}>Painel Administrativo</div><div style={{fontSize:12,color:C.textMuted}}>Visão exclusiva do dono</div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:18}}>{[{label:"Usuários Ativos",val:"1.247",icon:"👥",color:C.accent},{label:"Receita Mensal",val:"R$ 87.430",icon:"💰",color:C.yellow},{label:"Consultas Hoje",val:"4.821",icon:"🔍",color:C.blue},{label:"Churn Mensal",val:"2,1%",icon:"📉",color:C.orange},{label:"Ticket Médio",val:"R$ 94,60",icon:"💳",color:C.accentBright},{label:"NPS",val:"72",icon:"⭐",color:C.yellow}].map((a,i)=>(<div key={i} style={{...S.card,borderLeft:`3px solid ${a.color}`,padding:"14px"}}><div style={{fontSize:18,marginBottom:4}}>{a.icon}</div><div style={{fontSize:18,fontWeight:900,color:a.color}}>{a.val}</div><div style={{fontSize:10,color:C.textMuted,marginTop:2}}>{a.label}</div></div>))}</div><div style={{...S.card,padding:0,overflow:"hidden"}}><div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,fontSize:14,fontWeight:700}}>Usuários Recentes</div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:360}}><thead><tr style={{background:`${C.green1}50`}}>{["Nome","Plano","Consultas","Status"].map(h=><th key={h} style={S.tableTh}>{h}</th>)}</tr></thead><tbody>{users.map((u,i)=><tr key={i}><td style={S.tableTd}><div style={{fontWeight:600}}>{u.nome}</div><div style={{fontSize:10,color:C.textMuted}}>{u.email}</div></td><td style={S.tableTd}><span style={S.chip(C.blue)}>{u.plano}</span></td><td style={S.tableTd}>{u.consultas}</td><td style={S.tableTd}><span style={S.chip(u.status==="ativo"?C.accent:C.textDim)}>{u.status}</span></td></tr>)}</tbody></table></div></div></div>);}

function PlaceholderPage({title,icon,desc}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:300,gap:16,padding:24,textAlign:"center"}}><div style={{fontSize:56}}>{icon}</div><div style={{fontSize:20,fontWeight:800}}>{title}</div><div style={{fontSize:13,color:C.textMuted,maxWidth:380}}>{desc}</div><div style={{...S.chip(C.accent),fontSize:13,padding:"6px 16px"}}>Em desenvolvimento</div></div>);}

function SidebarContent({user,page,setPage,onClose,handleLogout,onCadastrar,creditos,cor}){
  return(<>
    <div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🌿</div>
        <div><div style={{fontSize:19,fontWeight:800,background:`linear-gradient(135deg,${C.accentBright},${C.accent})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}} translate="no">AGROMIND</div><div style={{fontSize:9,color:C.textMuted,letterSpacing:"2px",textTransform:"uppercase"}}>Inteligência Rural</div></div>
      </div>
    </div>
    <nav style={{flex:1,padding:"14px 10px",overflowY:"auto"}}>{NAV.map(sec=>(<div key={sec.section} style={{marginBottom:20}}><div style={{fontSize:10,color:C.textDim,letterSpacing:"1.5px",textTransform:"uppercase",padding:"0 8px",marginBottom:6}}>{sec.section}</div>{sec.items.map(item=>(<div key={item.id} translate="no" style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,cursor:"pointer",marginBottom:2,background:page===item.id?`${C.green1}80`:"transparent",border:page===item.id?`1px solid ${C.border}`:"1px solid transparent",color:page===item.id?C.accentBright:C.textMuted,fontSize:13.5,fontWeight:page===item.id?600:400,WebkitTapHighlightColor:"transparent"}} onClick={()=>{setPage(item.id);onClose&&onClose();}}><span style={{fontSize:16,width:20,textAlign:"center"}}>{item.icon}</span>{item.label}</div>))}</div>))}</nav>
    <div style={{padding:"14px 10px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
      {user?(
        <><div style={{background:`linear-gradient(135deg,${C.green1},${C.card})`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2}}>👤 {user.displayName||"Usuário"}</div><div style={{fontSize:11,color:C.textMuted,marginBottom:8}}>{user.email}</div><button style={{width:"100%",padding:"7px 0",borderRadius:8,background:`${C.red}15`,border:`1px solid ${C.red}30`,color:C.red,fontSize:12,fontWeight:600,cursor:"pointer"}} onClick={handleLogout}>Sair da conta</button></div><div style={{background:`${C.green1}30`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.textMuted}}>Créditos</span><span style={{fontSize:16,fontWeight:900,color:cor||C.accent}}>{creditos||0}</span></div></>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={onCadastrar} style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:800,fontSize:13,cursor:"pointer"}}>🚀 Criar conta grátis</button>
          <button onClick={onCadastrar} style={{width:"100%",padding:"9px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontWeight:600,fontSize:12,cursor:"pointer"}}>Já tenho conta</button>
        </div>
      )}
    </div>
  </>);
}

export default function App(){
  const[user,setUser]=useState(null);
  const[authChecked,setAuthChecked]=useState(false);
  const[page,setPage]=useState("dashboard");
  const[drawerOpen,setDrawerOpen]=useState(false);
  const[showCadastro,setShowCadastro]=useState(false);  // Popup 1: cadastro
  const[showPlanos,setShowPlanos]=useState(false);       // Popup 2: planos

  useEffect(()=>{const unsub=onAuthStateChanged(auth,(u)=>{setUser(u);setAuthChecked(true);});return unsub;},[]);
  const{creditos,plano,cor,usarCredito}=useCredits(user);

  if(!authChecked)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,background:C.bg}}><div style={{fontSize:48}}>🌿</div><div style={{fontSize:18,fontWeight:700,color:C.accentBright}}>Carregando AGROMIND...</div></div>);

  const handleLogout=async()=>{await signOut(auth);setUser(null);};
  const allItems=NAV.flatMap(s=>s.items);
  const isFullPage=["mapa","planos","admin","ia","consulta","embargos","prodes","precipitacao"].includes(page);

  // Visitante clicou em qualquer ferramenta
  const handleNaoCadastrado=()=>setShowCadastro(true);
  // Créditos acabaram
  const handleSemCreditos=()=>setShowPlanos(true);

  const initials=user?.displayName?user.displayName.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase():null;

  const pageMap={
    dashboard:<Dashboard user={user} setPage={setPage} onNaoCadastrado={handleNaoCadastrado}/>,
    consulta:<ConsultaPage user={user} usarCredito={usarCredito} creditos={creditos} onSemCreditos={handleSemCreditos} setPage={setPage} onNaoCadastrado={handleNaoCadastrado}/>,
    mapa:<MapaPage/>,
    ia:<IAPage user={user} usarCredito={usarCredito} creditos={creditos} onSemCreditos={handleSemCreditos} onNaoCadastrado={handleNaoCadastrado}/>,
    embargos:<EmbargoPage/>,
    prodes:<ProdesPage/>,
    precipitacao:<PrecipitacaoPage/>,
    whatsapp:<PlaceholderPage icon="💬" title="WhatsApp Bot" desc="Consulte fazendas direto pelo WhatsApp. Em breve!"/>,
    planos:<PlanosPage user={user}/>,
    admin:<AdminPage/>,
  };

  return(
    <div style={S.app} translate="no">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0f0a;overflow-x:hidden;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:#0a0f0a;}::-webkit-scrollbar-thumb{background:#1e3a1e;border-radius:3px;}input::placeholder{color:#3d6b3d;}textarea::placeholder{color:#3d6b3d;}.agro-sidebar{position:fixed;top:0;left:0;width:240px;height:100vh;background:${C.surface};border-right:1px solid ${C.border};display:flex;flex-direction:column;z-index:100;}.agro-main{margin-left:240px;min-height:100vh;display:flex;flex-direction:column;}.agro-topbar{background:${C.surface}ee;backdrop-filter:blur(12px);border-bottom:1px solid ${C.border};padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50;}.agro-content{padding:24px;flex:1;}.agro-content-full{flex:1;}.agro-hamburger{display:none;}.agro-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:200;}.agro-overlay.open{display:block;}.agro-drawer{display:none;position:fixed;top:0;left:0;bottom:0;width:280px;background:${C.surface};z-index:300;flex-direction:column;transform:translateX(-100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);overflow:hidden;}.agro-drawer.open{transform:translateX(0);}.agro-bottom-nav{display:none;}@media(max-width:768px){.agro-sidebar{display:none!important;}.agro-hamburger{display:flex!important;}.agro-drawer{display:flex!important;}.agro-main{margin-left:0!important;width:100%!important;}.agro-content{padding:14px 12px 80px!important;}.agro-content-full{padding-bottom:64px;}.agro-bottom-nav{display:flex!important;position:fixed;bottom:0;left:0;right:0;background:${C.surface};border-top:1px solid ${C.border};z-index:100;height:64px;}}@supports(padding-bottom:env(safe-area-inset-bottom)){@media(max-width:768px){.agro-bottom-nav{height:calc(64px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);}}}`}</style>

      {/* POPUP 1: Cadastro — aparece quando visitante clica em pesquisar */}
      {showCadastro&&<PopupCadastro onFechar={()=>setShowCadastro(false)}/>}

      {/* POPUP 2: Planos — aparece quando créditos acabam */}
      {showPlanos&&<PopupPlanos onFechar={()=>setShowPlanos(false)} onVerPlanos={()=>setPage("planos")}/>}

      <div className={`agro-overlay ${drawerOpen?"open":""}`} onClick={()=>setDrawerOpen(false)}/>
      <div className={`agro-drawer ${drawerOpen?"open":""}`}>
        <SidebarContent user={user} page={page} setPage={setPage} onClose={()=>setDrawerOpen(false)} handleLogout={handleLogout} onCadastrar={()=>{setDrawerOpen(false);setShowCadastro(true);}} creditos={creditos} cor={cor}/>
      </div>
      <aside className="agro-sidebar">
        <SidebarContent user={user} page={page} setPage={setPage} handleLogout={handleLogout} onCadastrar={()=>setShowCadastro(true)} creditos={creditos} cor={cor}/>
      </aside>

      <div className="agro-main">
        <div className="agro-topbar">
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button className="agro-hamburger" onClick={()=>setDrawerOpen(true)} style={{width:40,height:40,borderRadius:10,background:C.card,border:`1px solid ${C.border}`,color:C.text,cursor:"pointer",fontSize:20,alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>☰</button>
            <div style={{fontSize:"clamp(14px,3vw,17px)",fontWeight:700}} translate="no">{allItems.find(i=>i.id===page)?.label||"Dashboard"}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {user?(
              <>
                <div style={{display:"flex",alignItems:"center",gap:4,background:`${cor||C.accent}15`,border:`1px solid ${cor||C.accent}40`,borderRadius:20,padding:"4px 10px"}}><span style={{fontSize:11}}>⚡</span><span style={{fontSize:12,fontWeight:700,color:cor||C.accent}}>{creditos}</span></div>
                <div style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px 5px 5px"}}><div style={{width:26,height:26,borderRadius:6,background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{initials}</div><span style={{fontSize:13,fontWeight:600}}>{user.displayName?.split(" ")[0]||"Usuário"}</span></div>
              </>
            ):(
              <>
                <button onClick={()=>setShowCadastro(true)} style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontWeight:600,fontSize:12,cursor:"pointer"}}>Entrar</button>
                <button onClick={()=>setShowCadastro(true)} style={{padding:"7px 14px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:12,cursor:"pointer"}}>Cadastrar grátis</button>
              </>
            )}
          </div>
        </div>
        <div className={isFullPage?"agro-content-full":"agro-content"}>{pageMap[page]||pageMap.dashboard}</div>
      </div>

      <nav className="agro-bottom-nav">{BOTTOM_NAV.map(item=>(<div key={item.id} onClick={()=>setPage(item.id)} translate="no" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",color:page===item.id?C.accent:C.textMuted,borderTop:page===item.id?`2px solid ${C.accent}`:"2px solid transparent",paddingTop:4,WebkitTapHighlightColor:"transparent",userSelect:"none"}}><span style={{fontSize:20}}>{item.icon}</span><span style={{fontSize:9,fontWeight:page===item.id?700:400}}>{item.label}</span></div>))}</nav>
    </div>
  );
}