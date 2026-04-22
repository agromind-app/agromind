// src/components/SemCreditosModal.js
import { useState } from "react";
import { adicionarCreditosExtras } from "../services/creditsService";

const C = {
  bg:"#0a0f0a", card:"#111d11", border:"#1e3a1e", borderLight:"#2a4f2a",
  green2:"#12803f", green3:"#16a34a", accent:"#22c55e", accentBright:"#4ade80",
  text:"#e8f5e9", textMuted:"#6b9e6b", yellow:"#fbbf24", red:"#ef4444",
};

export default function SemCreditosModal({ user, plano, onClose, onUpgrade }) {
  const [comprando, setComprando] = useState(false);
  const [qtd, setQtd] = useState(10);
  const isAnual = plano?.includes("anual");
  const precoUnit = isAnual ? 1.50 : 2.00;
  const total = (qtd * precoUnit).toFixed(2);

  const comprarExtras = async () => {
    setComprando(true);
    await adicionarCreditosExtras(user.uid, qtd, plano);
    setComprando(false);
    onClose();
    alert(`✅ ${qtd} créditos adicionados!`);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"32px 28px",maxWidth:420,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:48,marginBottom:12}}>⚡</div>
          <div style={{fontSize:22,fontWeight:800,color:C.text,marginBottom:8}}>Seus créditos acabaram!</div>
          <div style={{fontSize:14,color:C.textMuted}}>Escolha uma opção para continuar.</div>
        </div>
        <div style={{background:`${C.green2}15`,border:`1px solid ${C.green2}40`,borderRadius:14,padding:"18px 20px",marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:700,color:C.accentBright,marginBottom:12}}>⚡ Comprar créditos extras</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <button onClick={()=>setQtd(q=>Math.max(5,q-5))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,color:C.text,cursor:"pointer",fontSize:16}}>−</button>
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:900,color:C.accent}}>{qtd}</div>
              <div style={{fontSize:11,color:C.textMuted}}>créditos</div>
            </div>
            <button onClick={()=>setQtd(q=>q+5)} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,color:C.text,cursor:"pointer",fontSize:16}}>+</button>
          </div>
          <div style={{fontSize:12,color:C.textMuted,marginBottom:12,textAlign:"center"}}>
            R$ {precoUnit.toFixed(2)} por crédito · Total: <strong style={{color:C.accentBright}}>R$ {total}</strong>
          </div>
          <button onClick={comprarExtras} disabled={comprando} style={{width:"100%",padding:"11px 0",borderRadius:10,border:"none",background:`linear-gradient(135deg,${C.green2},${C.green3})`,color:C.text,fontWeight:700,fontSize:14,cursor:"pointer"}}>
            {comprando?"⏳ Processando...":"💳 Comprar agora"}
          </button>
        </div>
        <div style={{background:`${C.yellow}10`,border:`1px solid ${C.yellow}40`,borderRadius:14,padding:"16px 20px",marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:700,color:C.yellow,marginBottom:6}}>🚀 Fazer upgrade de plano</div>
          <button onClick={onUpgrade} style={{width:"100%",padding:"10px 0",borderRadius:10,border:`1px solid ${C.yellow}60`,background:`${C.yellow}15`,color:C.yellow,fontWeight:700,fontSize:13,cursor:"pointer"}}>Ver planos →</button>
        </div>
        <button onClick={onClose} style={{width:"100%",padding:"10px 0",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:13,cursor:"pointer"}}>Cancelar</button>
      </div>
    </div>
  );
}