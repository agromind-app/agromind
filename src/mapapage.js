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

const CAMADAS = [
  { id:"car",     label:"Polígono CAR",      icon:"🌿", color:"#22c55e", ativa:true  },
  { id:"sigef",   label:"SIGEF/INCRA",       icon:"🗂️", color:"#3b82f6", ativa:true  },
  { id:"app",     label:"APP",               icon:"💧", color:"#60a5fa", ativa:true  },
  { id:"rl",      label:"Reserva Legal",     icon:"🌱", color:"#4ade80", ativa:true  },
  { id:"ibama",   label:"Embargos IBAMA",    icon:"⛔", color:"#ef4444", ativa:false },
  { id:"prodes",  label:"PRODES/INPE",       icon:"📡", color:"#f97316", ativa:false },
  { id:"ti",      label:"Terras Indígenas",  icon:"🏕️", color:"#a78bfa", ativa:false },
  { id:"uc",      label:"Unid. Conservação", icon:"🌳", color:"#34d399", ativa:false },
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
  return {
    nome:         dados.sicar?.nome        || dados.car || "Imóvel Rural",
    car:          dados.car                || dados.sicar?.car || "—",
    municipio:    dados.sicar?.municipio   ? `${dados.sicar.municipio}, ${dados.sicar.uf||""}` : "—",
    area:         dados.sicar?.area        || "—",
    areaHa:       dados.sicar?.areaHa      || null,
    app:          dados.sicar?.app         || "—",
    rl:           dados.sicar?.rl          || "—",
    proprietario: dados.sicar?.proprietario|| "—",
    modulos:      dados.sicar?.modulos     || "—",
    sigef:        dados.sigef?.situacaoLabel || (dados.sigef?.encontrado ? "Localizado" : "—"),
    ccir:         dados.sigef?.ccir        || dados.sicar?.ccir || "—",
    itr:          dados.sicar?.nirf        ? `NIRF: ${dados.sicar.nirf}` : "—",
    situacao:     dados.sicar?.situacaoLabel || "—",
    embargo:      dados.ibama?.temEmbargo  || false,
    embargos:     dados.ibama?.embargos    || [],
    prodes:       dados.prodes?.temAlerta  || false,
    alertasProdes:dados.prodes?.alertas    || [],
    coordenadas:  dados.coordenadas?.lat
      ? { lat: dados.coordenadas.lat, lng: dados.coordenadas.lng }
      : FAZENDA_MOCK.coordenadas,
  };
}

const chip = (txt, color) => (
  <span style={{ display:"inline-flex",alignItems:"center",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:`${color}20`,color,border:`1px solid ${color}30` }}>{txt}</span>
);

