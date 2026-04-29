Spesifikasi Arsitektur Teknis: IoT Monitoring Suhu, Kelembapan, dan Getaran

1. Konteks Sistem & Pendekatan Arsitektur

Sistem ini menggunakan pendekatan Radical Simplification (Direct Ingestion tanpa Message Broker). ESP32 tidak mengirimkan aliran data real-time terus-menerus. Sebaliknya, ESP32 melakukan komputasi Edge-Aggregation dengan sistem "Compare & Replace" selama jendela waktu 60 detik. Hanya nilai puncak (peak) dari setiap metrik beserta timestamp eksaknya yang dikirimkan ke server.

Keterbatasan yang Diterima (Trade-off): Pengambilan nilai puncak getaran berisiko memicu False Positives dari guncangan transien (seperti barang jatuh), namun menghemat bandwidth jaringan hingga 99%.

2. Kontrak Data (Payload DTO dari IoT ke Server)

IoT wajib mengirimkan data 1 kali per menit melalui protokol HTTP POST ke endpoint server /api/ingest menggunakan format JSON berikut secara absolut:

{
  "device_id": "String (ID unik perangkat, misal: ESP32_Mesin_01)",
  "window_start": "Integer (Unix Timestamp detik, awal periode pengumpulan)",
  "window_end": "Integer (Unix Timestamp detik, akhir periode pengumpulan)",
  "peaks": {
    "temperature": { "max_value": "Float", "exact_timestamp": "Integer" },
    "humidity": { "max_value": "Float", "exact_timestamp": "Integer" },
    "vibration": { "max_value": "Float", "exact_timestamp": "Integer" }
  }
}


3. Spesifikasi Func A: Logging Pipeline

Tujuan: Merekam data ke dalam basis data MySQL.

Teknologi: Node.js (Fastify) + MySQL (mysql2 package).

Alur Kerja:

Server menerima JSON Payload.

Server memvalidasi struktur JSON (tolak dengan 400 Bad Request jika tidak sesuai).

Server mengambil koneksi dari Connection Pool MySQL.

Server mengeksekusi Prepared Statement SQL (INSERT INTO...) untuk menyisipkan data.

Koneksi dikembalikan ke pool.

Skema Database MySQL (Tabel: sensor_logs):

Kolom

Tipe Data MySQL

Deskripsi

id

BIGINT AUTO_INCREMENT PRIMARY KEY

ID Unik Row

device_id

VARCHAR(50) NOT NULL

ID ESP32 (Harus diindeks)

window_start

INT UNSIGNED

Waktu mulai (Unix Timestamp)

window_end

INT UNSIGNED

Waktu selesai (Unix Timestamp)

temp_max

FLOAT

Suhu puncak (Celcius)

temp_ts

INT UNSIGNED

Timestamp eksak terjadinya temp_max

hum_max

FLOAT

Kelembapan puncak (%)

hum_ts

INT UNSIGNED

Timestamp eksak terjadinya hum_max

vib_max

FLOAT

Getaran puncak

vib_ts

INT UNSIGNED

Timestamp eksak terjadinya vib_max

created_at

TIMESTAMP DEFAULT CURRENT_TIMESTAMP

Waktu baris data dibuat di server

Catatan Indexing: Tambahkan index pada kolom device_id dan window_start untuk mempercepat proses kueri pembuatan laporan dashboard di masa depan.

4. Spesifikasi Func B: Contexting & Anomaly Alerting

Tujuan: Mendeteksi anomali secara mandiri di sisi server dan memicu alur notifikasi melalui n8n secara asinkron (non-blocking).

Logika Aturan (Rule Engine):

Jika payload.peaks.vibration.max_value > THRESHOLD_VIBRATION (misal: 10.0) -> Set flag Anomali Getaran.

Jika payload.peaks.temperature.max_value > THRESHOLD_TEMP (misal: 60.0) -> Set flag Anomali Suhu.

Alur Kerja Trigger:

Jika tidak ada anomali, sistem bypass dan hanya mengembalikan status 200 OK ke IoT setelah data berhasil ditulis ke MySQL.

Jika terdeteksi anomali, Server membungkus peringatan ke dalam pesan tekstual.

Server menembakkan HTTP POST ke Webhook URL n8n.

Eksekusi ini bersifat Asynchronous (menggunakan axios.post(...).catch(...) tanpa await yang memblokir proses HTTP Response utama).

Format Webhook ke n8n:

{
  "device": "ESP32_Mesin_01",
  "waktu_jendela": "1714421800 - 1714421860",
  "peringatan": "Getaran Kritis: 15.8 pada timestamp 1714421859 | Suhu Overheat: 65C pada timestamp 1714421815",
  "raw_data": { "... (seluruh payload asli dari IoT)" }
}


5. Constraint & Edge Cases (Syarat Mutlak)

Time Synchronization (Hardware): Karena sistem bergantung pada exact_timestamp dalam akurasi detik, ESP32 wajib melakukan sinkronisasi NTP setiap kali terhubung ke internet, atau menggunakan modul RTC fisik untuk menjamin timestamp tidak kacau.

Database Connection Pooling (Server): Node.js dilarang keras membuka dan menutup koneksi MySQL (mysql.createConnection) pada setiap HTTP Request. Harus menggunakan arsitektur Connection Pool (mysql.createPool) dengan batas maksimal koneksi diatur (misal: 10) untuk mencegah server MySQL kehabisan memori.

Network Resilience (Hardware): Jika ESP32 gagal melakukan HTTP POST, data 1 menit tersebut akan dibuang. Buffer direset ulang untuk mencegah Memory Leak pada RAM ESP32.


RALAT
https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json
https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json
https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json