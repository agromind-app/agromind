// src/hooks/useCredits.js
import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { criarUsuario, descontarCredito } from "../services/creditsService";

export function useCredits(user) {
  const [creditos, setCreditos] = useState(0);
  const [plano, setPlano] = useState("gratuito");
  const [loading, setLoading] = useState(true);
  const [semCreditos, setSemCreditos] = useState(false);

  useEffect(() => {
    if (!user) return;
    criarUsuario(user.uid, user.email, user.displayName || "Usuário");
    const ref = doc(db, "usuarios", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const dados = snap.data();
        setCreditos(dados.creditos || 0);
        setPlano(dados.plano || "gratuito");
        setSemCreditos((dados.creditos || 0) <= 0);
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const usarCredito = useCallback(async (descricao = "Consulta de imóvel") => {
    if (!user) return { sucesso: false, motivo: "nao_logado" };
    if (creditos <= 0) { setSemCreditos(true); return { sucesso: false, motivo: "sem_creditos" }; }
    return await descontarCredito(user.uid, descricao);
  }, [user, creditos]);

  const corCreditos = creditos > 10 ? "#22c55e" : creditos > 3 ? "#fbbf24" : "#ef4444";

  return { creditos, plano, loading, semCreditos, corCreditos, usarCredito };
}