# Gümrüklü Yolcu Bilgi Sistemi

Havalimanı gümrük personeli için çevrimdışı çalışan bir PWA.
Ana klasörler altında uçuşları, yolcu kayıtlarını ve gelinen havalimanı bilgisini yönetir.

## Özellikler

- **Havalimanı Sorgula** — IATA, ICAO veya ident koduyla; şehir/havalimanı adıyla
- **Uçuş Bilgisi** — Uçuş numarası + tarih ile kalkış havalimanı sorgusu (API gerektirir)
- **Uçak Kayıtları** — Klasör → Uçuş → Yolcu hiyerarşisi; tik, not, PDF raporu
- **Çevrimdışı** — Service Worker ile tam offline destek
- **Veri güvenliği** — IndexedDB, otomatik yedek hatırlatması, 5 geri-alınabilir snapshot
- **Koyu/Açık tema** — Sistem tercihi + manuel geçiş

## Yerel Çalıştırma

`file://` protokolü ES modüllerinde CORS engeliyle karşılaşır.
Basit bir yerel sunucu şart:

```bash
npx serve .
# veya
python -m http.server 8080
```

Tarayıcıda `http://localhost:8080` açın.

## Yayın

### Cloudflare Pages (önerilen — Faz 5 uçuş API'si için)

1. GitHub'a push edin.
2. Cloudflare Pages → "Connect to Git" → repo seçin.
3. Framework: **None** | Build komutu: *boş* | Çıktı dizini: `.`
4. Settings → Environment Variables → `AERODATABOX_KEY` ekleyin.
5. Her push'ta otomatik deploy.

### GitHub Pages (Faz 5 API desteği olmadan)

Repo → Settings → Pages → Branch: `main` / `(root)` → Save.
Uçuş Bilgisi sekmesi API yerine Google aramasına yönlendirir.

## Ortam Değişkenleri

| Değişken | Açıklama |
|---|---|
| `AERODATABOX_KEY` | AeroDataBox API anahtarı (RapidAPI) |
| `AVIATIONSTACK_KEY` | Yedek AviationStack anahtarı |

Yerel geliştirmede `.dev.vars` dosyasına ekleyin (gitignore'lu):

```
AERODATABOX_KEY=xxxx
```

## Veri ve Yedek

Tüm kayıtlar **tarayıcının IndexedDB**'sinde tutulur; sunucuya gönderilmez.
Araç çubuğundaki **Yedekle** ile JSON indirin; **Yedeği Yükle** ile geri yükleyin.

> Cihaz değişimi veya tarayıcı temizliğinde veri kaybolabilir.
> Düzenli yedek almanız önerilir.

## Dosya Yapısı

```
/
├── index.html              # Uygulama iskelet + <link>/<script>
├── sw.js                   # Servis çalışanı (cache v7)
├── manifest.webmanifest
├── /assets
│   ├── /css
│   │   ├── tokens.css      # Tasarım sistemi değişkenleri
│   │   ├── base.css        # Reset, layout, butonlar
│   │   └── components.css  # Tüm bileşenler
│   └── /js
│       ├── app.js          # Giriş noktası
│       ├── data.js         # Havalimanı verisi + indeksler
│       ├── store.js        # IndexedDB katmanı
│       ├── search.js       # Arama + otomatik tamamlama
│       ├── records.js      # Klasör/uçuş/yolcu iş mantığı
│       ├── flight-api.js   # /api/flight istemcisi
│       └── ui.js           # Modal, toast, DOM render
├── /data
│   └── airports.json       # 11.679 havalimanı (OurAirports)
└── /functions
    └── /api
        └── flight.js       # Cloudflare Pages Function (proxy)
```

## Lisans

MIT — ayrıntılar için `LICENSE` dosyasına bakın.
