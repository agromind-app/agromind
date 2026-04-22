// ============================================================
// src/services/creditsService.js
// Sistema de créditos AgroMind — Firebase Firestore
// ============================================================
import { db } from "../firebase";
import {
  doc, getDoc, setDoc, updateDoc,
  increment, serverTimestamp, collection, addDoc
} from "firebase/firestore";

// ── Planos e créditos ────────────────────────────────────────
export const PLANOS = {
  starter_mensal:  { nome: "Starter Mensal",  creditos: 20,  preco: 49,  periodo: "mensal" },
  pro_mensal:      { nome: "Pro Mensal",       creditos: 100, preco: 99,  periodo: "mensal" },
  starter_anual:   { nome: "Starter Anual",    creditos: 20,  preco: 39,  periodo: "anual"  },
  pro_anual:       { nome: "Pro Anual",        creditos: 100, preco: 79,  periodo: "anual"  },
};

export const PRECO_EXTRA_MENSAL = 2.00;
export const PRECO_EXTRA_ANUAL  = 1.50;

// ── Buscar dados do usuário no Firestore ─────────────────────
export async function getUserData(uid) {
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  return null;
}

// ── Criar usuário novo com créditos de teste ─────────────────
export async function criarUsuario(uid, email, nome) {
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data(); // já existe

  const dados = {
    uid,
    email,
    nome,
    plano: "gratuito",
    creditos: 3, // 3 consultas grátis para testar
    creditosUsados: 0,
    totalConsultas: 0,
    criadoEm: serverTimestamp(),
    planoAtivadoEm: null,
    planoExpiraEm: null,
  };

  await setDoc(ref, dados);
  return dados;
}

// ── Verificar se tem créditos ────────────────────────────────
export async function verificarCreditos(uid) {
  const dados = await getUserData(uid);
  if (!dados) return { temCredito: false, creditos: 0 };
  return {
    temCredito: dados.creditos > 0,
    creditos: dados.creditos,
    plano: dados.plano,
  };
}

// ── Descontar 1 crédito ao consultar ────────────────────────
export async function descontarCredito(uid, descricaoConsulta = "Consulta de imóvel") {
  const ref = doc(db, "usuarios", uid);
  const dados = await getUserData(uid);

  if (!dados || dados.creditos <= 0) {
    return { sucesso: false, motivo: "sem_creditos", creditos: 0 };
  }

  // Desconta 1 crédito
  await updateDoc(ref, {
    creditos: increment(-1),
    creditosUsados: increment(1),
    totalConsultas: increment(1),
    ultimaConsulta: serverTimestamp(),
  });

  // Registra no histórico
  await addDoc(collection(db, "usuarios", uid, "consultas"), {
    descricao: descricaoConsulta,
    creditosAntes: dados.creditos,
    creditosDepois: dados.creditos - 1,
    criadoEm: serverTimestamp(),
  });

  return {
    sucesso: true,
    creditos: dados.creditos - 1,
    creditosUsados: (dados.creditosUsados || 0) + 1,
  };
}

// ── Ativar plano (chamado após pagamento aprovado) ───────────
export async function ativarPlano(uid, planoId) {
  const plano = PLANOS[planoId];
  if (!plano) return { sucesso: false, motivo: "plano_invalido" };

  const ref = doc(db, "usuarios", uid);
  const agora = new Date();
  const expira = new Date(agora);

  if (plano.periodo === "mensal") {
    expira.setMonth(expira.getMonth() + 1);
  } else {
    expira.setFullYear(expira.getFullYear() + 1);
  }

  await updateDoc(ref, {
    plano: planoId,
    creditos: increment(plano.creditos),
    planoAtivadoEm: serverTimestamp(),
    planoExpiraEm: expira,
  });

  // Registra no histórico de pagamentos
  await addDoc(collection(db, "usuarios", uid, "pagamentos"), {
    plano: planoId,
    creditos: plano.creditos,
    valor: plano.preco,
    criadoEm: serverTimestamp(),
    status: "aprovado",
  });

  return { sucesso: true, creditos: plano.creditos, plano: planoId };
}

// ── Adicionar créditos extras ────────────────────────────────
export async function adicionarCreditosExtras(uid, quantidade, planoAtual) {
  const ref = doc(db, "usuarios", uid);
  const precoUnitario = planoAtual?.includes("anual")
    ? PRECO_EXTRA_ANUAL
    : PRECO_EXTRA_MENSAL;

  await updateDoc(ref, {
    creditos: increment(quantidade),
  });

  await addDoc(collection(db, "usuarios", uid, "pagamentos"), {
    tipo: "creditos_extras",
    quantidade,
    valorUnitario: precoUnitario,
    valorTotal: quantidade * precoUnitario,
    criadoEm: serverTimestamp(),
    status: "aprovado",
  });

  return { sucesso: true, creditosAdicionados: quantidade };
}