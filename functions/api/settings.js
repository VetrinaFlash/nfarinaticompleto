// Impostazioni pubbliche per index.html (bottoni, orari, promo bar)
export async function onRequestGet(context) {
  const { env } = context;
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };

  try {
    const rows = await env.DB.prepare(
      "SELECT key, value FROM settings WHERE key IN ('promo_bar_text','homepage_buttons','homepage_hours','homepage_hours_note','locale_chiuso')"
    ).all();

    const settings = {};
    for (const row of rows.results) {
      settings[row.key] = row.value;
    }

    // Parsa homepage_buttons se presente
    if (settings.homepage_buttons) {
      try { settings.homepage_buttons = JSON.parse(settings.homepage_buttons); } catch {}
    }

    return new Response(JSON.stringify(settings), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
