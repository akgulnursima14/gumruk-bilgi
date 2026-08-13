/**
 * flight-api.js — /api/flight proxy çağrısı + adaptör
 *
 * İstemci /api/flight?no=TK2422&date=2026-08-13 ister.
 * Cloudflare Pages Function (functions/api/flight.js) API anahtarını
 * güvenli biçimde kullanarak yukarı akış API'sine gider.
 *
 * Normalleştirilmiş yanıt:
 *   { flightNo, date, departure:{iata,icao,name,country}, arrival:{...}, status }
 */

/**
 * API proxy'sinin bu ortamda kullanılabilir olup olmadığını kontrol et.
 * GitHub Pages'de /api/* çalışmaz — Google fallback'e düşülür.
 */
export function isApiAvailable() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  // GitHub Pages: *.github.io
  if (host.endsWith('.github.io')) return false;
  // localhost / Cloudflare Pages: kullanılabilir
  return true;
}

/**
 * Uçuş bilgisi çek.
 * @param {string} flightNo  Uçuş numarası, örn. "TK2422"
 * @param {string} date      YYYY-MM-DD formatında tarih
 * @returns {Promise<object>} Normalleştirilmiş uçuş nesnesi
 */
export async function fetchFlight(flightNo, date) {
  const params = new URLSearchParams({ no: flightNo, date });
  const resp   = await fetch(`/api/flight?${params}`);

  if (!resp.ok) {
    let msg = `Uçuş verisi alınamadı (HTTP ${resp.status})`;
    try {
      const body = await resp.json();
      if (body.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }

  return resp.json();
}
