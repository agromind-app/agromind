import { useState, useEffect } from "react";
import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import MapaPage from "./mapapage";

const C = {
  bg:"#0a0f0a",surface:"#0f1a0f",card:"#111d11",
  border:"#1e3a1e",borderLight:"#2a4f2a",
  green1:"#0d5c2e",green2:"#12803f",green3:"#16a34a",
  accent:"#22c55e",accentBright:"#4ade80",
  text:"#e8f5e9",textMuted:"#6b9e6b",textDim:"#3d6b3d",
  yellow:"#fbbf24",red:"#ef4444",orange:"#f97316",blue:"#3b82f6",
};

const S = {
  app:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"},
  authPage:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`radial-gradient(ellipse at 30% 20%, ${C.green1}40, transparent 60%), radial-gradient(ellipse at 80% 80%, ${C.green2}20, transparent 50%), ${C.bg}`,padding:20},
  authBox:{background:C.card,border:`1px solid ${C.border}`,borderRadius:24,padding:"40px 36px",width:"100%",maxWidth:420,boxShadow:`0 0 60px ${C.green1}40`},
  authLogoIcon:{width:56,height:56,borderRadius:16,margin:"0 auto 12px",background:`linear-gradient(135deg, ${C.green2}, ${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,boxShadow:`0 0 30px ${C.green2}60`},
  authLogoText:{fontSize:26,fontWeight:900,letterSpacing:"-0.5px",background:`linear-gradient(135deg, ${C.accentBright}, ${C.accent})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  label:{fontSize:12,color:C.textMuted,marginBottom:6,display:"block",fontWeight:600},
  input:{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"},
  btn:{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:`linear-gradient(135deg, ${C.green2}, ${C.green3})`,color:C.text,fontWeight:700,fontSize:15,cursor:"pointer",marginTop:8,boxShadow:`0 4px 20px ${C.green2}50`},
  errorBox:{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.red,marginBottom:16},
  successBox:{background:`${C.accent}15`,border:`1px solid ${C.accent}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.accentBright,marginBottom:16},
  sidebar:{position:"fixed",top:0,left:0,width:240,height:"100vh",background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",zIndex:100},
  nav:{flex:1,padding:"16px 12px",overflowY:"auto"},
  navSection:{marginBottom:24},
  navSectionTitle:{fontSize:10,color:C.textDim,letterSpacing:"1.5px",textTransform:"uppercase",padding:"0 8px",marginBottom:6},
  navItem:(a)=>({display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,cursor:"pointer",marginBottom:2,background:a?`${C.green1}80`:"transparent",border:a?`1px solid ${C.border}`:"1px solid transparent",color:a?C.accentBright:C.textMuted,fontSize:13.5,fontWeight:a?600:400}),
  main:{marginLeft:240,minHeight:"100vh",display:"flex",flexDirection:"column"},
  topbar:{background:`${C.surface}ee`,backdropFilter:"blur(12px)",borderBottom:`1px solid ${C.border}`,padding:"0 32px",height:64,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50},
  content:{padding:"28px 32px",flex:1},
  statsRow:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24},
  statCard:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"18px 20px",display:"flex",alignItems:"center",gap:14},
  statIcon:(c)=>({width:44,height:44,borderRadius:12,background:`${c}20`,border:`1px solid ${c}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}),
  card:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"22px 24px"},
  grid2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18},
  grid3:{display:"grid",gridTemplateColumns:"2fr 1fr",gap:18,marginBottom:18},
  chip:(c)=>({display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:`${c}20`,color:c,border:`1px solid ${c}30`}),
  searchHero:{background:`linear-gradient(135deg, ${C.card} 0%, ${C.green1}40 50%, ${C.card} 100%)`,border:`1px solid ${C.border}`,borderRadius:20,padding:"32px 36px",marginBottom:28,position:"relative",overflow:"hidden"},
  searchBar:{display:"flex",gap:10},
  toggleBtn:(a)=>({padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:a?600:400,background:a?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent",color:a?C.text:C.textMuted,border:"none"}),
  searchInput:{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 18px",color:C.text,fontSize:14,outline:"none",height:44},
  searchBtn:{background:`linear-gradient(135deg,${C.green2},${C.green3})`,border:"none",borderRadius:10,color:C.text,fontWeight:700,fontSize:14,padding:"0 24px",cursor:"pointer",height:44,display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap",boxShadow:`0 4px 14px ${C.green2}50`,flexShrink:0},
  chartBar:(p,c)=>({height:"100%",width:`${p}%`,background:`linear-gradient(90deg,${c}80,${c})`,borderRadius:3}),
  scoreRing:{width:110,height:110,borderRadius:"50%",background:`conic-gradient(${C.accent} 0deg, ${C.accent} ${0.78*360}deg, ${C.border} ${0.78*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"},
  scoreInner:{width:82,height:82,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"},
  precipBar:{display:"flex",alignItems:"flex-end",gap:3,height:70,marginBottom:6},
  precipCol:(h)=>({flex:1,height:`${h}%`,background:`linear-gradient(180deg,${C.blue}90,${C.blue}40)`,borderRadius:"3px 3px 0 0",minHeight:3}),
  tableTh:{padding:"12px 18px",fontSize:11,fontWeight:700,color:C.textMuted,letterSpacing:"0.5px",textTransform:"uppercase",textAlign:"left"},
  tableTd:{padding:"13px 18px",fontSize:13,borderBottom:`1px solid ${C.border}`,color:C.text},
};

const NAV=[
  {section:"Principal",items:[{icon:"⊞",label:"Dashboard",id:"dashboard"},{icon:"🔍",label:"Consultar Imóvel",id:"consulta"},{icon:"🗺️",label:"Mapa Interativo",id:"mapa"},{icon:"🤖",label:"IA & Score",id:"ia"}]},
  {section:"Ambiental",items:[{icon:"🌿",label:"Embargos IBAMA",id:"embargos"},{icon:"📡",label:"PRODES/INPE",id:"prodes"},{icon:"💧",label:"Precipitação",id:"precipitacao"}]},
  {section:"Sistema",items:[{icon:"💬",label:"WhatsApp Bot",id:"whatsapp"},{icon:"💳",label:"Planos & Preços",id:"planos"},{icon:"🛡️",label:"Painel Admin",id:"admin"}]},
];

const precipData=[45,70,30,90,55,20,80,65,40,75,50,35,60,88,42,30,55,70,45,60,30,85,65,50,40,75,60,50,45,70];
const recentConsultas=[
  {fazenda:"Faz. Horizonte Verde",car:"MT-5107040-9B4D7A...",data:"20/04/2026",status:"ok"},
  {fazenda:"Sítio Bela Vista",car:"PA-1502301-AB3D9F...",data:"19/04/2026",status:"alerta"},
  {fazenda:"Fazenda São João",car:"GO-5208004-C4E2A1...",data:"18/04/2026",status:"ok"},
  {fazenda:"Agropec. Santa Rosa",car:"MS-5003108-D7F3B2...",data:"17/04/2026",status:"embargo"},
];

function SearchBar(){
  const[type,setType]=useState("car");
  const[val,setVal]=useState("");
  return(
    <div style={S.searchBar}>
      <div style={{display:"flex",background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:3,gap:2,flexShrink:0}}>
        {[["car","CAR"],["gps","GPS"],["end","Endereço"]].map(([k,l])=>(
          <button key={k} style={S.toggleBtn(type===k)} onClick={()=>setType(k)}>{l}</button>
        ))}
      </div>
      <input style={S.searchInput} placeholder={type==="car"?"Ex: MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C":type==="gps"?"Ex: -11.8456, -55.1987":"Ex: Fazenda Horizonte Verde, Sinop, MT"} value={val} onChange={e=>setVal(e.target.value)}/>
      <button style={S.searchBtn}>🔍 Consultar</button>
    </div>
  );
}

function Dashboard({user}){
  return(
    <div>
      <div style={S.searchHero}>
        <div style={{position:"absolute",top:0,right:0,width:300,height:"100%",background:`radial-gradient(ellipse at top right,${C.green2}20,transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{fontSize:26,fontWeight:800,marginBottom:6,position:"relative"}}>
          🌿 Bem-vindo, {user?.displayName?.split(" ")[0]||"Usuário"}!
        </div>
        <div style={{color:C.textMuted,fontSize:14,marginBottom:24,position:"relative"}}>CAR · INCRA · SIGEF · IBAMA · PRODES · Score IA — tudo em uma plataforma</div>
        <SearchBar/>
      </div>
      <div style={S.statsRow}>
        {[{icon:"🔍",val:"1.847",label:"Consultas Hoje",color:C.accent},{icon:"🌾",val:"34.291",label:"Imóveis Cadastrados",color:C.yellow},{icon:"🚨",val:"128",label:"Alertas Ativos",color:C.red},{icon:"✅",val:"98,4%",label:"Disponibilidade",color:C.blue}].map((s,i)=>(
          <div key={i} style={S.statCard}>
            <div style={S.statIcon(s.color)}>{s.icon}</div>
            <div>
              <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.val}</div>
              <div style={{fontSize:12,color:C.textMuted,marginTop:1}}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={S.grid3}>
        <div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontSize:15,fontWeight:700}}>📋 Consultas Recentes</span>
            <span style={S.chip(C.accent)}>Hoje</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Fazenda","Data","Status"].map(h=><th key={h} style={{...S.tableTh,padding:"6px 0",background:"transparent"}}>{h}</th>)}</tr></thead>
            <tbody>{recentConsultas.map((r,i)=>(
              <tr key={i}>
                <td style={{...S.tableTd,padding:"10px 0"}}>
                  <div style={{fontSize:13,fontWeight:600}}>{r.fazenda}</div>
                  <div style={{fontSize:11,color:C.textMuted}}>{r.car}</div>
                </td>
                <td style={{...S.tableTd,padding:"10px 0",fontSize:12,color:C.textMuted}}>{r.data}</td>
                <td style={{...S.tableTd,padding:"10px 0"}}>
                  <span style={S.chip(r.status==="ok"?C.accent:r.status==="alerta"?C.yellow:C.red)}>{r.status==="ok"?"✓ OK":r.status==="alerta"?"⚠ Alerta":"⛔ Embargo"}</span>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          <div style={S.card}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:14,textAlign:"center"}}>🤖 Score IA Médio</div>
            <div style={S.scoreRing}><div style={S.scoreInner}><div style={{fontSize:24,fontWeight:900,color:C.accentBright,lineHeight:1}}>78</div><div style={{fontSize:11,color:C.textMuted}}>/ 100</div></div></div>
            <div style={{textAlign:"center",fontSize:11,color:C.textMuted}}>Baseado em 1.847 consultas hoje</div>
          </div>
          <div style={S.card}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>📡 Alertas Recentes</div>
            {[{msg:"Embargo IBAMA ativo",sub:"Faz. Santa Rosa · MS",color:C.red,icon:"⛔"},{msg:"Desmatamento detectado",sub:"Sítio Bela Vista · PA",color:C.orange,icon:"🛸"},{msg:"Moratória do Cerrado",sub:"Faz. Chapada · BA",color:C.yellow,icon:"🌱"}].map((a,i)=>(
              <div key={i} style={{display:"flex",gap:10,padding:"10px 12px",borderRadius:8,marginBottom:8,border:`1px solid ${a.color}40`,background:`${a.color}08`}}>
                <span style={{fontSize:16}}>{a.icon}</span>
                <div><div style={{fontSize:13,fontWeight:600,color:a.color}}>{a.msg}</div><div style={{fontSize:11,opacity:0.7}}>{a.sub}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <span style={{fontSize:15,fontWeight:700}}>🌧️ Precipitação — 30 dias</span>
            <span style={S.chip(C.blue)}>Sinop/MT</span>
          </div>
          <div style={S.precipBar}>{precipData.map((v,i)=><div key={i} style={S.precipCol(v)}/>)}</div>
          <div style={{display:"flex",justifyContent:"space-between"}}>{["01","05","10","15","20","25","30"].map(d=><span key={d} style={{fontSize:10,color:C.textDim}}>{d}</span>)}</div>
        </div>
        <div style={S.card}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>🌿 Composição do Solo</div>
          {[["Argila",52,C.orange],["Areia",30,C.yellow],["Silte",18,C.accent]].map(([l,p,c])=>(
            <div key={l} style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}>
                <span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:700,color:c}}>{p}%</span>
              </div>
              <div style={{height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}><div style={S.chartBar(p,c)}/></div>
            </div>
          ))}
          <div style={{marginTop:12,padding:"10px 14px",background:`${C.bg}80`,borderRadius:8,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:12}}>
            <span style={{color:C.textMuted}}>pH do solo</span><span style={{fontWeight:700,color:C.accentBright}}>6.2 — Ideal</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanosPage(){
  return(
    <div style={{padding:"28px 32px"}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:32,fontWeight:900,letterSpacing:"-1px",marginBottom:8}}>Planos AGROMIND</div>
        <div style={{color:C.textMuted,fontSize:15}}>Mais completo que o Dados Fazenda · Cancele quando quiser</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20,maxWidth:900,margin:"0 auto"}}>
        {[
          {title:"Starter",price:"49",per:"/mês",featured:false,features:["50 consultas/mês","Dados CAR completo","Score IA básico","Mapa interativo","Suporte por e-mail"]},
          {title:"Pro Mensal",price:"99",per:"/mês",featured:true,badge:"🔥 MAIS VENDIDO",features:["Consultas ilimitadas","INCRA, IBAMA, PRODES","Score IA avançado","Laudo PDF automático","Chat IA com a fazenda","WhatsApp Bot","Exportar KML","API access"]},
          {title:"Pro Anual",price:"79",per:"/mês · cobrado anualmente",featured:false,badge:"💰 ECONOMIA DE 20%",features:["Tudo do Pro Mensal","Painel multi-usuários","Relatórios avançados","Alertas automáticos","Suporte prioritário","Onboarding personalizado"]},
        ].map((p,i)=>(
          <div key={i} style={{background:p.featured?`linear-gradient(160deg,${C.green1},${C.card})`:C.card,border:`1px solid ${p.featured?C.borderLight:C.border}`,borderRadius:20,padding:"28px 24px",position:"relative",boxShadow:p.featured?`0 0 40px ${C.green2}30`:"none"}}>
            {p.badge&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:`linear-gradient(135deg,${C.accent},${C.green2})`,color:C.bg,fontSize:11,fontWeight:800,padding:"4px 14px",borderRadius:20,whiteSpace:"nowrap"}}>{p.badge}</div>}
            <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>{p.title}</div>
            <div style={{fontSize:38,fontWeight:900,letterSpacing:"-1px",color:C.accentBright,lineHeight:1.1}}>R${p.price}</div>
            <div style={{fontSize:13,color:C.textMuted,marginBottom:20}}>{p.per}</div>
            {p.features.map(f=><div key={f} style={{display:"flex",gap:8,fontSize:13,marginBottom:8,color:C.textMuted}}><span style={{color:C.accent}}>✓</span>{f}</div>)}
            <button style={{width:"100%",padding:"12px 0",borderRadius:10,border:p.featured?"none":`1px solid ${C.borderLight}`,background:p.featured?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent",color:p.featured?C.text:C.accentBright,fontWeight:700,fontSize:14,cursor:"pointer",marginTop:20}}>
              {p.featured?"Assinar Agora":"Começar"}
            </button>
          </div>
        ))}
      </div>
      <div style={{textAlign:"center",marginTop:32,fontSize:13,color:C.textMuted}}>💳 PIX · Cartão de Crédito · Boleto Bancário · 🔒 Pagamento 100% seguro</div>
    </div>
  );
}

function AdminPage(){
  const users=[{nome:"Carlos Mendes",email:"carlos@email.com",plano:"Anual Pro",consultas:87,status:"ativo"},{nome:"Ana Rodrigues",email:"ana@email.com",plano:"Mensal",consultas:23,status:"ativo"},{nome:"Faz. Pioneira",email:"contato@fazpioneira.com.br",plano:"Anual Pro",consultas:145,status:"ativo"},{nome:"João Pereira",email:"joao@email.com",plano:"Mensal",consultas:8,status:"inativo"}];
  return(
    <div style={{padding:"28px 32px"}}>
      <div style={{marginBottom:24}}><div style={{fontSize:22,fontWeight:800,marginBottom:4}}>🛡️ Painel Administrativo</div><div style={{fontSize:13,color:C.textMuted}}>Visão exclusiva do dono</div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
        {[{label:"Usuários Ativos",val:"1.247",icon:"👥",color:C.accent},{label:"Receita Mensal",val:"R$ 87.430",icon:"💰",color:C.yellow},{label:"Consultas Hoje",val:"4.821",icon:"🔍",color:C.blue},{label:"Churn Mensal",val:"2,1%",icon:"📉",color:C.orange},{label:"Ticket Médio",val:"R$ 94,60",icon:"💳",color:C.accentBright},{label:"NPS",val:"72",icon:"⭐",color:C.yellow}].map((a,i)=>(
          <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"20px",borderLeft:`3px solid ${a.color}`}}>
            <div style={{fontSize:22,marginBottom:6}}>{a.icon}</div>
            <div style={{fontSize:24,fontWeight:900,color:a.color}}>{a.val}</div>
            <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>{a.label}</div>
          </div>
        ))}
      </div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,fontSize:15,fontWeight:700}}>👤 Usuários Recentes</div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:`${C.green1}50`}}>{["Nome","Email","Plano","Consultas","Status"].map(h=><th key={h} style={S.tableTh}>{h}</th>)}</tr></thead>
          <tbody>{users.map((u,i)=><tr key={i}><td style={S.tableTd}>{u.nome}</td><td style={{...S.tableTd,color:C.textMuted}}>{u.email}</td><td style={S.tableTd}><span style={S.chip(C.blue)}>{u.plano}</span></td><td style={S.tableTd}>{u.consultas}</td><td style={S.tableTd}><span style={S.chip(u.status==="ativo"?C.accent:C.textDim)}>{u.status}</span></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function PlaceholderPage({title,icon,desc}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:400,gap:16}}>
      <div style={{fontSize:64}}>{icon}</div>
      <div style={{fontSize:22,fontWeight:800}}>{title}</div>
      <div style={{fontSize:14,color:C.textMuted,textAlign:"center",maxWidth:400}}>{desc}</div>
      <div style={{...S.chip(C.accent),fontSize:13,padding:"6px 16px"}}>Em desenvolvimento 🚀</div>
    </div>
  );
}

