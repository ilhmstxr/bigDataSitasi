# Big Data Sitasi — IoT Monitoring Pipeline

Server **Direct Ingestion** untuk monitoring **suhu, kelembapan, dan getaran** dari ESP32. Dibangun dengan **Fastify + MySQL (mysql2 pool) + n8n webhook**, persis sesuai dokumen `spesifikasi.md`.

## Arsitektur Singkat

```
ESP32 ─[HTTP POST /api/ingest 1×/menit]─▶ Fastify ─▶ MySQL (sensor_logs)
                                            │
                                            └─(async, non-blocking)──▶ n8n Webhook (jika anomali)
```

- **Func A — Logging Pipeline**: validasi JSON → prepared `INSERT` via connection pool.
- **Func B — Anomaly Alerting**: rule engine (`THRESHOLD_TEMP`, `THRESHOLD_VIBRATION`) → `axios.post(...)` ke n8n **tanpa `await`** sehingga response 200 OK ke ESP32 tidak terblokir.

## Struktur Proyek

```
bigDataSitasi/
├── package.json
├── .env.example
├── spesifikasi.md
├── src/
│   ├── server.js         # Bootstrap Fastify + healthcheck + error handler
│   ├── config.js         # Env loader (dotenv)
│   ├── db.js             # MySQL connection pool (singleton)
│   ├── schemas.js        # JSON Schema validasi payload IoT
│   ├── anomaly.js        # Rule engine + webhook async ke n8n
│   ├── routes/
│   │   └── ingest.js     # POST /api/ingest
│   ├── schema.sql        # DDL tabel sensor_logs + index
│   └── migrate.js        # Runner migrasi
└── scripts/
    └── sendTest.js       # Helper kirim payload dummy
```

## Persiapan

### 1. Install dependency

```bash
npm install
```

### 2. Konfigurasi environment

Salin `.env.example` menjadi `.env` lalu sesuaikan:

```bash
copy .env.example .env
```

Variabel penting:

| Variabel              | Default              | Keterangan                                  |
|-----------------------|----------------------|---------------------------------------------|
| `PORT`                | `3000`               | Port HTTP server                            |
| `MYSQL_HOST`          | `127.0.0.1`          | Host MySQL (Laragon biasanya `127.0.0.1`)   |
| `MYSQL_USER`          | `root`               |                                             |
| `MYSQL_PASSWORD`      | *(kosong)*           |                                             |
| `MYSQL_DATABASE`      | `big_data_sitasi`    | Database target                             |
| `MYSQL_CONNECTION_LIMIT` | `10`              | **Wajib** sesuai constraint                 |
| `THRESHOLD_TEMP`      | `60.0`               | Ambang anomali suhu (°C)                    |
| `THRESHOLD_VIBRATION` | `10.0`               | Ambang anomali getaran                      |
| `N8N_WEBHOOK_URL`     | *(kosong)*           | URL webhook n8n. Kosong → trigger di-skip   |

### 3. Migrasi database

```bash
npm run migrate
```

Akan membuat database `big_data_sitasi` (jika belum ada) + tabel `sensor_logs` lengkap dengan index `device_id`, `window_start`, dan composite `(device_id, window_start)`.

### 4. Jalankan server

```bash
npm start
# atau dev mode (hot reload Node 18+)
npm run dev
```

Healthcheck: `GET http://localhost:3000/health`

## Endpoint

### `POST /api/ingest`

**Request body** (sesuai kontrak DTO):

```json
{
  "device_id": "ESP32_Mesin_01",
  "window_start": 1714421800,
  "window_end": 1714421860,
  "peaks": {
    "temperature": { "max_value": 32.4, "exact_timestamp": 1714421815 },
    "humidity":    { "max_value": 65.0, "exact_timestamp": 1714421830 },
    "vibration":   { "max_value": 2.1,  "exact_timestamp": 1714421855 }
  }
}
```

**Response** `200 OK`:

```json
{ "status": "ok", "id": 123, "anomaly": false, "alerts": [] }
```

Bila payload tidak valid → `400 Bad Request` dengan detail validasi. Bila DB error → `500 Internal Server Error`.

## Uji Cepat

Setelah server jalan, di terminal lain:

```bash
# Kirim data normal
node scripts/sendTest.js normal

# Kirim data yang memicu anomali (suhu 65, getaran 15.8)
node scripts/sendTest.js anomaly
```

## Format Webhook n8n

Saat anomali terdeteksi, server menembakkan POST ke `N8N_WEBHOOK_URL`:

```json
{
  "device": "ESP32_Mesin_01",
  "waktu_jendela": "1714421800 - 1714421860",
  "peringatan": "Getaran Kritis: 15.8 pada timestamp 1714421859 | Suhu Overheat: 65C pada timestamp 1714421815",
  "raw_data": { "...payload asli IoT..." }
}
```

## Catatan Implementasi vs Spesifikasi

- ✅ **Connection Pool** (`mysql.createPool`) singleton di `src/db.js`, batas `MYSQL_CONNECTION_LIMIT=10`.
- ✅ **Prepared Statement** via `pool.execute(INSERT_SQL, params)` — aman dari SQL injection.
- ✅ **Validasi JSON** via Fastify schema (Ajv) — tolak `400 Bad Request` jika struktur menyimpang.
- ✅ **Anomaly trigger asynchronous** — `axios.post(...).catch(...)` tanpa `await` di handler.
- ✅ **Index** pada `device_id` dan `window_start` (plus composite) untuk query dashboard.
- ✅ **Bypass** ketika tidak ada anomali → response `200 OK` langsung tanpa overhead webhook.
- ⚠️ **Network Resilience (ESP32-side)**: tanggung jawab firmware. Server tidak menyimpan retry queue.

## Troubleshooting

- `ER_ACCESS_DENIED_ERROR` → cek `MYSQL_USER` / `MYSQL_PASSWORD` di `.env`.
- `ECONNREFUSED 127.0.0.1:3306` → MySQL/Laragon belum start.
- Webhook tidak terkirim → pastikan `N8N_WEBHOOK_URL` ter-set; cek log server (level `error`).
