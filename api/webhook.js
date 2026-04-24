import * as admin from "firebase-admin";

// Inicializa Firebase Admin apenas uma vez
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "agromind-2df80",
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(200).end();

  try {
    const { type, data } = req.body;
    console.log("Webhook recebido:", type, data);

    if (type === "payment" && data?.id) {
      const paymentId = data.id;

      // Busca detalhes do pagamento no MP
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      });
      const payment = await mpRes.json();
      console.log("Pagamento:", payment.status, payment.metadata);

      if (payment.status === "approved") {
        const { userId, plano, creditos } = payment.metadata || {};

        if (userId && creditos) {
          const db = admin.firestore();
          const ref = db.collection("usuarios").doc(String(userId));

          // Adiciona créditos e atualiza plano
          await ref.update({
            creditos: admin.firestore.FieldValue.increment(Number(creditos)),
            plano: plano || "pro_mensal",
            ultimoPagamento: admin.firestore.FieldValue.serverTimestamp(),
            status: "ativo",
          });

          // Registra o pagamento
          await ref.collection("pagamentos").add({
            paymentId: String(paymentId),
            plano: plano || "desconhecido",
            creditos: Number(creditos),
            valor: payment.transaction_amount,
            status: "aprovado",
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`✅ Créditos liberados para ${userId}: +${creditos}`);
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook erro:", error.message);
    return res.status(200).json({ ok: true }); // Sempre 200 pro MP não retentar
  }
}