function AuthScreen(){
  const[mode,setMode]=useState("login");
  const[name,setName]=useState("");
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[confirm,setConfirm]=useState("");
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[success,setSuccess]=useState("");

  const errMsg=(code)=>({
    "auth/user-not-found":"E-mail não encontrado.",
    "auth/wrong-password":"Senha incorreta.",
    "auth/email-already-in-use":"Este e-mail já está cadastrado.",
    "auth/weak-password":"Senha fraca. Use no mínimo 6 caracteres.",
    "auth/invalid-email":"E-mail inválido.",
    "auth/invalid-credential":"E-mail ou senha incorretos.",
    "auth/too-many-requests":"Muitas tentativas. Aguarde.",
  }[code]||"Erro inesperado. Tente novamente.");

  const handleLogin=async()=>{
    setError("");setLoading(true);
    try{await signInWithEmailAndPassword(auth,email,password);}
    catch(e){setError(errMsg(e.code));}
    setLoading(false);
  };

  const handleRegister=async()=>{
    setError("");setSuccess("");
    if(!name.trim())return setError("Digite seu nome.");
    if(password!==confirm)return setError("As senhas não coincidem.");
    if(password.length<6)return setError("Senha precisa ter pelo menos 6 caracteres.");
    setLoading(true);
    try{
      const cred=await createUserWithEmailAndPassword(auth,email,password);
      await updateProfile(cred.user,{displayName:name.trim()});
      setSuccess("Conta criada! Entrando...");
    }catch(e){setError(errMsg(e.code));}
    setLoading(false);
  };

  return(
    <div style={S.authPage}>
      <div style={S.authBox}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={S.authLogoIcon}>🌿</div>
          <div style={S.authLogoText}>AGROMIND</div>
          <div style={{fontSize:13,color:C.textMuted,marginTop:4}}>Inteligência Rural · Plataforma SaaS</div>
        </div>
        <div style={{fontSize:20,fontWeight:800,marginBottom:6,textAlign:"center"}}>{mode==="login"?"Entrar na plataforma":"Criar sua conta"}</div>
        <div style={{fontSize:13,color:C.textMuted,textAlign:"center",marginBottom:28}}>{mode==="login"?"Acesse seu painel de imóveis rurais":"Comece gratuitamente hoje"}</div>
        {error&&<div style={S.errorBox}>⚠️ {error}</div>}
        {success&&<div style={S.successBox}>✅ {success}</div>}
        {mode==="register"&&(
          <div style={{marginBottom:16}}>
            <label style={S.label}>Seu nome completo</label>
            <input style={S.input} placeholder="Ex: João da Silva" value={name} onChange={e=>setName(e.target.value)}/>
          </div>
        )}
        <div style={{marginBottom:16}}>
          <label style={S.label}>E-mail</label>
          <input style={S.input} type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={S.label}>Senha</label>
          <input style={S.input} type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&mode==="login"&&handleLogin()}/>
        </div>
        {mode==="register"&&(
          <div style={{marginBottom:16}}>
            <label style={S.label}>Confirmar senha</label>
            <input style={S.input} type="password" placeholder="••••••••" value={confirm} onChange={e=>setConfirm(e.target.value)}/>
          </div>
        )}
        <button style={{...S.btn,opacity:loading?0.7:1}} onClick={mode==="login"?handleLogin:handleRegister} disabled={loading}>
          {loading?"⏳ Aguarde...":mode==="login"?"🚀 Entrar":"✅ Criar conta"}
        </button>
        <div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0"}}>
          <div style={{flex:1,height:1,background:C.border}}/><span style={{fontSize:12,color:C.textDim}}>ou</span><div style={{flex:1,height:1,background:C.border}}/>
        </div>
        <div style={{textAlign:"center",fontSize:13,color:C.textMuted}}>
          {mode==="login"?<>Não tem conta? <span style={{color:C.accentBright,cursor:"pointer",fontWeight:600}} onClick={()=>{setMode("register");setError("");}}>Cadastre-se grátis</span></>:<>Já tem conta? <span style={{color:C.accentBright,cursor:"pointer",fontWeight:600}} onClick={()=>{setMode("login");setError("");}}>Entrar</span></>}
        </div>
        <div style={{marginTop:20,padding:"12px",background:`${C.green1}30`,borderRadius:8,border:`1px solid ${C.border}`,textAlign:"center"}}>
          <div style={{fontSize:11,color:C.textMuted}}>🔒 Dados protegidos · Firebase Google · SSL</div>
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const[user,setUser]=useState(null);
  const[loading,setLoading]=useState(true);
  const[page,setPage]=useState("dashboard");

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,(u)=>{setUser(u);setLoading(false);});
    return unsub;
  },[]);

  if(loading)return(
    <div style={{...S.authPage,flexDirection:"column",gap:16}}>
      <div style={{fontSize:48}}>🌿</div>
      <div style={{fontSize:18,fontWeight:700,color:C.accentBright}}>Carregando AGROMIND...</div>
    </div>
  );

  if(!user)return <AuthScreen/>;

  const handleLogout=async()=>{await signOut(auth);setUser(null);};
  const initials=user.displayName?user.displayName.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase():user.email.substring(0,2).toUpperCase();
  const allItems=NAV.flatMap(s=>s.items);

  const pageMap={
    dashboard:<Dashboard user={user}/>,
    consulta:<PlaceholderPage icon="🔍" title="Consultar Imóvel" desc="Busca por CAR, GPS ou endereço com dados completos do SICAR, IBAMA e PRODES."/>,
    mapa:<MapaPage/>,
    ia:<PlaceholderPage icon="🤖" title="IA & Score" desc="Score 0-100 da fazenda com análise automática de risco e chat inteligente."/>,
    embargos:<PlaceholderPage icon="⛔" title="Embargos IBAMA" desc="Consulta em tempo real de embargos ambientais ativos no IBAMA."/>,
    prodes:<PlaceholderPage icon="📡" title="PRODES/INPE" desc="Alertas de desmatamento e degradação florestal via PRODES e DETER."/>,
    precipitacao:<PlaceholderPage icon="💧" title="Precipitação" desc="Histórico de chuvas dos últimos 30 dias por região."/>,
    whatsapp:<PlaceholderPage icon="💬" title="WhatsApp Bot" desc="Consulte fazendas direto pelo WhatsApp enviando o código CAR ou sua localização."/>,
    planos:<PlanosPage/>,
    admin:<AdminPage/>,
  };

  return(
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0f0a;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:#0a0f0a;}
        ::-webkit-scrollbar-thumb{background:#1e3a1e;border-radius:3px;}
        input::placeholder{color:#3d6b3d;}
      `}</style>

      <div style={S.sidebar}>
        <div style={{padding:"24px 20px 20px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:`0 0 20px ${C.green2}60`}}>🌿</div>
            <div>
              <div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.5px",background:`linear-gradient(135deg,${C.accentBright},${C.accent})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AGROMIND</div>
              <div style={{fontSize:10,color:C.textMuted,letterSpacing:"2px",textTransform:"uppercase",marginTop:1}}>Inteligência Rural</div>
            </div>
          </div>
        </div>
        <nav style={S.nav}>
          {NAV.map(sec=>(
            <div key={sec.section} style={S.navSection}>
              <div style={S.navSectionTitle}>{sec.section}</div>
              {sec.items.map(item=>(
                <div key={item.id} style={S.navItem(page===item.id)} onClick={()=>setPage(item.id)}>
                  <span style={{fontSize:16,width:20,textAlign:"center"}}>{item.icon}</span>{item.label}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div style={{padding:"16px 12px",borderTop:`1px solid ${C.border}`}}>
          <div style={{background:`linear-gradient(135deg,${C.green1},${C.card})`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2}}>👤 {user.displayName||"Usuário"}</div>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:8}}>{user.email}</div>
            <button style={{width:"100%",padding:"7px 0",borderRadius:8,background:`${C.red}15`,border:`1px solid ${C.red}30`,color:C.red,fontSize:12,fontWeight:600,cursor:"pointer"}} onClick={handleLogout}>🚪 Sair da conta</button>
          </div>
          <div style={{background:`linear-gradient(135deg,${C.green1},${C.green2})`,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.accentBright}}>⭐ PRO ANUAL</div>
            <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>Consultas ilimitadas · Ativo</div>
          </div>
        </div>
      </div>

      <div style={S.main}>
        <div style={S.topbar}>
          <div style={{fontSize:17,fontWeight:700}}>{allItems.find(i=>i.id===page)?.label||"Dashboard"}</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,borderRadius:8,background:C.card,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",position:"relative",fontSize:16}}>
              🔔<div style={{position:"absolute",top:6,right:6,width:7,height:7,borderRadius:"50%",background:C.accent,border:`1.5px solid ${C.surface}`}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px 6px 6px"}}>
              <div style={{width:26,height:26,borderRadius:6,background:`linear-gradient(135deg,${C.green2},${C.accent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{initials}</div>
              <span style={{fontSize:13,fontWeight:600}}>{user.displayName?.split(" ")[0]||"Usuário"}</span>
            </div>
          </div>
        </div>
        <div style={page==="planos"||page==="admin"||page==="mapa"?{}:S.content}>
          {pageMap[page]||pageMap.dashboard}
        </div>
      </div>
    </div>
  );
}