// ─── CONFIG DE CADA CAMPO CLICÁVEL ────────────────────────────────
function getInfoCampo(campo, fazenda, dadosReais) {
  const configs = {
    car: {
      titulo: "📋 Código CAR",
      cor: C.accent,
      conteudo: () => (
        <div>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
            O CAR (Cadastro Ambiental Rural) é o registro eletrônico obrigatório para todos os imóveis rurais brasileiros, instituído pelo Código Florestal (Lei 12.651/2012).
          </div>
          <div style={{background:C.bg,borderRadius:8,padding:10,marginBottom:12,wordBreak:"break-all",fontSize:12,color:C.accentBright,fontFamily:"monospace"}}>
            {fazenda.car || "—"}
          </div>
          <div style={{marginBottom:8}}>
            {[["Situação", fazenda.situacao],["Município", fazenda.municipio],["Área Total", fazenda.area]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}>
                <span style={{color:C.textMuted}}>{l}</span>
                <span style={{fontWeight:600,color:C.text}}>{v||"—"}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
            <button onClick={()=>{navigator.clipboard?.writeText(fazenda.car||"");alert("CAR copiado!");}} style={{flex:1,padding:"8px 0",borderRadius:8,background:`${C.accent}20`,border:`1px solid ${C.accent}40`,color:C.accent,fontSize:12,fontWeight:600,cursor:"pointer"}}>
              📋 Copiar CAR
            </button>
            <a href={`https://consultapublica.car.gov.br/publico/imoveis/index`} target="_blank" rel="noreferrer" style={{flex:1,padding:"8px 0",borderRadius:8,background:`${C.blue}20`,border:`1px solid ${C.blue}40`,color:C.blue,fontSize:12,fontWeight:600,cursor:"pointer",textDecoration:"none",textAlign:"center"}}>
              🌐 SICAR Oficial ↗
            </a>
          </div>
        </div>
      )
    },
    ccir: {
      titulo: "📄 CCIR",
      cor: C.blue,
      conteudo: () => (
        <div>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
            O CCIR (Certificado de Cadastro de Imóvel Rural) é emitido pelo INCRA e comprova o cadastro do imóvel rural. É obrigatório para transações como venda, desmembramento, arrendamento e herança.
          </div>
          <div style={{background:C.bg,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.blue,fontFamily:"monospace",textAlign:"center",fontWeight:700}}>
            {fazenda.ccir || "Não informado pelo SICAR"}
          </div>
          {!fazenda.ccir || fazenda.ccir === "—" ? (
            <div style={{padding:"10px 12px",background:`${C.yellow}15`,border:`1px solid ${C.yellow}40`,borderRadius:8,fontSize:11,color:C.yellow}}>
              ⚠️ O SICAR não disponibiliza o CCIR para todos os imóveis. Consulte diretamente no INCRA.
            </div>
          ) : (
            <button onClick={()=>{navigator.clipboard?.writeText(fazenda.ccir);alert("CCIR copiado!");}} style={{width:"100%",padding:"8px 0",borderRadius:8,background:`${C.blue}20`,border:`1px solid ${C.blue}40`,color:C.blue,fontSize:12,fontWeight:600,cursor:"pointer"}}>
              📋 Copiar CCIR
            </button>
          )}
          <a href="https://sncr.serpro.gov.br/" target="_blank" rel="noreferrer" style={{display:"block",marginTop:8,padding:"8px 0",borderRadius:8,background:`${C.blue}10`,border:`1px solid ${C.blue}30`,color:C.blue,fontSize:12,fontWeight:600,cursor:"pointer",textDecoration:"none",textAlign:"center"}}>
            🌐 Consultar INCRA ↗
          </a>
        </div>
      )
    },
    itr: {
      titulo: "💰 ITR / NIRF",
      cor: C.yellow,
      conteudo: () => (
        <div>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
            O ITR (Imposto Territorial Rural) é cobrado anualmente pela Receita Federal. O NIRF é o número de inscrição do imóvel rural no cadastro da Receita.
          </div>
          <div style={{background:C.bg,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.yellow,fontFamily:"monospace",textAlign:"center",fontWeight:700}}>
            {fazenda.itr || "Não informado"}
          </div>
          {fazenda.areaHa && (
            <div style={{background:`${C.yellow}10`,border:`1px solid ${C.yellow}30`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>📊 Estimativa ITR (Lei 9.393/96)</div>
              <div style={{fontSize:13,fontWeight:700,color:C.yellow}}>
                ~R$ {(fazenda.areaHa * 2.2).toLocaleString("pt-BR", {minimumFractionDigits:2})} / ano
              </div>
              <div style={{fontSize:10,color:C.textMuted,marginTop:2}}>Baseado em {fazenda.area} · VTN médio estimado</div>
            </div>
          )}
          <a href="https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/itr" target="_blank" rel="noreferrer" style={{display:"block",padding:"8px 0",borderRadius:8,background:`${C.yellow}10`,border:`1px solid ${C.yellow}30`,color:C.yellow,fontSize:12,fontWeight:600,cursor:"pointer",textDecoration:"none",textAlign:"center"}}>
            🌐 Receita Federal — ITR ↗
          </a>
        </div>
      )
    },
    proprietario: {
      titulo: "👤 Proprietário",
      cor: C.purple,
      conteudo: () => (
        <div>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
            Dados do proprietário ou possuidor conforme declarado no SICAR.
          </div>
          <div style={{background:C.bg,borderRadius:8,padding:12,marginBottom:12,textAlign:"center"}}>
            <div style={{fontSize:16,fontWeight:800,color:C.accentBright,marginBottom:4}}>{fazenda.proprietario || "Não informado"}</div>
            <div style={{fontSize:11,color:C.textMuted}}>{fazenda.municipio}</div>
          </div>
          {(!fazenda.proprietario || fazenda.proprietario === "—") ? (
            <div style={{padding:"10px 12px",background:`${C.yellow}15`,border:`1px solid ${C.yellow}40`,borderRadius:8,fontSize:11,color:C.yellow}}>
              ⚠️ Proprietário não disponibilizado pelo SICAR para este imóvel.
            </div>
          ) : (
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={()=>{navigator.clipboard?.writeText(fazenda.proprietario);alert("Nome copiado!");}} style={{flex:1,padding:"8px 0",borderRadius:8,background:`${C.purple}20`,border:`1px solid ${C.purple}40`,color:C.purple,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                📋 Copiar Nome
              </button>
              <a href={`https://consultapublica.car.gov.br/publico/imoveis/index`} target="_blank" rel="noreferrer" style={{flex:1,padding:"8px 0",borderRadius:8,background:`${C.blue}20`,border:`1px solid ${C.blue}40`,color:C.blue,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>
                🔍 Buscar no SICAR ↗
              </a>
            </div>
          )}
        </div>
      )
    },
    app: {
      titulo: "💧 APP — Área de Preservação Permanente",
      cor: C.blue,
      conteudo: () => {
        const areaHa = fazenda.areaHa;
        const appHa = parseFloat((fazenda.app || "0").replace(/[^\d,]/g,"").replace(",",".")) || null;
        const pct = areaHa && appHa ? ((appHa/areaHa)*100).toFixed(1) : null;
        return (
          <div>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
              A APP protege recursos hídricos, encostas e topos de morro. É definida pelo Código Florestal (Lei 12.651/2012) e não pode ser desmatada ou utilizada economicamente, salvo em casos de utilidade pública.
            </div>
            <div style={{background:`${C.blue}10`,border:`1px solid ${C.blue}30`,borderRadius:10,padding:"14px",marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:900,color:C.blue}}>{fazenda.app || "—"}</div>
              {pct && <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>{pct}% da área total do imóvel</div>}
            </div>
            <div style={{background:`${C.accent}10`,border:`1px solid ${C.accent}30`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>📏 Faixas mínimas (Lei 12.651/2012)</div>
              {[["Rios até 10m","30m de cada margem"],["Rios 10-50m","50m de cada margem"],["Nascentes","50m de raio"],["Topo de morro","1/3 superior"]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.textMuted}}>{l}</span><span style={{color:C.blue,fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
    },
    rl: {
      titulo: "🌱 Reserva Legal",
      cor: C.accentBright,
      conteudo: () => {
        const areaHa = fazenda.areaHa;
        const rlHa = parseFloat((fazenda.rl || "0").replace(/[^\d,]/g,"").replace(",",".")) || null;
        const pct = areaHa && rlHa ? ((rlHa/areaHa)*100).toFixed(1) : null;
        return (
          <div>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
              A Reserva Legal é a área de vegetação nativa obrigatória em todo imóvel rural, destinada à conservação da biodiversidade. Percentual mínimo varia por bioma (80% Amazônia, 35% Cerrado, 20% demais).
            </div>
            <div style={{background:`${C.accentBright}10`,border:`1px solid ${C.accentBright}30`,borderRadius:10,padding:"14px",marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:900,color:C.accentBright}}>{fazenda.rl || "—"}</div>
              {pct && <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>{pct}% da área total</div>}
            </div>
            <div style={{marginBottom:8}}>
              {[["🌿 Amazônia","80% da área","#22c55e"],["🏜️ Cerrado (AM/PA/MT/TO/MA)","35% da área","#fbbf24"],["🌾 Demais regiões","20% da área","#3b82f6"]].map(([bioma,pctMin,cor])=>(
                <div key={bioma} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",marginBottom:4,borderRadius:6,background:`${cor}10`,border:`1px solid ${cor}20`,fontSize:11}}>
                  <span style={{color:C.textMuted}}>{bioma}</span>
                  <span style={{fontWeight:700,color:cor}}>{pctMin}</span>
                </div>
              ))}
            </div>
            <a href="https://www.car.gov.br" target="_blank" rel="noreferrer" style={{display:"block",padding:"8px 0",borderRadius:8,background:`${C.accent}10`,border:`1px solid ${C.accent}30`,color:C.accent,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>
              🌐 Verificar no SICAR ↗
            </a>
          </div>
        );
      }
    },
    ibama: {
      titulo: "⛔ Embargos IBAMA",
      cor: C.red,
      conteudo: () => {
        const embargos = fazenda.embargos || dadosReais?.ibama?.embargos || [];
        const temEmbargo = fazenda.embargo || embargos.length > 0;
        return (
          <div>
            <div style={{marginBottom:12}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700,background:temEmbargo?`${C.red}20`:`${C.accent}20`,color:temEmbargo?C.red:C.accent,border:`1px solid ${temEmbargo?C.red:C.accent}40`}}>
                {temEmbargo ? `⛔ ${embargos.length} embargo(s) ativo(s)` : "✅ Sem embargos ativos"}
              </span>
            </div>
            {embargos.length > 0 ? (
              embargos.map((e, i) => (
                <div key={i} style={{padding:"10px 12px",marginBottom:8,background:`${C.red}08`,border:`1px solid ${C.red}30`,borderRadius:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.red,marginBottom:4}}>Auto nº {e.numero || "—"}</div>
                  {[["Tipo",e.tipo],["Data",e.data],["Área",e.area],["Status",e.status],["Município",e.municipio]].filter(([,v])=>v).map(([l,v])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"2px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{color:C.textMuted}}>{l}</span><span style={{color:C.text,fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div style={{textAlign:"center",padding:"16px 0"}}>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <div style={{fontSize:13,color:C.accent,fontWeight:700}}>Nenhum embargo encontrado</div>
                <div style={{fontSize:11,color:C.textMuted,marginTop:4}}>Base IBAMA consultada em tempo real</div>
              </div>
            )}
            <a href="https://ibama.gov.br" target="_blank" rel="noreferrer" style={{display:"block",marginTop:8,padding:"8px 0",borderRadius:8,background:`${C.red}10`,border:`1px solid ${C.red}30`,color:C.red,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>
              🌐 Consultar IBAMA ↗
            </a>
          </div>
        );
      }
    },
    prodes: {
      titulo: "📡 PRODES / INPE",
      cor: C.orange,
      conteudo: () => {
        const alertas = fazenda.alertasProdes || dadosReais?.prodes?.alertas || [];
        const temAlerta = fazenda.prodes || alertas.length > 0;
        const areaTotal = alertas.reduce((a, f) => a + (f.areaKm2 || 0), 0);
        return (
          <div>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
              O PRODES/INPE monitora o desmatamento por satélite. O DETER emite alertas de desmatamento em tempo real para toda a Amazônia Legal.
            </div>
            <div style={{marginBottom:12}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700,background:temAlerta?`${C.orange}20`:`${C.accent}20`,color:temAlerta?C.orange:C.accent,border:`1px solid ${temAlerta?C.orange:C.accent}40`}}>
                {temAlerta ? `🔴 ${alertas.length} alerta(s) — ${areaTotal.toFixed(2)} km²` : "🌳 Sem alertas de desmatamento"}
              </span>
            </div>
            {alertas.length > 0 ? (
              alertas.map((a, i) => (
                <div key={i} style={{padding:"10px 12px",marginBottom:8,background:`${C.orange}08`,border:`1px solid ${C.orange}30`,borderRadius:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.orange,marginBottom:4}}>{a.classname || "Desmatamento"}</div>
                  {[["Área",a.areaKm2?`${a.areaKm2} km²`:null],["Data",a.data],["Município",a.municipio]].filter(([,v])=>v).map(([l,v])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"2px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{color:C.textMuted}}>{l}</span><span style={{color:C.text,fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div style={{textAlign:"center",padding:"16px 0"}}>
                <div style={{fontSize:36,marginBottom:8}}>🌳</div>
                <div style={{fontSize:13,color:C.accent,fontWeight:700}}>Sem alertas DETER/PRODES</div>
              </div>
            )}
            <a href="http://terrabrasilis.dpi.inpe.br" target="_blank" rel="noreferrer" style={{display:"block",marginTop:8,padding:"8px 0",borderRadius:8,background:`${C.orange}10`,border:`1px solid ${C.orange}30`,color:C.orange,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>
              🌐 TerraBrasilis INPE ↗
            </a>
          </div>
        );
      }
    },
    sigef: {
      titulo: "🗂️ SIGEF / INCRA",
      cor: C.blue,
      conteudo: () => {
        const certificado = dadosReais?.sigef?.certificado;
        const sigefDados = dadosReais?.sigef;
        return (
          <div>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
              O SIGEF (Sistema de Gestão Fundiária) do INCRA certifica o georreferenciamento de imóveis rurais. A certificação é obrigatória para regularização fundiária e registro em cartório.
            </div>
            <div style={{marginBottom:12,textAlign:"center"}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:20,fontSize:13,fontWeight:700,background:certificado?`${C.accent}20`:`${C.yellow}20`,color:certificado?C.accent:C.yellow,border:`1px solid ${certificado?C.accent:C.yellow}40`}}>
                {certificado ? "✅ Georreferenciamento Certificado" : "⚠️ Não certificado no SIGEF"}
              </span>
            </div>
            {sigefDados?.encontrado && (
              <div style={{marginBottom:8}}>
                {[["Denominação",sigefDados.denominacao],["Área Registrada",sigefDados.area],["Município",sigefDados.municipio],["CCIR",sigefDados.ccir],["Código INCRA",sigefDados.codigoIncra]].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}>
                    <span style={{color:C.textMuted}}>{l}</span><span style={{color:C.text,fontWeight:600,maxWidth:140,textAlign:"right"}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <a href="https://sigef.incra.gov.br" target="_blank" rel="noreferrer" style={{display:"block",padding:"8px 0",borderRadius:8,background:`${C.blue}10`,border:`1px solid ${C.blue}30`,color:C.blue,fontSize:12,fontWeight:600,textDecoration:"none",textAlign:"center"}}>
              🌐 Consultar SIGEF ↗
            </a>
          </div>
        );
      }
    },
    modulos: {
      titulo: "📐 Módulos Fiscais",
      cor: C.yellow,
      conteudo: () => {
        const modulos = parseFloat((fazenda.modulos||"0").replace(/[^\d,\.]/g,"").replace(",",".")) || null;
        const classificacao = !modulos ? "—" : modulos < 1 ? "Minifúndio" : modulos <= 4 ? "Pequena Propriedade" : modulos <= 15 ? "Média Propriedade" : "Grande Propriedade";
        const corClass = !modulos ? C.textMuted : modulos < 1 ? C.red : modulos <= 4 ? C.accent : modulos <= 15 ? C.yellow : C.orange;
        return (
          <div>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:12}}>
              O Módulo Fiscal é uma unidade de medida definida pelo INCRA para cada município. Classifica o imóvel em Minifúndio, Pequena, Média ou Grande Propriedade.
            </div>
            <div style={{background:`${C.yellow}10`,border:`1px solid ${C.yellow}30`,borderRadius:10,padding:"14px",marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:900,color:C.yellow}}>{fazenda.modulos || "—"}</div>
              <div style={{fontSize:13,fontWeight:700,color:corClass,marginTop:6}}>{classificacao}</div>
            </div>
            <div style={{marginBottom:8}}>
              {[["Minifúndio","Menos de 1 módulo",C.red],["Pequena Propriedade","1 a 4 módulos",C.accent],["Média Propriedade","4 a 15 módulos",C.yellow],["Grande Propriedade","Acima de 15 módulos",C.orange]].map(([cat,desc,cor])=>(
                <div key={cat} style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",marginBottom:3,borderRadius:6,background:classificacao===cat?`${cor}15`:"transparent",border:`1px solid ${classificacao===cat?cor+"40":"transparent"}`,fontSize:11}}>
                  <span style={{color:classificacao===cat?cor:C.textMuted,fontWeight:classificacao===cat?700:400}}>{cat}</span>
                  <span style={{color:C.textMuted,fontSize:10}}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
    },
  };
  return configs[campo] || null;
}

// ─── INFOROW CLICÁVEL ──────────────────────────────────────────────
function InfoRowClicavel({ label, value, campo, onClicar }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onClicar(campo)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:"flex", justifyContent:"space-between", padding:"6px 6px 6px 8px",
        borderBottom:`1px solid ${C.border}`, fontSize:11, cursor:"pointer",
        borderRadius:6, margin:"1px 0",
        background: hover ? `${C.accent}08` : "transparent",
        transition:"background 0.15s",
      }}
    >
      <span style={{color:C.textMuted,display:"flex",alignItems:"center",gap:4}}>
        {label}
        <span style={{fontSize:9,color:C.textDim,opacity:hover?1:0,transition:"opacity 0.15s"}}>▶</span>
      </span>
      <span style={{fontWeight:600,color:hover?C.accentBright:C.text,textAlign:"right",maxWidth:140,transition:"color 0.15s"}}>{value ?? "—"}</span>
    </div>
  );
}

// ─── PAINEL DE DETALHE (DRAWER DIREITO) ───────────────────────────
function PainelDetalhe({ campo, fazenda, dadosReais, onFechar }) {
  const info = campo ? getInfoCampo(campo, fazenda, dadosReais) : null;
  const aberto = !!campo;

  return (
    <>
      {/* Overlay */}
      {aberto && (
        <div
          onClick={onFechar}
          style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",zIndex:1500,backdropFilter:"blur(2px)"}}
        />
      )}
      {/* Drawer */}
      <div style={{
        position:"absolute", top:0, right:0, bottom:0, width:320,
        background:C.surface, borderLeft:`1px solid ${C.border}`,
        zIndex:1600, display:"flex", flexDirection:"column",
        transform: aberto ? "translateX(0)" : "translateX(100%)",
        transition:"transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: aberto ? "-8px 0 32px rgba(0,0,0,0.4)" : "none",
      }}>
        {/* Header */}
        <div style={{
          padding:"16px 16px 12px",
          borderBottom:`1px solid ${C.border}`,
          background: info ? `linear-gradient(135deg,${info.cor}18,transparent)` : C.surface,
          flexShrink:0,
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:800,color:info?.cor||C.accentBright}}>{info?.titulo || ""}</div>
            <button
              onClick={onFechar}
              style={{width:28,height:28,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.bg,color:C.textMuted,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
            >×</button>
          </div>
        </div>
        {/* Conteúdo */}
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          {info?.conteudo?.()}
        </div>
      </div>
    </>
  );
}

// ─── SOBREPOSIÇÕES ─────────────────────────────────────────────────
async function buscarSobreposicoes(lat, lng, car, map, L) {
  if (!lat || !lng || !map || !L) return;
  const buffer = 0.1;
  const bbox = `${lng-buffer},${lat-buffer},${lng+buffer},${lat+buffer}`;
  const resultados = { ti: [], uc: [], vizinhos: [] };

  // Terras Indígenas — FUNAI
  try {
    const url = `https://geoserver.funai.gov.br/geoserver/Funai/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Funai:tis_poligonais&CQL_FILTER=BBOX(geom,${bbox})&outputFormat=application/json&maxFeatures=10`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const data = await resp.json();
      const features = data.features || [];
      features.forEach(f => {
        if (f.geometry) {
          L.geoJSON(f, { style:{ color:"#a78bfa",weight:2,fillColor:"#a78bfa",fillOpacity:0.2,dashArray:"6,4" } })
            .bindPopup(`<b>🏕️ Terra Indígena</b><br>${f.properties?.terrai_nom||"—"}`).addTo(map);
        }
      });
      resultados.ti = features;
    }
  } catch {}

  // Unidades de Conservação — ICMBio
  try {
    const url = `https://geoservicos.inde.gov.br/geoserver/ICMBio/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICMBio:UC_Fed_Pol_Jun2019&CQL_FILTER=BBOX(geom,${bbox})&outputFormat=application/json&maxFeatures=10`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const data = await resp.json();
      const features = data.features || [];
      features.forEach(f => {
        if (f.geometry) {
          L.geoJSON(f, { style:{ color:"#34d399",weight:2,fillColor:"#34d399",fillOpacity:0.2,dashArray:"8,4" } })
            .bindPopup(`<b>🌳 Unidade de Conservação</b><br>${f.properties?.nome_uc||"—"}<br>${f.properties?.categori3||""}`).addTo(map);
        }
      });
      resultados.uc = features;
    }
  } catch {}

  // CAR vizinhos — SICAR (imóveis próximos)
  if (car) {
    try {
      const uf = car.match(/^([A-Z]{2})-/i)?.[1]?.toLowerCase();
      if (uf) {
        const filtro = `BBOX(geom,${bbox}) AND cod_imovel <> '${car.toUpperCase()}'`;
        const sicarUrl = `https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sicar:sicar_imoveis_${uf}&CQL_FILTER=${encodeURIComponent(filtro)}&outputFormat=application/json&maxFeatures=5`;
        const proxyUrl = "https://agromind-proxy.agromindpro.workers.dev";
        const resp = await fetch(`${proxyUrl}?url=${encodeURIComponent(sicarUrl)}`, { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
          const data = await resp.json();
          const features = data.features || [];
          features.forEach(f => {
            if (f.geometry) {
              L.geoJSON(f, { style:{ color:"#f97316",weight:2,fillColor:"#f97316",fillOpacity:0.12,dashArray:"4,4" } })
                .bindPopup(`<b>🌾 CAR Vizinho</b><br>${f.properties?.cod_imovel||"—"}<br>${f.properties?.nom_imovel||""}<br>${f.properties?.nom_proprietario||""}`).addTo(map);
            }
          });
          resultados.vizinhos = features;
        }
      }
    } catch {}
  }

  return resultados;
}

// ─── LAUDO PDF ────────────────────────────────────────────────────
const gerarNumeroLaudo = () => {
  const ano = new Date().getFullYear();
  const seq = String(Math.floor(Math.random()*99999)).padStart(5,"0");
  return `AGM-${ano}-${seq}`;
};
const dataHoje = () => new Date().toLocaleDateString("pt-BR",{ day:"2-digit", month:"long", year:"numeric" });

function LaudoVisual({ fazenda, dadosReais, numeroLaudo }) {
  const score=dadosReais?.score,clima=dadosReais?.clima,nasa=dadosReais?.nasa,cotacoes=dadosReais?.cotacoes,ibama=dadosReais?.ibama,prodes=dadosReais?.prodes;
  const scoreValor=score?.valor??78,scoreNivel=score?.nivel??"Baixo Risco";
  const scoreCor=!score?"#22c55e":scoreValor>=75?"#22c55e":scoreValor>=50?"#fbbf24":"#ef4444";
  const SH=({icon,title,color="#16a34a"})=>(<div style={{display:"flex",alignItems:"center",gap:10,background:`linear-gradient(90deg,${color}18,transparent)`,borderLeft:`4px solid ${color}`,padding:"8px 14px",marginBottom:12,borderRadius:"0 8px 8px 0"}}><span style={{fontSize:16}}>{icon}</span><span style={{fontSize:13,fontWeight:800,color,letterSpacing:0.5}}>{title}</span></div>);
  const Row2=({label,value,color})=>(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #e5e7eb",fontSize:11}}><span style={{color:"#6b7280"}}>{label}</span><span style={{fontWeight:700,color:color||"#1a2e1a",maxWidth:200,textAlign:"right"}}>{value??"—"}</span></div>);
  const Badge=({ok,textoOk,textoNok})=>(<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,background:ok?"#dcfce7":"#fee2e2",color:ok?"#16a34a":"#dc2626",border:`1px solid ${ok?"#86efac":"#fca5a5"}`}}>{ok?"✅":"⛔"} {ok?textoOk:textoNok}</span>);
  return(
    <div id="laudo-conteudo" style={{width:794,background:"#ffffff",fontFamily:"Georgia,serif",color:"#1a2e1a"}}>
      <div style={{background:"linear-gradient(135deg,#0d5c2e 0%,#12803f 50%,#16a34a 100%)",padding:"36px 40px 28px",color:"white"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}><div style={{width:44,height:44,borderRadius:12,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🌿</div><div><div style={{fontSize:22,fontWeight:900,letterSpacing:1}}>AgroMind</div><div style={{fontSize:10,opacity:0.8,letterSpacing:2,textTransform:"uppercase"}}>Inteligência Rural</div></div></div><div style={{fontSize:18,fontWeight:700,marginTop:16,marginBottom:4}}>Laudo de Análise Rural</div><div style={{fontSize:12,opacity:0.85}}>{fazenda.nome}</div></div>
          <div style={{textAlign:"right"}}><div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"10px 16px"}}><div style={{fontSize:10,opacity:0.8,marginBottom:2}}>Nº DO LAUDO</div><div style={{fontSize:14,fontWeight:900,letterSpacing:1}}>{numeroLaudo}</div><div style={{fontSize:10,opacity:0.8,marginTop:6}}>{dataHoje()}</div></div></div>
        </div>
        <div style={{display:"flex",gap:12,marginTop:24,background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"12px 16px"}}>
          {[["📍",fazenda.municipio||"—","Localização"],["🌾",fazenda.area||"—","Área Total"],["📋",(fazenda.car||"").substring(0,14)+"…","CAR"],["🤖",`${scoreValor}/100`,"Score IA"]].map(([icon,val,label])=>(<div key={label} style={{flex:1,textAlign:"center"}}><div style={{fontSize:18}}>{icon}</div><div style={{fontSize:12,fontWeight:800,marginTop:2}}>{val}</div><div style={{fontSize:9,opacity:0.7,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div></div>))}
        </div>
      </div>
      <div style={{padding:"28px 40px",display:"flex",flexDirection:"column",gap:24}}>
        <div><SH icon="📋" title="1. IDENTIFICAÇÃO DO IMÓVEL" color="#16a34a"/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}><div><Row2 label="Nome da Fazenda" value={fazenda.nome}/><Row2 label="Município / UF" value={fazenda.municipio}/><Row2 label="Área Total" value={fazenda.area}/><Row2 label="Módulos Fiscais" value={fazenda.modulos}/><Row2 label="APP" value={fazenda.app}/></div><div><Row2 label="Proprietário" value={fazenda.proprietario}/><Row2 label="CAR" value={fazenda.car}/><Row2 label="CCIR" value={fazenda.ccir}/><Row2 label="ITR / NIRF" value={fazenda.itr}/><Row2 label="Reserva Legal" value={fazenda.rl}/></div></div><div style={{marginTop:10}}><Row2 label="SIGEF / INCRA" value={fazenda.sigef}/><Row2 label="Latitude" value={`${fazenda.coordenadas?.lat}°`}/><Row2 label="Longitude" value={`${fazenda.coordenadas?.lng}°`}/></div></div>
        <div><SH icon="🤖" title="2. SCORE IA — ANÁLISE DE RISCO" color="#22c55e"/><div style={{display:"flex",gap:20,alignItems:"flex-start"}}><div style={{textAlign:"center",flexShrink:0}}><div style={{width:90,height:90,borderRadius:"50%",background:`conic-gradient(${scoreCor} 0deg,${scoreCor} ${(scoreValor/100)*360}deg,#e5e7eb ${(scoreValor/100)*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px"}}><div style={{width:68,height:68,borderRadius:"50%",background:"white",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:24,fontWeight:900,color:scoreCor,lineHeight:1}}>{scoreValor}</div><div style={{fontSize:9,color:"#9ca3af"}}>/100</div></div></div><div style={{fontSize:12,fontWeight:800,color:scoreCor}}>{scoreNivel}</div></div><div style={{flex:1}}>{score?.fatores?.length>0?score.fatores.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #e5e7eb",fontSize:11}}><span style={{color:"#6b7280"}}>{f.label}</span><span style={{fontWeight:700,color:f.cor}}>{f.impacto===0?"✅ OK":f.impacto}</span></div>)):<div style={{fontSize:11,color:"#6b7280",fontStyle:"italic",marginTop:8}}>Realize uma consulta real para visualizar os fatores detalhados.</div>}</div></div></div>
        <div><SH icon="⛔" title="3. EMBARGOS IBAMA" color="#ef4444"/><div style={{marginBottom:10}}><Badge ok={!fazenda.embargo} textoOk="Sem Embargo Ativo" textoNok="Embargo IBAMA Ativo"/></div>{ibama?.embargos?.length>0?ibama.embargos.map((e,i)=>(<div key={i} style={{padding:"8px 12px",marginBottom:6,background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,fontSize:11}}><div style={{fontWeight:700,color:"#dc2626"}}>⛔ Embargo #{i+1}</div><div style={{color:"#6b7280"}}>Área: {e.area||"—"} · Data: {e.data||"—"}</div></div>)):<div style={{padding:"10px 14px",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,fontSize:11,color:"#166534"}}>✅ Nenhum embargo encontrado na base IBAMA.</div>}</div>
        <div><SH icon="📡" title="4. PRODES / INPE — DESMATAMENTO" color="#f97316"/><div style={{marginBottom:10}}><Badge ok={!fazenda.prodes} textoOk="Sem Alerta PRODES" textoNok="Alerta PRODES Ativo"/></div>{prodes?.alertas?.length>0?prodes.alertas.map((a,i)=>(<div key={i} style={{padding:"8px 12px",marginBottom:6,background:"#fff7ed",border:"1px solid #fdba74",borderRadius:8,fontSize:11}}><div style={{fontWeight:700,color:"#ea580c"}}>🔴 Alerta #{i+1}</div><div style={{color:"#6b7280"}}>Área: {a.areaKm2||"—"} km² · Data: {a.data||"—"}</div></div>)):<div style={{padding:"10px 14px",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,fontSize:11,color:"#166534"}}>✅ Nenhum alerta de desmatamento encontrado.</div>}</div>
        {(clima?.encontrado||nasa?.encontrado)&&(<div><SH icon="🌤️" title="5. CLIMA & DADOS NASA POWER" color="#3b82f6"/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>{clima?.encontrado&&(<div><div style={{fontSize:11,fontWeight:700,color:"#3b82f6",marginBottom:8}}>🌤️ Clima Atual</div>{[["🌡️ Temperatura",`${clima.atual?.temperatura??"—"}°C`],["💧 Umidade",`${clima.atual?.umidade??"—"}%`],["💨 Vento",`${clima.atual?.vento??"—"} km/h`],["🌧️ Chuva 30 dias",`${clima.precipTotal30d??"—"} mm`]].map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #e5e7eb",fontSize:11}}><span style={{color:"#6b7280"}}>{l}</span><span style={{fontWeight:700,color:"#3b82f6"}}>{v}</span></div>))}</div>)}{nasa?.encontrado&&(<div><div style={{fontSize:11,fontWeight:700,color:"#a78bfa",marginBottom:8}}>🛰️ NASA POWER</div>{[["☀️ Radiação Solar",nasa.radiacaoSolar?`${nasa.radiacaoSolar} MJ/m²`:"—"],["🌡️ Temp. Média",nasa.temperaturaMedia?`${nasa.temperaturaMedia}°C`:"—"],["💧 Umid. Relativa",nasa.umidadeRelativa?`${nasa.umidadeRelativa}%`:"—"]].map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #e5e7eb",fontSize:11}}><span style={{color:"#6b7280"}}>{l}</span><span style={{fontWeight:700,color:"#a78bfa"}}>{v}</span></div>))}</div>)}</div></div>)}
        {cotacoes?.encontrado&&(<div><SH icon="📊" title="6. COTAÇÕES CEPEA" color="#fbbf24"/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{Object.entries(cotacoes.produtos||{}).map(([k,v])=>(<div key={k} style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,fontWeight:700,color:"#1a2e1a",marginBottom:2}}>{v.nome}</div><div style={{fontSize:13,fontWeight:900,color:"#d97706"}}>{v.preco?`R$ ${Number(v.preco).toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"}</div><div style={{fontSize:10,color:"#6b7280"}}>{v.unidade}</div></div>))}</div></div>)}
        <div style={{background:"#f8fdf8",border:"1px solid #86efac",borderRadius:10,padding:"14px 18px",fontSize:10,color:"#374151",lineHeight:1.7}}><div style={{fontWeight:700,color:"#166534",marginBottom:6,fontSize:11}}>📋 Declaração</div>Este laudo foi gerado automaticamente pela plataforma AgroMind com base em dados públicos oficiais (SICAR/CAR, IBAMA, PRODES/INPE, SIGEF/INCRA, Open-Meteo, NASA POWER, CEPEA). As informações são de caráter informativo. Data de geração: {dataHoje()}.</div>
      </div>
      <div style={{background:"linear-gradient(135deg,#0d5c2e,#16a34a)",padding:"14px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",color:"rgba(255,255,255,0.85)"}}><div style={{fontSize:11}}>🌿 <strong>AgroMind</strong> — Inteligência Rural Brasileira</div><div style={{fontSize:10}}>{numeroLaudo} · agromindpro.com.br</div><div style={{fontSize:10}}>{dataHoje()}</div></div>
    </div>
  );
}

async function gerarLaudoPDF(fazenda, dadosReais, setGerando) {
  setGerando(true);
  try {
    const numeroLaudo = gerarNumeroLaudo();
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-9999px;top:0;width:794px;background:#ffffff;z-index:-1;";
    document.body.appendChild(container);
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(container);
    await new Promise(resolve => { root.render(<LaudoVisual fazenda={fazenda} dadosReais={dadosReais} numeroLaudo={numeroLaudo}/>); setTimeout(resolve, 600); });
    const elemento = container.querySelector("#laudo-conteudo");
    if (!elemento) throw new Error("Elemento do laudo não encontrado");
    const canvas = await html2canvas(elemento, { scale:2, useCORS:true, backgroundColor:"#ffffff", logging:false });
    const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
    const larguraMM=210, alturaMM=297, ratio=larguraMM/canvas.width, totalAltMM=canvas.height*ratio;
    let posY=0, pagina=0;
    while (posY < totalAltMM) {
      if (pagina > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg",0.92),"JPEG",0,-posY,larguraMM,totalAltMM);
      posY+=alturaMM; pagina++;
    }
    const nomeArquivo=`Laudo_${(fazenda.nome||"Imovel").replace(/\s+/g,"_")}_${numeroLaudo}.pdf`;
    pdf.save(nomeArquivo);
    root.unmount(); document.body.removeChild(container);
    alert(`✅ Laudo gerado!\n📄 ${nomeArquivo}`);
  } catch (err) {
    alert(`❌ Erro ao gerar laudo: ${err.message}`);
  } finally { setGerando(false); }
}

// ─── CARDS ────────────────────────────────────────────────────────
function CardClima({clima}){if(!clima?.encontrado)return null;const a=clima.atual;const maxChuva=Math.max(...(clima.previsao7dias||[]).map(x=>x.chuva),1);return(<div style={{background:C.card,border:`1px solid ${C.blue}30`,borderRadius:14,padding:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:12,fontWeight:700}}>🌤️ Clima Atual</div><span style={{fontSize:10,color:C.textMuted}}>{a?.descricao}</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>{[["🌡️ Temp.",`${a?.temperatura??'--'}°C`],["💧 Umidade",`${a?.umidade??'--'}%`],["💨 Vento",`${a?.vento??'--'} km/h`],["🌧️ Chuva",`${a?.precipitacao??0} mm`]].map(([l,v])=>(<div key={l} style={{background:`${C.blue}10`,border:`1px solid ${C.blue}20`,borderRadius:8,padding:"7px 9px"}}><div style={{fontSize:10,color:C.textMuted}}>{l}</div><div style={{fontSize:13,fontWeight:800,color:C.blue}}>{v}</div></div>))}</div>{(clima.previsao7dias||[]).length>0&&(<><div style={{fontSize:10,color:C.textMuted,marginBottom:5}}>Previsão 7 dias (mm)</div><div style={{display:"flex",alignItems:"flex-end",gap:3,height:38}}>{clima.previsao7dias.map((d,i)=>(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><div style={{width:"100%",height:`${Math.max((d.chuva/maxChuva)*100,4)}%`,background:`linear-gradient(180deg,${C.blue}90,${C.blue}40)`,borderRadius:"3px 3px 0 0",minHeight:3}}/><span style={{fontSize:9,color:C.textDim}}>{d.dataFormatada}</span></div>))}</div><div style={{marginTop:6,fontSize:11,color:C.textMuted}}>🌧️ 30d: <strong style={{color:C.blue}}>{clima.precipTotal30d} mm</strong></div></>)}</div>);}
function CardNASA({nasa}){if(!nasa?.encontrado)return null;return(<div style={{background:C.card,border:`1px solid ${C.purple}30`,borderRadius:14,padding:14}}><div style={{fontSize:12,fontWeight:700,marginBottom:10}}>🛰️ NASA POWER</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>{[["☀️ Radiação",nasa.radiacaoSolar?`${nasa.radiacaoSolar} MJ/m²`:"—"],["🌡️ Temp. Média",nasa.temperaturaMedia?`${nasa.temperaturaMedia}°C`:"—"],["🌧️ Precip.",nasa.precipitacaoMedia?`${nasa.precipitacaoMedia} mm/d`:"—"],["💧 Umidade",nasa.umidadeRelativa?`${nasa.umidadeRelativa}%`:"—"]].map(([l,v])=>(<div key={l} style={{background:`${C.purple}10`,border:`1px solid ${C.purple}20`,borderRadius:8,padding:"7px 9px"}}><div style={{fontSize:10,color:C.textMuted}}>{l}</div><div style={{fontSize:13,fontWeight:800,color:C.purple}}>{v}</div></div>))}</div></div>);}
function CardCotacoes({cotacoes}){if(!cotacoes?.encontrado)return null;return(<div style={{background:C.card,border:`1px solid ${C.yellow}30`,borderRadius:14,padding:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:12,fontWeight:700}}>📊 Cotações CEPEA</div>{cotacoes.dolarHoje&&<span style={{fontSize:10,color:C.textMuted}}>💵 R$ {Number(cotacoes.dolarHoje).toFixed(2)}</span>}</div>{Object.entries(cotacoes.produtos||{}).map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.border}`}}><div><div style={{fontSize:12,fontWeight:600,color:C.text}}>{v.nome}</div><div style={{fontSize:10,color:C.textMuted}}>{v.unidade}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:800,color:C.yellow}}>{v.preco?`R$ ${Number(v.preco).toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"}</div>{v.variacao!=null&&<div style={{fontSize:10,color:v.variacao>=0?C.accent:C.red}}>{v.variacao>=0?"▲":"▼"} {Math.abs(v.variacao).toFixed(1)}%</div>}</div></div>))}</div>);}
function CardScore({score}){if(!score)return null;const cor=score.cor;return(<div style={{background:C.card,border:`1px solid ${cor}30`,borderRadius:14,padding:14,textAlign:"center",marginBottom:16}}><div style={{fontSize:11,color:C.textMuted,marginBottom:8}}>🤖 Score IA</div><div style={{width:80,height:80,borderRadius:"50%",background:`conic-gradient(${cor} 0deg,${cor} ${(score.valor/100)*360}deg,${C.border} ${(score.valor/100)*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px"}}><div style={{width:60,height:60,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:22,fontWeight:900,color:cor,lineHeight:1}}>{score.valor}</div><div style={{fontSize:9,color:C.textMuted}}>/100</div></div></div><div style={{fontSize:12,fontWeight:700,color:cor,marginBottom:8}}>{score.nivel}</div>{score.fatores?.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}><span style={{color:C.textMuted}}>{f.label}</span><span style={{fontWeight:700,color:f.cor}}>{f.impacto===0?"✅":f.impacto}</span></div>))}</div>);}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────
export default function MapaPage({ dadosConsulta }) {
  const mapRef      = useRef(null);
  const leafletMap  = useRef(null);
  const kmlLayerRef = useRef(null);
  const sobrepLayerRef = useRef([]);
  const [camadas,    setCamadas]    = useState(CAMADAS);
  const [tipoMapa,   setTipoMapa]   = useState("satellite");
  const [fazenda,    setFazenda]    = useState(FAZENDA_MOCK);
  const [dadosReais, setDadosReais] = useState(null);
  const [kmlNome,    setKmlNome]    = useState(null);
  const [tipoBusca,  setTipoBusca]  = useState("car");
  const [searchVal,  setSearchVal]  = useState("");
  const [buscando,   setBuscando]   = useState(false);
  const [erroBusca,  setErroBusca]  = useState(null);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [campoPainel, setCampoPainel] = useState(null); // campo do drawer aberto
  const [sobreposicoes, setSobreposicoes] = useState(null);
  const [buscandoSobr, setBuscandoSobr] = useState(false);
  const fileRef = useRef(null);

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
    const map = L.map(mapRef.current, { center: coordInicial, zoom:13, zoomControl:false });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution:"© Esri", maxZoom:19 }).addTo(map);
    L.control.zoom({ position:"bottomright" }).addTo(map);
    leafletMap.current = map;
    if (dadosConsulta) {
      const geom = dadosConsulta.sicar?.geometria || dadosConsulta.sigef?.geometria;
      if (geom) desenharReal(map, L, geom, dadosConsulta);
      else if (dadosConsulta.coordenadas?.lat) { map.setView([dadosConsulta.coordenadas.lat, dadosConsulta.coordenadas.lng], 13); adicionarMarcador(map, L, dadosConsulta.coordenadas.lat, dadosConsulta.coordenadas.lng, dadosConsulta); }
    } else { desenharMock(map, L); }
  };

  const adicionarMarcador = (map, L, lat, lng, dados) => {
    const icon = L.divIcon({ html:`<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4)"></div>`, iconSize:[36,36], iconAnchor:[18,36], className:"" });
    L.marker([lat,lng],{icon}).addTo(map).bindPopup(`<div style="font-family:sans-serif;min-width:220px"><div style="font-weight:800;font-size:14px;color:#0d5c2e;margin-bottom:6px">🌿 ${dados.sicar?.nome||dados.car||"Imóvel Rural"}</div><div style="font-size:12px;color:#666;margin-bottom:3px">📍 ${dados.sicar?.municipio||""} ${dados.sicar?.uf?`· ${dados.sicar.uf}`:""}</div><div style="font-size:12px;color:#666;margin-bottom:3px">🌾 ${dados.sicar?.area||"—"}</div><hr style="margin:8px 0;border-color:#eee"/><div style="font-size:11px;color:#22c55e;font-weight:700">Score: ${dados.score?.valor||"—"}/100 — ${dados.score?.nivel||"—"}</div></div>`).openPopup();
  };

  const desenharMock = (map, L) => {
    const {lat,lng}=FAZENDA_MOCK.coordenadas,o=0.05;
    const pol=L.polygon([[lat+o,lng-o*.5],[lat+o,lng+o],[lat,lng+o*1.5],[lat-o,lng+o],[lat-o,lng-o*.5],[lat,lng-o*1.2]],{color:"#22c55e",weight:3,fillColor:"#22c55e",fillOpacity:0.15}).addTo(map);
    L.polygon([[lat+o*.3,lng-o*.3],[lat+o*.5,lng+o*.3],[lat+o*.2,lng+o*.6],[lat,lng+o*.4],[lat-o*.1,lng]],{color:"#60a5fa",weight:2,fillColor:"#60a5fa",fillOpacity:0.2,dashArray:"5,5"}).addTo(map);
    L.polygon([[lat-o*.2,lng-o*.4],[lat-o*.1,lng+o*.1],[lat-o*.4,lng+o*.2],[lat-o*.5,lng-o*.2]],{color:"#4ade80",weight:2,fillColor:"#4ade80",fillOpacity:0.25,dashArray:"8,4"}).addTo(map);
    const icon=L.divIcon({html:`<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4)"></div>`,iconSize:[36,36],iconAnchor:[18,36],className:""});
    L.marker([lat,lng],{icon}).addTo(map).bindPopup(`<div style="font-family:sans-serif;min-width:200px"><div style="font-weight:800;font-size:14px;color:#0d5c2e;margin-bottom:4px">🌿 ${FAZENDA_MOCK.nome}</div><div style="font-size:12px;color:#666">📍 ${FAZENDA_MOCK.municipio} · ${FAZENDA_MOCK.area}</div><hr style="margin:8px 0;border-color:#eee"/><div style="font-size:11px;color:#22c55e;font-weight:700">✅ Dados de demonstração</div></div>`);
    map.fitBounds(pol.getBounds(),{padding:[40,40]});
  };

  const desenharReal = (map, L, geometria, dados) => {
    Object.values(map._layers).forEach(layer => { if(layer._latlngs||layer._latlng){try{map.removeLayer(layer);}catch{}} });
    const geoLayer=L.geoJSON(geometria,{style:{color:"#22c55e",weight:3,fillColor:"#22c55e",fillOpacity:0.2}}).addTo(map);
    const bounds=geoLayer.getBounds(),center=bounds.getCenter();
    adicionarMarcador(map,L,center.lat,center.lng,dados);
    map.fitBounds(bounds,{padding:[40,40]});
  };

  const handleBuscarSobreposicoes = async () => {
    if (!fazenda.coordenadas?.lat || buscandoSobr) return;
    setBuscandoSobr(true);
    // Limpa camadas de sobreposição anteriores
    sobrepLayerRef.current.forEach(l => { try { leafletMap.current?.removeLayer(l); } catch {} });
    sobrepLayerRef.current = [];
    const resultado = await buscarSobreposicoes(
      fazenda.coordenadas.lat, fazenda.coordenadas.lng,
      fazenda.car, leafletMap.current, window.L
    );
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
      kmlDoc.querySelectorAll("LineString coordinates").forEach(coordsEl=>{const latlngs=coordsEl.textContent.trim().split(/\s+/).map(c=>{const p=c.split(",");return p.length<2?null:[parseFloat(p[1]),parseFloat(p[0])];}).filter(Boolean);if(latlngs.length>0)layers.push(L.polyline(latlngs,{color:"#22c55e",weight:3}));});
      kmlDoc.querySelectorAll("Point coordinates").forEach(coordsEl=>{const parts=coordsEl.textContent.trim().split(",");if(parts.length>=2){const icon=L.divIcon({html:`<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,iconSize:[28,28],iconAnchor:[14,28],className:""});layers.push(L.marker([parseFloat(parts[1]),parseFloat(parts[0])],{icon}));}});
      if(layers.length===0){alert("⚠️ Nenhuma geometria encontrada no KML.");return;}
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
      if(tipoBusca==="gps"){const gps=val.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);if(!gps){setErroBusca("GPS inválido. Use: -11.8456, -55.1987");setBuscando(false);return;}body={lat:parseFloat(gps[1]),lng:parseFloat(gps[2])};}
      else if(tipoBusca==="ccir"){body={ccir:val};}else if(tipoBusca==="itr"){body={itr:val};}
      else if(tipoBusca==="proprietario"){body={proprietario:val};}else if(tipoBusca==="fazenda"){body={nomeFazenda:val};}
      else{body={car:val};}
      const resp=await fetch("/api/consulta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const dados=await resp.json();
      if(!dados.sucesso){setErroBusca(dados.error||"Erro na consulta.");setBuscando(false);return;}
      setDadosReais(dados);
      const fazendaConvertida=dadosParaFazenda(dados);
      if(fazendaConvertida)setFazenda(fazendaConvertida);
      if(leafletMap.current&&window.L){
        const geom=dados.sicar?.geometria||dados.sigef?.geometria;
        if(geom)desenharReal(leafletMap.current,window.L,geom,dados);
        else if(dados.coordenadas?.lat){leafletMap.current.setView([dados.coordenadas.lat,dados.coordenadas.lng],13);adicionarMarcador(leafletMap.current,window.L,dados.coordenadas.lat,dados.coordenadas.lng,dados);}
      }
    }catch{setErroBusca("Erro de conexão. Tente novamente.");}
    setBuscando(false);
  };

  const exportarKML = () => {
    const kml=`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><n>${fazenda.nome}</n><Placemark><n>${fazenda.nome}</n><Polygon><outerBoundaryIs><LinearRing><coordinates>${fazenda.coordenadas.lng-0.05},${fazenda.coordenadas.lat+0.05},0 ${fazenda.coordenadas.lng+0.05},${fazenda.coordenadas.lat+0.05},0 ${fazenda.coordenadas.lng+0.075},${fazenda.coordenadas.lat},0 ${fazenda.coordenadas.lng-0.05},${fazenda.coordenadas.lat+0.05},0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([kml],{type:"application/vnd.google-earth.kml+xml"}));a.download=`${fazenda.nome.replace(/ /g,"_")}.kml`;a.click();
  };

  const trocarMapa = (tipo) => {
    if(!leafletMap.current||!window.L)return;
    const map=leafletMap.current,L=window.L;
    Object.values(map._layers).forEach(l=>{if(l._url)map.removeLayer(l);});
    if(tipo==="satellite")L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19}).addTo(map);
    else if(tipo==="mapa")L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
    else if(tipo==="terreno")L.tileLayer("https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png",{maxZoom:18}).addTo(map);
    setTipoMapa(tipo);
  };

  const toggleCamada=(id)=>setCamadas(prev=>prev.map(c=>c.id===id?{...c,ativa:!c.ativa}:c));

  const score=dadosReais?.score,clima=dadosReais?.clima,nasa=dadosReais?.nasa,cotacoes=dadosReais?.cotacoes;
  const scoreValor=score?.valor??78,scoreCor=score?.cor??C.accent;
  const tipoAtual=TIPOS_BUSCA.find(t=>t.id===tipoBusca);
  const temDadosReais=!!dadosReais;

  return (
    <div className="mapa-container" style={{display:"flex",height:"calc(100vh - 64px)",overflow:"hidden"}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){
          .mapa-container{flex-direction:column!important;height:auto!important;min-height:calc(100vh - 128px);overflow-y:auto!important;}
          .mapa-painel-esq{width:100%!important;border-right:none!important;border-bottom:1px solid #1e3a1e!important;}
          .mapa-centro{width:100%!important;height:72vw!important;min-height:260px!important;max-height:400px!important;flex:none!important;}
          .mapa-painel-dir{display:none!important;}
          .mapa-toolbar-camadas{display:none!important;}
          .mapa-score{display:none!important;}
          .mapa-status{display:none!important;}
        }
      `}</style>

      {/* ── PAINEL ESQUERDO ── */}
      <div className="mapa-painel-esq" style={{width:290,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"}}>

        {/* Busca */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>🔍 Buscar Imóvel</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {TIPOS_BUSCA.map(t=>(<button key={t.id} onClick={()=>{setTipoBusca(t.id);setSearchVal("");}} style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${tipoBusca===t.id?C.accent:C.border}`,background:tipoBusca===t.id?`${C.accent}20`:"transparent",color:tipoBusca===t.id?C.accent:C.textMuted,fontSize:10,fontWeight:tipoBusca===t.id?700:400,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><span>{t.icon}</span>{t.label}</button>))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:12,outline:"none"}} placeholder={tipoAtual?.placeholder||""} value={searchVal} onChange={e=>setSearchVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscarImovel()}/>
            <button onClick={buscarImovel} disabled={buscando} style={{background:buscando?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`,border:"none",borderRadius:8,color:C.text,width:36,cursor:buscando?"default":"pointer",fontSize:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {buscando?<div style={{width:14,height:14,border:`2px solid ${C.text}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>:"🔍"}
            </button>
          </div>
          {erroBusca&&<div style={{marginTop:8,fontSize:11,color:C.red,background:`${C.red}15`,borderRadius:6,padding:"6px 10px"}}>⚠️ {erroBusca}</div>}
          {temDadosReais&&<div style={{marginTop:8,fontSize:11,color:C.accent,background:`${C.accent}15`,borderRadius:6,padding:"6px 10px"}}>✅ Dados reais carregados</div>}
        </div>

        {/* Dados do imóvel — CAMPOS CLICÁVEIS */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700}}>📋 Dados do Imóvel</div>
            {chip(temDadosReais?"✓ Dados Reais":"Demo",temDadosReais?C.accent:C.textMuted)}
          </div>
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
            <div style={{cursor:"pointer"}} onClick={()=>setCampoPainel("ibama")}>
              {chip(fazenda.embargo?"⛔ Embargo IBAMA":"✅ Sem Embargo",fazenda.embargo?C.red:C.accent)}
            </div>
            <div style={{cursor:"pointer"}} onClick={()=>setCampoPainel("prodes")}>
              {chip(fazenda.prodes?"🔴 Alerta PRODES":"📡 Sem PRODES",fazenda.prodes?C.orange:C.accent)}
            </div>
          </div>
        </div>

        {/* Sobreposições */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>🗺️ Sobreposições</div>
          <button
            onClick={handleBuscarSobreposicoes}
            disabled={buscandoSobr}
            style={{width:"100%",padding:"8px 0",borderRadius:8,background:buscandoSobr?C.border:`linear-gradient(135deg,${C.purple},#7c3aed)`,border:"none",color:C.text,fontWeight:600,fontSize:12,cursor:buscandoSobr?"default":"pointer",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
          >
            {buscandoSobr?<><div style={{width:12,height:12,border:`2px solid ${C.text}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>Buscando...</>:"🔍 Verificar Sobreposições"}
          </button>
          {sobreposicoes && (
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {[
                ["🏕️ Terras Indígenas",sobreposicoes.ti?.length||0,C.purple],
                ["🌳 Unid. Conservação",sobreposicoes.uc?.length||0,C.accent],
                ["🌾 CAR Vizinhos",sobreposicoes.vizinhos?.length||0,C.orange],
              ].map(([label,qtd,cor])=>(
                <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",borderRadius:6,background:`${cor}10`,border:`1px solid ${cor}20`,fontSize:11}}>
                  <span style={{color:C.textMuted}}>{label}</span>
                  <span style={{fontWeight:700,color:qtd>0?cor:C.accent}}>{qtd>0?`${qtd} encontrado(s)`:"✅ Nenhum"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coordenadas */}
        <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>📍 Coordenadas</div>
          <InfoRowClicavel label="Latitude"  value={`${fazenda.coordenadas.lat}°`} campo="car" onClicar={()=>{}}/>
          <InfoRowClicavel label="Longitude" value={`${fazenda.coordenadas.lng}°`} campo="car" onClicar={()=>{}}/>
          <button onClick={()=>leafletMap.current?.setView([fazenda.coordenadas.lat,fazenda.coordenadas.lng],13)} style={{marginTop:8,width:"100%",padding:"7px 0",borderRadius:8,background:`${C.green1}60`,border:`1px solid ${C.borderLight}`,color:C.accentBright,fontSize:11,fontWeight:600,cursor:"pointer"}}>
            🎯 Centralizar no Mapa
          </button>
        </div>

        {/* Cards dados reais */}
        {clima    && <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}><CardClima clima={clima}/></div>}
        {nasa     && <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}><CardNASA nasa={nasa}/></div>}
        {dadosReais?.cotacoes && <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}><CardCotacoes cotacoes={dadosReais.cotacoes}/></div>}

        {/* Ações */}
        <div style={{padding:14}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>⚡ Ações</div>
          <input type="file" accept=".kml,.kmz" ref={fileRef} style={{display:"none"}} onChange={importarKML}/>
          <button onClick={()=>fileRef.current?.click()} style={{display:"block",width:"100%",marginBottom:7,padding:"8px 12px",borderRadius:8,textAlign:"left",background:`${C.blue}15`,border:`1px solid ${C.blue}40`,color:C.blue,fontWeight:600,fontSize:11.5,cursor:"pointer"}}>📥 Importar KML</button>
          <button onClick={exportarKML} style={{display:"block",width:"100%",marginBottom:7,padding:"8px 12px",borderRadius:8,textAlign:"left",background:`${C.accent}15`,border:`1px solid ${C.accent}40`,color:C.accent,fontWeight:600,fontSize:11.5,cursor:"pointer"}}>📤 Exportar KML</button>
          <button onClick={()=>gerarLaudoPDF(fazenda,dadosReais,setGerandoPDF)} disabled={gerandoPDF} style={{display:"flex",alignItems:"center",gap:8,width:"100%",marginBottom:7,padding:"8px 12px",borderRadius:8,background:gerandoPDF?`${C.textDim}15`:`${C.yellow}15`,border:`1px solid ${gerandoPDF?C.textDim+"40":C.yellow+"40"}`,color:gerandoPDF?C.textDim:C.yellow,fontWeight:600,fontSize:11.5,cursor:gerandoPDF?"default":"pointer"}}>
            {gerandoPDF?<><div style={{width:12,height:12,border:`2px solid ${C.textDim}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>Gerando...</>:"📄 Gerar Laudo PDF"}
          </button>
          <button onClick={()=>alert("Em breve!")} style={{display:"block",width:"100%",padding:"8px 12px",borderRadius:8,textAlign:"left",background:`${C.accentBright}15`,border:`1px solid ${C.accentBright}40`,color:C.accentBright,fontWeight:600,fontSize:11.5,cursor:"pointer"}}>💬 Enviar WhatsApp</button>
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
            <div className="mapa-toolbar-camadas" style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {camadas.slice(0,6).map(c=>(
                <button key={c.id} onClick={()=>toggleCamada(c.id)} style={{padding:"4px 9px",borderRadius:20,border:`1px solid ${c.ativa?c.color+"60":C.border}`,background:c.ativa?`${c.color}20`:"transparent",color:c.ativa?c.color:C.textDim,fontSize:11,cursor:"pointer"}}>{c.icon} {c.label}</button>
              ))}
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              <button onClick={()=>fileRef.current?.click()} style={{padding:"5px 10px",borderRadius:8,background:C.card,border:`1px solid ${C.border}`,color:C.accentBright,fontSize:11,fontWeight:600,cursor:"pointer"}}>📥 KML</button>
              <button onClick={exportarKML} style={{padding:"5px 10px",borderRadius:8,background:`linear-gradient(135deg,${C.green2},${C.green3})`,border:"none",color:C.text,fontSize:11,fontWeight:600,cursor:"pointer"}}>📤 Exportar</button>
            </div>
          </div>

          {/* Leaflet map */}
          <div ref={mapRef} style={{flex:1,background:`linear-gradient(135deg,${C.bg},#0d2010)`}}/>

          {/* Legenda */}
          <div style={{position:"absolute",bottom:40,left:16,background:`${C.surface}ee`,backdropFilter:"blur(12px)",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",zIndex:1000}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>Legenda</div>
            {camadas.filter(c=>c.ativa).map(c=>(<div key={c.id} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,fontSize:11}}><div style={{width:16,height:4,borderRadius:2,background:c.color,flexShrink:0}}/><span style={{color:C.textMuted}}>{c.label}</span></div>))}
            {kmlNome&&<div style={{marginTop:6,fontSize:10,color:C.blue}}>📥 {kmlNome}</div>}
          </div>

          {/* Score */}
          <div className="mapa-score" style={{position:"absolute",top:70,right:16,background:`${C.surface}ee`,backdropFilter:"blur(12px)",border:`1px solid ${scoreCor}40`,borderRadius:12,padding:"12px 14px",zIndex:1000,textAlign:"center",minWidth:110}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>🤖 Score IA</div>
            <div style={{fontSize:30,fontWeight:900,color:scoreCor,lineHeight:1}}>{scoreValor}</div>
            <div style={{fontSize:10,color:C.textMuted}}>/100</div>
            <div style={{fontSize:10,color:scoreCor,marginTop:4,fontWeight:600}}>{score?.nivel??"Baixo Risco"}</div>
          </div>

          {/* Status */}
          <div className="mapa-status" style={{position:"absolute",top:70,left:16,background:`${C.surface}ee`,backdropFilter:"blur(12px)",border:`1px solid ${C.accent}40`,borderRadius:10,padding:"10px 12px",zIndex:1000}}>
            <div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:4}}>{temDadosReais?"📡 Dados Reais":"✅ Status Ambiental"}</div>
            <div style={{fontSize:11,color:fazenda.embargo?C.red:C.textMuted,cursor:"pointer"}} onClick={()=>setCampoPainel("ibama")}>{fazenda.embargo?"⛔ Embargo IBAMA ativo":"✅ Sem embargo IBAMA"}</div>
            <div style={{fontSize:11,color:fazenda.prodes?C.orange:C.textMuted,cursor:"pointer"}} onClick={()=>setCampoPainel("prodes")}>{fazenda.prodes?"🔴 Alerta PRODES ativo":"📡 Sem alerta PRODES"}</div>
            {dadosReais?.sigef?.certificado&&<div style={{fontSize:11,color:C.accent,cursor:"pointer"}} onClick={()=>setCampoPainel("sigef")}>🗂️ SIGEF Certificado ✅</div>}
          </div>

          {/* Loading busca */}
          {buscando&&(<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,backdropFilter:"blur(4px)"}}><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"24px 32px",textAlign:"center"}}><div style={{fontSize:36,marginBottom:10}}>🔍</div><div style={{fontSize:14,fontWeight:700,color:C.accentBright,marginBottom:4}}>Consultando APIs...</div><div style={{fontSize:12,color:C.textMuted}}>SICAR · IBAMA · PRODES · SIGEF · Clima · NASA</div></div></div>)}

          {/* Loading PDF */}
          {gerandoPDF&&(<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,backdropFilter:"blur(4px)"}}><div style={{background:C.card,border:`1px solid ${C.yellow}40`,borderRadius:16,padding:"28px 36px",textAlign:"center"}}><div style={{fontSize:36,marginBottom:10}}>📄</div><div style={{fontSize:14,fontWeight:700,color:C.yellow,marginBottom:4}}>Gerando Laudo PDF...</div><div style={{fontSize:12,color:C.textMuted}}>Aguarde, montando o documento</div></div></div>)}

          {/* ✅ DRAWER DE DETALHE DO CAMPO */}
          <PainelDetalhe campo={campoPainel} fazenda={fazenda} dadosReais={dadosReais} onFechar={()=>setCampoPainel(null)}/>
        </div>
      </div>

      {/* ── PAINEL DIREITO ── */}
      <div className="mapa-painel-dir" style={{width:230,background:C.surface,borderLeft:`1px solid ${C.border}`,padding:"16px 14px",flexShrink:0,overflowY:"auto"}}>
        {score&&<CardScore score={score}/>}
        <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>🗂️ Camadas</div>
        {camadas.map(c=>(<div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:10,height:10,borderRadius:2,background:c.color,flexShrink:0}}/><span style={{fontSize:12,color:c.ativa?C.text:C.textDim}}>{c.icon} {c.label}</span></div><div onClick={()=>toggleCamada(c.id)} style={{width:34,height:18,borderRadius:9,background:c.ativa?C.green3:C.border,position:"relative",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:c.ativa?18:2,width:14,height:14,borderRadius:"50%",background:"white",transition:"left 0.2s"}}/></div></div>))}
        <div style={{marginTop:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📊 Estatísticas</div>
          {[["Área Total",fazenda.area,C.accent],["APP",fazenda.app,C.blue],["Reserva Legal",fazenda.rl,C.accentBright]].map(([l,v,c])=>(<div key={l} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:700,color:c}}>{v||"—"}</span></div><div style={{height:4,background:C.bg,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:l==="Área Total"?"100%":l==="APP"?"14%":"31%",background:`linear-gradient(90deg,${c}80,${c})`,borderRadius:2}}/></div></div>))}
        </div>
        <div style={{marginTop:8}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>🔗 Links Úteis</div>
          {[["🌿 SICAR","https://www.car.gov.br"],["⛔ IBAMA","https://ibama.gov.br"],["📡 INPE","http://terrabrasilis.dpi.inpe.br"],["🗂️ SIGEF","https://sigef.incra.gov.br"],["📋 INCRA","https://www.gov.br/incra"],["🏕️ FUNAI","https://www.gov.br/funai"],["🌳 ICMBio","https://www.gov.br/icmbio"]].map(([l,url])=>(
            <a key={l} href={url} target="_blank" rel="noreferrer" style={{display:"block",fontSize:11,color:C.textMuted,padding:"5px 0",borderBottom:`1px solid ${C.border}`,textDecoration:"none"}} onMouseOver={e=>e.target.style.color=C.accentBright} onMouseOut={e=>e.target.style.color=C.textMuted}>{l} ↗</a>
          ))}
        </div>
      </div>
    </div>
  );
}