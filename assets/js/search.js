/**
 * search.js — Havalimanı arama: tam eşleşme, ters arama, otomatik tamamlama
 */

import { getAirports, exactAirport } from './data.js';

export { exactAirport };

/** Metni normalize et (Türkçe karakterler, büyük-küçük harf). */
function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim();
}

/**
 * Şehir / havalimanı adı ile ters arama.
 * IATA'lı ve tarifeli olanlar öne alınır. Maks 6 sonuç.
 */
export function reverseSearch(term) {
  const n = norm(term);
  if (!n) return [];
  const scored = [];
  for (const a of getAirports()) {
    const city    = norm(a.m);
    const name    = norm(a.n);
    const country = norm(a.ct);
    let score = 0;
    if      (city    === n)          score = 100;
    else if (name    === n)          score = 95;
    else if (city.startsWith(n))     score = 85;
    else if (name.startsWith(n))     score = 80;
    else if (city.includes(n))       score = 70;
    else if (name.includes(n))       score = 65;
    else if (country === n)          score = 40;
    if (score) {
      if (a.i) score += 8;
      if (a.s) score += 4;
      scored.push({ a, score });
    }
  }
  scored.sort((x, y) =>
    y.score - x.score || (x.a.n || '').localeCompare(y.a.n || '', 'tr'));
  const seen = new Set(), out = [];
  for (const { a } of scored) {
    const key = a.i || a.o || a.d;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Kod önekine göre otomatik tamamlama önerileri (maks 8).
 * Önce IATA, yoksa ICAO/ident ile başlayanlar.
 */
export function airportAutocomplete(input) {
  const code = (input || '').trim().toUpperCase();
  if (code.length < 2) return [];
  const exact = exactAirport(code);
  if (exact) return [exact];
  const out = [];
  for (const a of getAirports()) {
    if (
      (a.i && a.i.startsWith(code)) ||
      (a.o && a.o.startsWith(code)) ||
      (a.d && a.d.startsWith(code))
    ) {
      out.push(a);
      if (out.length >= 8) break;
    }
  }
  return out;
}
