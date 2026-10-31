# HerdIQ — CattleBand device registry & label tool

Static website (no build step, no server code) with two jobs:

1. **Scan → device page.** Workers open the site on their phone, tap **Scan barcode**, point the camera at the
   Code 128 label on a CattleBand, and the device page opens: module details, the buffalo it's fitted to, and a
   *Live health* panel that's ready for sensor data.
2. **Label printing tool** (`/labels/`). It generates print-ready labels for any serial range, at the printer's
   native 203 dpi.

```
HerdIQ-CattleBand/
├── netlify.toml            Netlify config (publishes the site/ folder)
├── PRINTING_GUIDE.md       How to print the labels on the SEZNIK Josh
├── print-files/            Test batch 4 (S1HCB0381–S1HCB0400): PDF, PNGs, Excel (verified)
└── site/                   ← this folder IS the website
    ├── index.html          Home: scan, type a serial, searchable device list
    ├── device.html         Device page: device.html?id=S1HCB0321
    ├── labels/index.html   Label printing tool
    ├── data/devices.json   The registry (edit this to change animal details)
    ├── manifest.webmanifest  "Add to Home screen" → opens straight into the scanner
    ├── _headers            Netlify security/caching headers
    └── assets/
        ├── js/config.js    ← the ONLY file to edit when you connect a backend
        ├── js/serial.js    Serial format rules (S1 · H · CB · 0321)
        ├── js/data.js      Data layer (static JSON today, API tomorrow)
        ├── js/scanner.js   Camera scanner (native BarcodeDetector → ZXing fallback)
        ├── js/home.js, device.js, ui.js
        ├── js/labels/      Code 128 encoder, 1-bit renderer, PDF/PNG/ZIP writers, tool UI
        └── vendor/zxing/   ZXing 0.21.3 (Apache-2.0), served locally — no CDN dependency
```

## Serial format

`S1HCB0321` = **S1** sensor v1 · **H** HerdIQ · **CB** CattleBand · **0321** unit number.
Workers can type `321` and the site expands it to `S1HCB0321` (prefix set in `config.js`).

## Deploy on Netlify (from GitHub)

1. Create a GitHub repo, then push **this whole folder** to it (including `netlify.toml`).
2. Netlify → *Add new site → Import an existing project → GitHub* → pick the repo.
   Build command: *(leave empty)*. Publish directory: `site` (already set by `netlify.toml`).
3. *Site configuration → Change site name* → e.g. `herdiq-devices` → `https://herdiq-devices.netlify.app`.
4. Every push to `main` redeploys within about 30 seconds.

**HTTPS is required for the camera.** Netlify provides it automatically. Opening `index.html` straight from
disk will **not** work: the camera and the data loading both need a web server.

Give workers the link, or have them open it once and use *Add to Home screen*. The icon then opens straight
into the scanner.

## Updating devices / animal details

Edit `site/data/devices.json` on GitHub and commit. The site re-checks that file on every visit, so changes
show up immediately.

- `status`: `testing` | `in-stock` | `deployed` | `maintenance` | `retired`
- `animal`: set to `null` while the band isn't on an animal
- Remove `"environment": "test"` (or set it to `"production"`) to hide the *Test data* banner
- For a new batch of bands, use the label tool. **Website registry (devices.json)** exports matching entries
  you can append.

## Moving to the official website later

Copy the contents of `site/` to any web server. All paths are relative, so it works at a domain root
(`herdiq.example.com/`) or inside a sub-folder (`vayamdesigners.com/herdiq/`). Requirements:

- HTTPS (for the camera).
- `_headers` is Netlify-only. On Apache or Nginx, recreate the same headers if you want them; the site works
  without them.
- `404.html` uses root-absolute paths and only matters on Netlify.

Labels don't contain a URL, so **no reprinting is needed** when the site moves.

## Connecting the PCB / sensor data (future)

The pages never fetch data themselves. Everything goes through `assets/js/data.js`. To switch to a real
backend, change two lines in `assets/js/config.js`:

```js
dataSource: 'api',
apiBaseUrl: 'https://api.your-domain.com/herdiq/v1',
```

…and have the backend implement:

| Endpoint | Returns |
|---|---|
| `GET /devices` | `{ "devices": Device[] }` |
| `GET /devices/{serial}` | `Device` (404 if unknown) |
| `GET /devices/{serial}/telemetry/latest` | `{ recordedAt, bodyTempC, activityIndex, activityLabel, batteryPct }` (404 if none) |

`Device` has the same shape as the entries in `devices.json` (documented at the top of `data.js`).
The *Live health* panel fills itself in as soon as telemetry is returned. To demo it now without a
backend, add a `"telemetry": { … }` object to any device in `devices.json`.

The API must send CORS headers (`Access-Control-Allow-Origin`) if it's on a different domain from the site.
The site's Content-Security-Policy already allows HTTPS API calls.

## ⚠ Privacy

`devices.json` is public: anyone with the link can see every device and animal. That's fine for test data.
Before real farm/owner data goes in, put the data behind the API with authentication. Don't put it in the
static file.

## Testing locally

```bash
cd site
python -m http.server 8000
# open http://localhost:8000 on the same laptop (camera works on localhost)
```

On a phone you need the HTTPS Netlify URL. A plain `http://192.168…` address blocks the camera.

## Browser support

| Phone | Engine used | Notes |
|---|---|---|
| Android – Chrome / Edge / Samsung Internet | Native `BarcodeDetector` | Fastest |
| iPhone – Safari / Chrome | ZXing (loaded on demand, ~330 KB once) | iOS 14.3+ |
| Any phone without camera access | Manual serial entry | `321` is enough |

Hold the phone about **10 cm** from the label. The scanner turns on continuous autofocus, a mild zoom and
(where supported) a flashlight button for dark sheds.
