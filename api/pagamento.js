export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { plano, userId, userEmail } = req.body;

    const planos = {
      starter_mensal: { titulo: "AgroMind Starter Mensal", valor: 49.00, creditos: 20 },
      pro_mensal:     { titulo: "AgroMind Pro Mensal",     valor: 99.00, creditos: 100 },
      starter_anual:  { titulo: "AgroMind Starter Anual",  valor: 39.00, creditos: 20 },
      pro_anual:      { titulo: "AgroMind Pro Anual",      valor: 79.00, creditos: 100 },
    };

    const planoSelecionado = planos[plano];
    if (!planoSelecionado) return res.status(400).json({ error: "Plano inválido" });

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: [{
          title: planoSelecionado.titulo,
          quantity: 1,
          unit_price: planoSelecionado.valor,
          currency_id: "BRL",
        }],
        payer: { email: userEmail || "cliente@agromind.com.br" },
        back_urls: {
          success: "https://agromind-fawn.vercel.app/?pagamento=sucesso",
          failure: "https://agromind-fawn.vercel.app/?pagamento=erro",
          pending: "https://agromind-fawn.vercel.app/?pagamento=pendente",
        },
        auto_return: "approved",
        external_reference: `${userId}_${plano}_${Date.now()}`,
        notification_url: "https://agromind-fawn.vercel.app/api/webhook",
        metadata: { userId, plano, creditos: planoSelecionado.creditos },
      }),
    });

    const data = await response.json();
    if (data.id) {
      res.status(200).json({
        preferenceId: data.id,
        initPoint: data.init_point,
        sandboxInitPoint: data.sandbox_init_point,
      });
    } else {
      res.status(500).json({ error: "Erro ao criar preferência", details: data });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
