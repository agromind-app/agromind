// src/IAPage.js
// IA real AgroMind usando Anthropic API
// Substitui o PlaceholderPage da rota "ia"

import { useState, useRef, useEffect } from "react";

const C = {
  bg:"#0a0f0a", surface:"#0f1a0f", card:"#111d11",
  border:"#1e3a1e", borderLight:"#2a4f2a",
  green1:"#0d5c2e", green2:"#12803f", green3:"#16a34a",
  accent:"#22c55e", accentBright:"#4ade80",
  text:"#e8f5e9", textMuted:"#6b9e6b", textDim:"#3d6b3d",
  yellow:"#fbbf24", red:"#ef4444", orange:"#f97316", blue:"#3b82f6",
};

// Dados simulados da fazenda (futuramente vem do SICAR/Firebase)
const FAZENDA_CONTEXTO = {
  nome: "Fazenda Horizonte Verde",
  car: "MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C",
  municipio: "Sinop, MT",
  area: "1.284,7 ha",
  proprietario: "Agropecuária Horizonte Ltda.",
  modulos: "42,8 módulos fiscais",
  app: "183,4 ha (14,3%)",
  rl: "399,8 ha (31,1%)",
  areaProductiva: "701,5 ha (54,6%)",
  sigef: "Certificado",
  embargo: false,
  prodes: false,
  itr: "R$ 2.847,00/ano",
  ccir: "800.429.7412-9",
  coordenadas: "-11.8456, -55.1987",
};

// Perguntas rápidas sugeridas
const PERGUNTAS_RAPIDAS = [
  "Qual o score de risco desta fazenda?",
  "Tem algum embargo ativo?",
  "A Reserva Legal está regular?",
  "Pode financiar esta propriedade?",
  "Qual a situação ambiental geral?",
  "Calcule o ITR estimado",
];

