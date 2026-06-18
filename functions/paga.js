// 1. Questa funzione riceve i dati del carrello (metodo POST)
export async function onRequestPost(context) {
  const { env, request } = context;

  // Intestazioni per evitare blocchi del browser
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const body = await request.json();
    const cartItems = body.items || [];
    
    // Usa il totale già calcolato dal client (include sconto e spese di consegna)
    let totalAmount = Math.round((parseFloat(body.totalAmount) || 0) * 100) / 100;

    // Invia la richiesta a SumUp
    const response = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SUMUP_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        checkout_reference: `PB-${Date.now()}`,
        amount: totalAmount,
        currency: "EUR",
        pay_to_email: env.SUMUP_EMAIL,
        description: "Ordine N'farinati Modern Pizza"
      })
    });

    const data = await response.json();

    // Restituisce l'ID di SumUp al tuo menu.html
return new Response(JSON.stringify({ checkoutId: data.id }), {
	  status: response.status, 
      headers: corsHeaders 
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// 2. Questa funzione risponde alle verifiche di sicurezza del browser (metodo OPTIONS)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}