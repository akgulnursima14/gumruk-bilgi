/**
 * functions/api/flight.js
 * Cloudflare Pages Function — API anahtarını gizleyen güvenli proxy
 *
 * İstemci:  GET /api/flight?no=TK2422&date=2026-08-13
 * Function: AeroDataBox'a gider, yanıtı normalize edip döndürür
 *
 * Ortam değişkenleri (Cloudflare Pages → Settings → Variables):
 *   AERODATABOX_KEY  — AeroDataBox API anahtarı (RapidAPI veya api.market)
 *   AVIATIONSTACK_KEY — Yedek: AviationStack API anahtarı
 *
 * Yerel geliştirme: .dev.vars dosyasına ekleyin (gitignore'lu)
 */

// Basit bellek içi önbellek (Cloudflare Workers stateless — her istek yeni instance)
// Gerçek edge önbelleği için Cache API kullanılabilir.
const CACHE_SECONDS = 300; // 5 dakika

export async function onRequestGet(context) {
  const { request, env } = context;
  const url    = new URL(request.url);
  const no     = (url.searchParams.get('no') || '').trim().toUpperCase();
  const date   = (url.searchParams.get('date') || '').trim();

  if (!no) {
    return json({ error: 'Uçuş numarası gerekli.' }, 400);
  }

  // Cloudflare Cache API ile önbellek
  const cacheUrl = `https://cache.internal/flight/${no}/${date || 'today'}`;
  const cache    = caches.default;
  const cached   = await cache.match(cacheUrl);
  if (cached) return cached;

  // 1. AeroDataBox (birincil)
  if (env.AERODATABOX_KEY) {
    try {
      const result = await queryAeroDataBox(no, date, env.AERODATABOX_KEY);
      const resp   = json(result);
      // Önbelleğe al
      const toCache = resp.clone();
      context.waitUntil(cache.put(cacheUrl,
        new Response(toCache.body, {
          ...toCache,
          headers: { ...Object.fromEntries(toCache.headers), 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }
        })
      ));
      return resp;
    } catch (err) {
      if (!env.AVIATIONSTACK_KEY) return json({ error: err.message }, 502);
    }
  }

  // 2. AviationStack (yedek)
  if (env.AVIATIONSTACK_KEY) {
    try {
      const result = await queryAviationStack(no, date, env.AVIATIONSTACK_KEY);
      return json(result);
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  }

  return json({ error: 'API anahtarı yapılandırılmamış. Cloudflare Pages ortam değişkenlerini kontrol edin.' }, 503);
}

/* ---- AeroDataBox adaptörü ---- */
async function queryAeroDataBox(flightNo, date, apiKey) {
  const d    = date || new Date().toISOString().slice(0, 10);
  const resp = await fetch(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNo)}/${d}`,
    { headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } }
  );
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`AeroDataBox: HTTP ${resp.status} — ${t.slice(0, 120)}`);
  }
  const data  = await resp.json();
  const item  = Array.isArray(data) ? data[0] : data;
  if (!item)  throw new Error('Uçuş bulunamadı.');

  return {
    flightNo: item.number || flightNo,
    date:     d,
    departure: {
      iata:    item.departure?.airport?.iata    || '',
      icao:    item.departure?.airport?.icao    || '',
      name:    item.departure?.airport?.name    || '',
      country: item.departure?.airport?.countryCode || ''
    },
    arrival: {
      iata:    item.arrival?.airport?.iata    || '',
      icao:    item.arrival?.airport?.icao    || '',
      name:    item.arrival?.airport?.name    || '',
      country: item.arrival?.airport?.countryCode || ''
    },
    status: item.status || ''
  };
}

/* ---- AviationStack adaptörü ---- */
async function queryAviationStack(flightNo, date, apiKey) {
  const params = new URLSearchParams({
    access_key: apiKey,
    flight_iata: flightNo
  });
  if (date) params.set('flight_date', date);
  const resp = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
  if (!resp.ok) throw new Error(`AviationStack: HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || 'AviationStack hatası');
  const item = data.data?.[0];
  if (!item)   throw new Error('Uçuş bulunamadı.');

  return {
    flightNo: item.flight?.iata  || flightNo,
    date:     item.flight_date   || date,
    departure: {
      iata:    item.departure?.iata    || '',
      icao:    item.departure?.icao    || '',
      name:    item.departure?.airport || '',
      country: item.departure?.country || ''
    },
    arrival: {
      iata:    item.arrival?.iata    || '',
      icao:    item.arrival?.icao    || '',
      name:    item.arrival?.airport || '',
      country: item.arrival?.country || ''
    },
    status: item.flight_status || ''
  };
}

/* ---- Yardımcı ---- */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