function calcularScore(fazenda) {
  let score = 100;
  if (fazenda.embargo) score -= 40;
  if (fazenda.prodes) score -= 30;
  const rlPct = parseFloat(fazenda.rl);
  if (rlPct < 20) score -= 20;
  else if (rlPct < 30) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function ScoreGauge({ score }) {
  const cor = score >= 70 ? C.accent : score >= 40 ? C.yellow : C.red;
  const label = score >= 70 ? "Baixo Risco" : score >= 40 ? "Risco Médio" : "Alto Risco";
  const graus = (score / 100) * 360;

  return (
    <div style={{ textAlign: "center", padding: "16px 0" }}>
      <div style={{
        width: 100, height: 100, borderRadius: "50%",
        background: `conic-gradient(${cor} 0deg, ${cor} ${graus}deg, ${C.border} ${graus}deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 10px"
      }}>
        <div style={{
          width: 76, height: 76, borderRadius: "50%",
          background: C.card, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center"
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: cor, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, color: C.textMuted }}>/100</div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: cor }}>{label}</div>
    </div>
  );
}

function MensagemIA({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", gap: 10, marginBottom: 16,
      flexDirection: isUser ? "row-reverse" : "row",
      alignItems: "flex-start"
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: isUser
          ? `linear-gradient(135deg,${C.green2},${C.accent})`
          : `linear-gradient(135deg,${C.blue},#6366f1)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14
      }}>
        {isUser ? "👤" : "🤖"}
      </div>
      <div style={{
        maxWidth: "80%", padding: "12px 16px", borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        background: isUser ? `linear-gradient(135deg,${C.green2},${C.green3})` : C.card,
        border: isUser ? "none" : `1px solid ${C.border}`,
        color: C.text, fontSize: 13, lineHeight: 1.6,
        whiteSpace: "pre-wrap"
      }}>
        {msg.content}
        {msg.loading && (
          <span style={{ display: "inline-flex", gap: 3, marginLeft: 6 }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: "50%",
                background: C.accent,
                animation: `pulse 1s ease-in-out ${i*0.2}s infinite`,
                display: "inline-block"
              }}/>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export default function IAPage({ usarCredito, creditos, onSemCreditos }) {
  const [msgs, setMsgs] = useState([
    {
      role: "assistant",
      content: `🌿 Olá! Sou a IA do AgroMind.\n\nEstou analisando a **${FAZENDA_CONTEXTO.nome}** (${FAZENDA_CONTEXTO.municipio}).\n\nPosso responder perguntas sobre situação ambiental, score de risco, regularidade fundiária, potencial de financiamento e muito mais.\n\nO que você quer saber?`
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fazenda] = useState(FAZENDA_CONTEXTO);
  const [score] = useState(calcularScore(FAZENDA_CONTEXTO));
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const enviar = async (texto) => {
    const pergunta = texto || input.trim();
    if (!pergunta || loading) return;
    setInput("");

    // Verifica créditos
    if (creditos <= 0) {
      onSemCreditos?.();
      return;
    }

    // Desconta crédito
    const resultado = await usarCredito?.(`IA: ${pergunta.substring(0, 50)}`);
    if (resultado?.motivo === "sem_creditos") {
      onSemCreditos?.();
      return;
    }

    // Adiciona mensagem do usuário
    setMsgs(prev => [...prev, { role: "user", content: pergunta }]);
    setLoading(true);

    // Adiciona loading da IA
    setMsgs(prev => [...prev, { role: "assistant", content: "", loading: true }]);

    try {
      const systemPrompt = `Você é a IA especialista em imóveis rurais do AgroMind, plataforma brasileira de análise fundiária.

FAZENDA ATUAL:
- Nome: ${fazenda.nome}
- CAR: ${fazenda.car}
- Município: ${fazenda.municipio}
- Área Total: ${fazenda.area}
- Proprietário: ${fazenda.proprietario}
- Módulos Fiscais: ${fazenda.modulos}
- APP: ${fazenda.app}
- Reserva Legal: ${fazenda.rl}
- Área Produtiva: ${fazenda.areaProductiva}
- SIGEF: ${fazenda.sigef}
- Embargo IBAMA: ${fazenda.embargo ? "SIM - ATIVO" : "Não"}
- Alerta PRODES: ${fazenda.prodes ? "SIM - ATIVO" : "Não"}
- ITR: ${fazenda.itr}
- CCIR: ${fazenda.ccir}
- Score de Risco: ${score}/100

INSTRUÇÕES:
- Responda em português brasileiro de forma clara e objetiva
- Use dados reais da fazenda acima
- Seja direto e técnico mas acessível
- Use emojis para facilitar leitura
- Máximo 200 palavras por resposta
- Se perguntarem score, explique os fatores
- Recomende ações quando relevante`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            ...msgs.filter(m => !m.loading).map(m => ({
              role: m.role,
              content: m.content
            })),
            { role: "user", content: pergunta }
          ]
        })
      });

      const data = await response.json();
      const resposta = data.content?.[0]?.text || "Erro ao processar resposta.";

      setMsgs(prev => [
        ...prev.filter(m => !m.loading),
        { role: "assistant", content: resposta }
      ]);
    } catch (err) {
      setMsgs(prev => [
        ...prev.filter(m => !m.loading),
        { role: "assistant", content: "❌ Erro de conexão. Tente novamente." }
      ]);
    }

    setLoading(false);
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden", gap: 0 }}>

      {/* Painel esquerdo — info da fazenda */}
      <div style={{
        width: 260, flexShrink: 0,
        background: C.surface, borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", overflowY: "auto"
      }} className="ia-painel-esq">

        <div style={{ padding: "16px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            🌾 Fazenda Analisada
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.accentBright, marginBottom: 4 }}>{fazenda.nome}</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>📍 {fazenda.municipio}</div>
        </div>

        {/* Score */}
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            🤖 Score IA
          </div>
          <ScoreGauge score={score} />
        </div>

        {/* Dados rápidos */}
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            📋 Dados
          </div>
          {[
            ["🌾 Área", fazenda.area],
            ["💧 APP", fazenda.app],
            ["🌱 Res. Legal", fazenda.rl],
            ["🗂️ SIGEF", fazenda.sigef],
            ["⛔ Embargo", fazenda.embargo ? "🔴 Ativo" : "✅ Nenhum"],
            ["📡 PRODES", fazenda.prodes ? "🔴 Alerta" : "✅ Normal"],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
              <span style={{ color: C.textMuted }}>{l}</span>
              <span style={{ fontWeight: 600, color: C.text }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Créditos restantes */}
        <div style={{ padding: "12px 14px" }}>
          <div style={{
            background: `${C.green1}40`, border: `1px solid ${C.borderLight}`,
            borderRadius: 10, padding: "10px 12px",
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>⚡ Créditos</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: creditos > 3 ? C.accent : C.red }}>{creditos}</span>
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 6, textAlign: "center" }}>
            1 crédito por pergunta
          </div>
        </div>
      </div>

      {/* Chat principal */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header do chat */}
        <div style={{
          padding: "12px 20px", borderBottom: `1px solid ${C.border}`,
          background: C.surface, display: "flex", alignItems: "center", gap: 10, flexShrink: 0
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `linear-gradient(135deg,${C.blue},#6366f1)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
          }}>🤖</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>IA AgroMind</div>
            <div style={{ fontSize: 11, color: C.accent }}>● Online · Especialista em imóveis rurais</div>
          </div>
        </div>

        {/* Mensagens */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
          <style>{`
            @keyframes pulse {
              0%,100%{opacity:0.3;transform:scale(0.8)}
              50%{opacity:1;transform:scale(1)}
            }
            .ia-painel-esq{display:flex!important;}
            @media(max-width:768px){
              .ia-painel-esq{display:none!important;}
            }
          `}</style>
          {msgs.map((m, i) => <MensagemIA key={i} msg={m} />)}
          <div ref={bottomRef} />
        </div>

        {/* Perguntas rápidas */}
        <div style={{
          padding: "8px 16px", borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 6, overflowX: "auto", flexShrink: 0,
          background: C.surface
        }}>
          {PERGUNTAS_RAPIDAS.map((p, i) => (
            <button key={i} onClick={() => enviar(p)}
              style={{
                flexShrink: 0, padding: "5px 12px", borderRadius: 20,
                border: `1px solid ${C.borderLight}`, background: `${C.green1}40`,
                color: C.textMuted, fontSize: 11, cursor: "pointer",
                whiteSpace: "nowrap", transition: "all 0.15s"
              }}
              onMouseOver={e => { e.target.style.color = C.accentBright; e.target.style.borderColor = C.accent; }}
              onMouseOut={e => { e.target.style.color = C.textMuted; e.target.style.borderColor = C.borderLight; }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{
          padding: "12px 16px", borderTop: `1px solid ${C.border}`,
          background: C.surface, display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Pergunte sobre a fazenda... (Enter para enviar)"
            rows={1}
            style={{
              flex: 1, background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "10px 14px", color: C.text,
              fontSize: 13, outline: "none", resize: "none",
              fontFamily: "inherit", lineHeight: 1.5,
              maxHeight: 100, overflowY: "auto"
            }}
          />
          <button
            onClick={() => enviar()}
            disabled={loading || !input.trim()}
            style={{
              width: 42, height: 42, borderRadius: 12, border: "none",
              background: loading || !input.trim()
                ? C.border
                : `linear-gradient(135deg,${C.green2},${C.green3})`,
              color: C.text, cursor: loading || !input.trim() ? "default" : "pointer",
              fontSize: 18, display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0, transition: "all 0.15s"
            }}
          >
            {loading ? "⏳" : "➤"}
          </button>
        </div>
      </div>
    </div>
  );
}