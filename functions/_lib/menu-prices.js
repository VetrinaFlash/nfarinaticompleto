// price is the canonical base price; prezzi_json keeps named formats.
export function parseMenuPrice(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new Error('Inserisci un prezzo valido, maggiore o uguale a zero');
  const price = Number(typeof value === 'string' ? value.trim().replace(',', '.') : value);
  if (!Number.isFinite(price) || price < 0) throw new Error('Inserisci un prezzo valido, maggiore o uguale a zero');
  return price;
}

export function menuPrices(basePrice, rawPrices, strict = false) {
  const price = parseMenuPrice(basePrice);
  let prices;
  try {
    prices = typeof rawPrices === 'string' ? JSON.parse(rawPrices) : rawPrices;
    if (!Array.isArray(prices) || prices.length === 0) throw new Error();
    prices = prices.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error();
      return {...entry, prezzo:parseMenuPrice(entry.prezzo)};
    });
  } catch {
    if (strict) throw new Error('Prezzi dei formati non validi');
    prices = [{prezzo:price}];
  }
  prices[0] = {...prices[0], prezzo:price};
  return {price, prices, prezzi_json:JSON.stringify(prices)};
}
