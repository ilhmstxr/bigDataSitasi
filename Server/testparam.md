# Test Parameter API – Server D7S Pseudo-Emulation

Dokumen referensi parameter pengujian endpoint Fastify di `src/server.js`.
Kontrak data sinkron dengan `Server/spesifikasitambahan.md` dan firmware `Server/koneksi.cpp`.

- **Base URL (lokal)**: `http://127.0.0.1:3000`
- **Header wajib (POST)**: `Content-Type: application/json`
- **Body limit**: 64 KB (lihat `src/server.js:20`)
- **Threshold default**: `THRESHOLD_TEMP=60.0`, `THRESHOLD_SI_KAYSER=5.0`

---

## 1. `GET /health`

Healthcheck server + ping DB.

| #    | Skenario                   | Method | URL       | Expected Status | Expected Body (contoh)                          |
| ---- | -------------------------- | ------ | --------- | --------------- | ----------------------------------------------- |
| H-01 | DB hidup                   | `GET`  | `/health` | `200`           | `{ "status":"ok", "db":true,  "ts":<unix> }`    |
| H-02 | DB mati / kredensial salah | `GET`  | `/health` | `200`           | `{ "status":"ok", "db":false, "ts":<unix> }`    |

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:3000/health
```

```bash
curl -s http://127.0.0.1:3000/health
```

---

## 2. `POST /api/ingest`

Endpoint utama untuk push agregasi 60 detik dari ESP32.

### 2.1 Kontrak Field

| Path JSON                                    | Type    | Wajib | Constraint                  |
| -------------------------------------------- | ------- | ----- | --------------------------- |
| `device_id`                                  | string  | wajib | 1–50 karakter               |
| `window_start`                               | integer | wajib | >= 0 (Unix epoch detik)     |
| `window_end`                                 | integer | wajib | >= 0 dan >= `window_start`  |
| `seismic_data.si_value_kayser`               | number  | wajib | >= 0                        |
| `seismic_data.pga_value_gal`                 | number  | wajib | >= 0                        |
| `seismic_data.flags.is_earthquake`           | boolean | wajib | -                           |
| `seismic_data.flags.is_structure_collapsing` | boolean | wajib | -                           |
| `climate_data.max_temperature`               | number  | wajib | -                           |
| `climate_data.max_humidity`                  | number  | wajib | -                           |

`additionalProperties: false` di setiap level → field asing **ditolak 400**.

### 2.2 Skenario Happy Path

| #    | Nama                                | si_value_kayser | pga_value_gal | is_earthquake | is_structure_collapsing | max_temperature | Expected `alerts`                                  |
| ---- | ----------------------------------- | --------------- | ------------- | ------------- | ----------------------- | --------------- | -------------------------------------------------- |
| P-01 | `normal` (tenang)                   | `0.7`           | `10.0`        | `false`       | `false`                 | `32.4`          | `[]`                                               |
| P-02 | Gempa ringan (tepat di ambang)      | `5.0`           | `71.43`       | `false`       | `false`                 | `30.0`          | `[]` *(strict `>`)*                                |
| P-03 | `anomaly` (gempa terdeteksi)        | `7.0`           | `100.0`       | `true`        | `false`                 | `35.0`          | `["Gempa Terdeteksi: ..."]`                        |
| P-04 | `collapse` (struktur runtuh via SI) | `45.0`          | `642.86`      | `true`        | `true`                  | `40.0`          | `["Struktur Berisiko Runtuh: ..."]`                |
| P-05 | Collapse via tilt saja              | `2.0`           | `28.57`       | `false`       | `true`                  | `30.0`          | `["Struktur Berisiko Runtuh: ..."]`                |
| P-06 | Overheat tanpa gempa                | `0.5`           | `7.14`        | `false`       | `false`                 | `75.0`          | `["Suhu Overheat: 75C"]`                           |
| P-07 | Gempa + overheat (multi-alert)      | `8.0`           | `114.28`      | `true`        | `false`                 | `80.0`          | `["Gempa Terdeteksi: ...", "Suhu Overheat: ..."]`  |
| P-08 | Server-side guard (firmware bohong) | `9.0`           | `128.57`      | `false`       | `false`                 | `30.0`          | `["SI Melampaui Ambang Server: ..."]`              |

**Expected umum**: `200 OK`, body `{ "status":"ok", "id":<int>, "anomaly":<bool>, "alerts":[...] }` dan 1 baris baru di `seismic_logs`.

#### Body Template P-01 (normal)

```json
{
  "device_id": "ESP32_Datacenter_01",
  "window_start": 1714425000,
  "window_end": 1714425060,
  "seismic_data": {
    "si_value_kayser": 0.7,
    "pga_value_gal": 10.0,
    "flags": { "is_earthquake": false, "is_structure_collapsing": false }
  },
  "climate_data": { "max_temperature": 32.4, "max_humidity": 65.0 }
}
```

#### Body Template P-04 (collapse)

```json
{
  "device_id": "ESP32_Datacenter_01",
  "window_start": 1714425000,
  "window_end": 1714425060,
  "seismic_data": {
    "si_value_kayser": 45.0,
    "pga_value_gal": 642.86,
    "flags": { "is_earthquake": true, "is_structure_collapsing": true }
  },
  "climate_data": { "max_temperature": 40.0, "max_humidity": 55.0 }
}
```

### 2.3 Skenario Validasi Schema (`400 Bad Request`)

| #    | Nama                  | Mutasi terhadap body valid                          | Expected                              |
| ---- | --------------------- | --------------------------------------------------- | ------------------------------------- |
| V-01 | Field root hilang     | hapus `device_id`                                   | `400` `details[].keyword="required"`  |
| V-02 | Field nested hilang   | hapus `seismic_data.flags`                          | `400`                                 |
| V-03 | Tipe salah – integer  | `window_start: "abc"`                               | `400` `keyword="type"`                |
| V-04 | Tipe salah – boolean  | `flags.is_earthquake: "true"`                       | `400`                                 |
| V-05 | Tipe salah – number   | `si_value_kayser: null`                             | `400`                                 |
| V-06 | Negatif               | `si_value_kayser: -1`                               | `400` `keyword="minimum"`             |
| V-07 | Negatif window        | `window_start: -10`                                 | `400`                                 |
| V-08 | `device_id` kosong    | `device_id: ""`                                     | `400` `keyword="minLength"`           |
| V-09 | `device_id` > 50 char | string 51 karakter                                  | `400` `keyword="maxLength"`           |
| V-10 | Field asing root      | tambah `"foo": 1`                                   | `400` `keyword="additionalProperties"`|
| V-11 | Field asing nested    | tambah `seismic_data.extra: 1`                      | `400`                                 |
| V-12 | Body bukan JSON       | kirim `not-json` + `Content-Type: application/json` | `400`                                 |
| V-13 | Body kosong           | kirim `""`                                          | `400`                                 |
| V-14 | Salah Content-Type    | `Content-Type: text/plain`                          | `415` (Fastify default)               |
| V-15 | Body terlalu besar    | payload > 64 KB                                     | `413 Payload Too Large`               |
| V-16 | Method salah          | `GET /api/ingest`                                   | `404`                                 |
| V-17 | Path salah            | `POST /api/Ingest` (huruf besar)                    | `404`                                 |

### 2.4 Skenario Validasi Semantik

| #    | Nama                          | Kondisi                              | Expected                                                       |
| ---- | ----------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| S-01 | `window_end` < `window_start` | `window_start=2000, window_end=1000` | `400 { "message": "window_end harus >= window_start" }`        |
| S-02 | `window_end` == `window_start`| keduanya `1714425000`                | `200` (boleh sama)                                             |

### 2.5 Skenario Boundary Threshold Anomaly Engine

Mengacu pada `src/anomaly.js:13-48`. Operator yang dipakai: **strict `>`**.

| #    | Input                                                          | flags firmware     | Expected Alerts                                                       |
| ---- | -------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| B-01 | `si=5.0`, `temp=60.0`                                          | semua `false`      | `[]` (tepat di ambang, tidak alert)                                   |
| B-02 | `si=5.0001`, flags false                                       | server-guard aktif | `["SI Melampaui Ambang Server: ..."]`                                 |
| B-03 | `temp=60.0001`                                                 | flags false        | `["Suhu Overheat: ..."]`                                              |
| B-04 | `flags.is_structure_collapsing=true` + `is_earthquake=true`    | -                  | hanya `"Struktur Berisiko Runtuh: ..."` (collapse menelan earthquake) |

### 2.6 Skenario Database / Infrastruktur

| #    | Kondisi                                | Expected                                                                                   |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| D-01 | Tabel `seismic_logs` belum dibuat      | `500 { "message":"Gagal menyimpan data ke database" }` (jalankan `npm run migrate` dulu)   |
| D-02 | MySQL mati                             | `500` + log `Gagal insert seismic_logs`                                                    |
| D-03 | `device_id` 50 karakter (batas atas)   | `200`                                                                                      |
| D-04 | Insert 100 request paralel             | semua `200`, `id` increment monotonic                                                      |

---

## 3. Cara Eksekusi Cepat

### 3.1 Helper bawaan

```powershell
node scripts/sendTest.js normal
node scripts/sendTest.js anomaly
node scripts/sendTest.js collapse
```

#### Contoh Output Aktual (terminal)

> Jalankan `npm start` di terminal lain terlebih dulu agar Fastify mendengarkan di `:3000`. Nilai `id` akan menyesuaikan auto-increment baris di `seismic_logs`.

**P-01 — `node scripts/sendTest.js normal`**

```text
Status: 200
Body  : {"status":"ok","id":1,"anomaly":false,"alerts":[]}
```

**P-03 — `node scripts/sendTest.js anomaly`**

```text
Status: 200
Body  : {"status":"ok","id":2,"anomaly":true,"alerts":["Gempa Terdeteksi: SI=7 Kayser, PGA=100 Gal","Suhu Overheat: 65C"]}
```

**P-04 — `node scripts/sendTest.js collapse`**

```text
Status: 200
Body  : {"status":"ok","id":3,"anomaly":true,"alerts":["Struktur Berisiko Runtuh: SI=45 Kayser, PGA=642.86 Gal","SI Melampaui Ambang Server: 45 > 5 Kayser","Suhu Overheat: 70.5C"]}
```

**V-01 — payload tanpa `device_id` (negative test)**

```text
Status: 400
Body  : {"error":"Bad Request","message":"Payload tidak sesuai kontrak data","details":[{"keyword":"required","message":"must have required property 'device_id'"}]}
```

**V-10 — payload dengan field asing `foo` (negative test)**

```text
Status: 400
Body  : {"error":"Bad Request","message":"Payload tidak sesuai kontrak data","details":[{"keyword":"additionalProperties","message":"must NOT have additional properties"}]}
```

**S-01 — `window_end < window_start` (validasi semantik)**

```text
Status: 400
Body  : {"error":"Bad Request","message":"window_end harus >= window_start"}
```

**H-01 — `Invoke-RestMethod ... /health`**

```text
status db    ts
------ --    --
ok    True   1714425123
```

### 3.2 PowerShell – body inline

```powershell
$body = @{
  device_id    = "ESP32_Datacenter_01"
  window_start = 1714425000
  window_end   = 1714425060
  seismic_data = @{
    si_value_kayser = 7.0
    pga_value_gal   = 100.0
    flags = @{ is_earthquake = $true; is_structure_collapsing = $false }
  }
  climate_data = @{ max_temperature = 35.0; max_humidity = 60.0 }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:3000/api/ingest `
  -ContentType 'application/json' `
  -Body $body
```

### 3.3 curl – body inline

```bash
curl -i -X POST http://127.0.0.1:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"ESP32_Datacenter_01",
    "window_start":1714425000,
    "window_end":1714425060,
    "seismic_data":{
      "si_value_kayser":7.0,
      "pga_value_gal":100.0,
      "flags":{"is_earthquake":true,"is_structure_collapsing":false}
    },
    "climate_data":{"max_temperature":35.0,"max_humidity":60.0}
  }'
```

### 3.4 Verifikasi DB

```sql
SELECT id, device_id, si_value_kayser, pga_value_gal,
       is_earthquake, is_structure_collapsing,
       max_temperature, created_at
FROM big_data_sitasi.seismic_logs
ORDER BY id DESC
LIMIT 10;
```

---

## 4. Checklist Smoke Test (Wajib sebelum deploy)

- [ ] H-01 `/health` → `200` dengan `db:true`
- [ ] P-01 `normal` → `200`, `anomaly:false`, baris baru di `seismic_logs`
- [ ] P-03 `anomaly` → `200`, `alerts` mengandung `"Gempa Terdeteksi"`
- [ ] P-04 `collapse` → `200`, `alerts` mengandung `"Struktur Berisiko Runtuh"`
- [ ] V-01 missing `device_id` → `400`
- [ ] V-10 field asing → `400`
- [ ] S-01 `window_end < window_start` → `400`
- [ ] B-04 collapse + earthquake → hanya 1 alert (collapse)
- [ ] (Opsional) Webhook n8n menerima payload bila `N8N_WEBHOOK_URL` di-set
