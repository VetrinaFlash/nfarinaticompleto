// Restituisce il menu pubblico dal DB D1 nel formato compatibile con menu.html
export async function onRequestGet(context) {
  const { env } = context;
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };

  try {
    const categories = await env.DB.prepare(
      'SELECT id, name FROM categories WHERE active = 1 ORDER BY sort_order ASC'
    ).all();

    const products = await env.DB.prepare(
      'SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC'
    ).all();

    // Costruisce il formato rawMenuData atteso da menu.html
    const rawMenu = [];

    for (const cat of categories.results) {
      const catProducts = products.results.filter(p => p.category_id === cat.id);

      for (const prod of catProducts) {
        let prezzi = [];
        let scelte_obbligatorie = {};
        let scelte_multiple = {};

        try { prezzi = JSON.parse(prod.prezzi_json || '[]'); } catch {}
        try { scelte_obbligatorie = JSON.parse(prod.options_json || '{}'); } catch {}
        try { scelte_multiple = JSON.parse(prod.multi_options_json || '{}'); } catch {}

        if (prezzi.length === 0) prezzi = [{ prezzo: prod.price }];

        rawMenu.push({
          categoria: cat.name,
          prodotto: prod.name,
          ingredienti: prod.description || '',
          prezzi,
          scelte_obbligatorie,
          scelte_multiple,
          image_url: prod.image_url || '',
          mandatory_choice: prod.mandatory_choice === 1,
          db_id: prod.id,
        });
      }
    }

    return new Response(JSON.stringify(rawMenu), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
