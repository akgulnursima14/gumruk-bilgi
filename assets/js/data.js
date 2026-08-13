/**
 * data.js — Havalimanı verisini yükle, indeksle, yardımcı araçlar
 */

export const byIATA  = new Map();
export const byICAO  = new Map();
export const byIdent = new Map();
let _airports = [];

/** airports.json'ı fetch et, indeksleri kur. */
export async function loadAirports() {
  const resp = await fetch('./data/airports.json');
  if (!resp.ok) throw new Error(`Veri sunucudan alınamadı (HTTP ${resp.status}).`);
  _airports = await resp.json();
  for (const a of _airports) {
    if (a.i && !byIATA.has(a.i))   byIATA.set(a.i, a);
    if (a.o && !byICAO.has(a.o))   byICAO.set(a.o, a);
    if (a.d && !byIdent.has(a.d))  byIdent.set(a.d, a);
  }
  return _airports;
}

/** Tüm havalimanı listesini döndür. */
export function getAirports() { return _airports; }

/**
 * IATA, ICAO veya ident kodu ile tek havalimanı ara.
 * "İlk gelen kazanır" davranışını korur.
 */
export function exactAirport(code) {
  const c = (code || '').trim().toUpperCase();
  return byIATA.get(c) || byICAO.get(c) || byIdent.get(c) || null;
}

/* ---- Saf yardımcılar ---- */

/** HTML varlıklarını kaçır. */
export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** Tarihi Türkçe biçimle. */
export const fmtDate = d => {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(new Date(d + 'T12:00:00'));
  } catch (_) { return d; }
};

/** Benzersiz kısa kimlik üret. */
export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
