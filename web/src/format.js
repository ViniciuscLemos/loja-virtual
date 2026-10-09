export const money = (cents) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const shortId = (id) => id.slice(0, 8).toUpperCase();

export const date = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// "12.90" or "12,90" -> 1290, or null if it's not a valid price
export function toCents(text) {
  const clean = String(text).trim().replace(/[$\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 ? cents : null;
}

export function stockLabel(stock) {
  if (stock === 0) return 'Out of stock';
  if (stock <= 5) return `Only ${stock} left`;
  return 'In stock';
}
