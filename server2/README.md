# server2 — Jembatan n8n (BMKG ↔ Sensor State ↔ Logger Mitigasi)

Mini-service Fastify yang **memenuhi kontrak data eksternal** untuk
orkestrasi n8n sesuai `server2/spesifikasi.md`. Tiga jalur API yang
disediakan:

| #     | Method | Path                    | Tipe        | Tujuan                                                             |
| ----- | ------ | ----------------------- | ----------- | ------------------------------------------------------------------ |
| API 1 | GET    | `/api/bmkg/autogempa`   | Proxy ext.  | Penarik data seismik BMKG + ekstraksi `Coordinates`, `Magnitude`, `Kedalaman`. |
| API 2 | GET    | `/api/sensor/latest`    | Internal    | State termal terakhir dari ESP32 (`max_temp`, `max_hum`).          |
| API 3 | POST   | `/api/mitigasi/log`     | Internal    | Pencatat keputusan mitigasi hasil pemikiran Gemini.                |

> **Catatan arsitektur.** Database di-share dengan folder `Server/`
> (default `big_data_sitasi`). Service ini **hanya** menambahkan tabel
> `mitigasi_log`. Tabel `seismic_logs` / `sensor_logs` tetap ditulis oleh
> `Server/` (endpoint `/api/ingest`).

---

## Quick start

```bash
cd server2
copy .env.example .env       # Windows / PowerShell
npm install
npm run migrate              # buat tabel mitigasi_log
npm run dev                  # http://localhost:3100
```

Healthcheck:

```bash
curl http://localhost:3100/health
```

---

## API 1 — Proxy BMKG

```
GET /api/bmkg/autogempa
```

Contoh respons:

```json
{
  "status": "ok",
  "attribution": "BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)",
  "source": "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json",
  "fetched_at": "2026-04-30T08:00:00.000Z",
  "extracted": {
    "coordinates": "-7.80,110.40",
    "lat": -7.8,
    "lon": 110.4,
    "magnitude": 5.2,
    "kedalaman_km": 10,
    "wilayah": "...",
    "datetime": "..."
  },
  "raw": { "...": "blok Infogempa.gempa asli BMKG" }
}
```

Cache in-memory **30 detik** + single-flight (hormati BMKG).

---

## API 2 — State Termal Terbaru

```
GET /api/sensor/latest?device_id=ESP32_Mesin_01
```

`device_id` opsional (default dari `DEFAULT_DEVICE_ID` di `.env`).

Sumber data (urut prioritas):

1. `seismic_logs.max_temperature` & `seismic_logs.max_humidity` — kontrak
   D7S Pseudo-Emulation (lihat `Server/src/schema.sql`).
2. Fallback: `sensor_logs.temp_max` / `hum_max` (legacy `peaks`).

Contoh respons sukses:

```json
{
  "device_id": "ESP32_Mesin_01",
  "window_start": 1714421800,
  "window_end":   1714421860,
  "max_temp": 31.2,
  "max_hum":  78.5,
  "source":   "seismic_logs",
  "age_sec":  12,
  "ts":       1714421872
}
```

Status code:

- `404 Not Found` — belum ada data untuk `device_id` tsb.
- `410 Gone` — data terbaru lebih tua dari `STALE_AFTER_SEC` (default 300 dtk).

---

## API 3 — Logger Keputusan Mitigasi (Gemini)

```
POST /api/mitigasi/log
Content-Type: application/json
```

Body (kontrak — lihat `server2/spesifikasi.md` "API 3"):

```json
{
  "level_bahaya":       "WASPADA",
  "keputusan_mitigasi": "Pastikan jalur evakuasi terbuka, matikan mesin non-kritis.",
  "jarak_gempa_km":     12.4,
  "magnitude":          5.2,
  "kedalaman_km":       10,
  "earthquake_lat":     -7.8,
  "earthquake_lon":     110.4,
  "source_temp":        31.2,
  "source_hum":         78.5,
  "source_device_id":   "ESP32_Mesin_01",
  "raw_response":       { "model": "gemini-...", "text": "..." }
}
```

Field WAJIB: `level_bahaya`, `keputusan_mitigasi`. Sisanya opsional.

Response 201:

```json
{
  "ok": true,
  "id": 42,
  "level_bahaya": "WASPADA",
  "created_at_unix": 1714421900
}
```

Response 400 jika body tidak valid (Fastify schema validation).

---

## Skema tabel `mitigasi_log`

```@c:\Users\Ilhamstxr\Documents\laragon\www\bigdata\server2\src\schema.sql:7-29
CREATE TABLE IF NOT EXISTS mitigasi_log (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  -- Konteks gempa (opsional, dari hasil ekstraksi BMKG di n8n)
  earthquake_lat      FLOAT         NULL,
  earthquake_lon      FLOAT         NULL,
  magnitude           FLOAT         NULL,
  kedalaman_km        FLOAT         NULL,
  -- Hasil pemikiran Gemini (wajib)
  jarak_gempa_km      FLOAT         NULL,
  level_bahaya        VARCHAR(20)   NOT NULL,
  keputusan_mitigasi  TEXT          NOT NULL,
  -- Snapshot state termal saat keputusan dibuat (opsional)
  source_temp         FLOAT         NULL,
  source_hum          FLOAT         NULL,
  source_device_id    VARCHAR(50)   NULL,
  -- Audit trail payload mentah dari n8n / Gemini
  raw_response        JSON          NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mitigasi_level (level_bahaya),
  INDEX idx_mitigasi_created (created_at),
  INDEX idx_mitigasi_device (source_device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## Smoke test (PowerShell)

```powershell
# 1) Health
curl http://localhost:3100/health

# 2) BMKG
curl http://localhost:3100/api/bmkg/autogempa

# 3) Sensor latest
curl "http://localhost:3100/api/sensor/latest?device_id=ESP32_Mesin_01"

# 4) Mitigasi log
$body = @{
  level_bahaya       = "WASPADA"
  keputusan_mitigasi = "Pastikan jalur evakuasi terbuka."
  jarak_gempa_km     = 12.4
  magnitude          = 5.2
  source_temp        = 31.2
  source_hum         = 78.5
} | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri http://localhost:3100/api/mitigasi/log `
  -ContentType 'application/json' -Body $body
```

---

## Catatan keamanan / produksi

- Tempatkan service di belakang reverse proxy (n8n & ESP32 hanya
  mengakses dari LAN). Endpoint `/api/mitigasi/log` saat ini tanpa auth —
  jika dipublikasikan, tambahkan token bearer di handler.
- Pool MySQL **wajib** (sudah default `connectionLimit=10`) — jangan
  ganti ke `createConnection` per-request.
- `raw_response` disimpan sebagai `JSON`. MySQL ≥ 5.7 wajib.
