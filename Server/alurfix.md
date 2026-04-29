Arsitektur Alur Data Final (The Master Flow)
Fase 1: Rutinitas IoT (Penyimpanan Pasif)

1. IoT Edge: ESP32 membaca Suhu & Kelembapan. Tiap 60 detik, ia mengirim payload HTTP POST ke Website (Backend Fastify + MySQL).

2. Website Backend: Controller menerima Request, divalidasi oleh DTO, diproses oleh Service, dan disimpan oleh Repository ke MySQL. Website tidak melakukan komputasi AI apa pun; murni pencatatan.

Fase 2: Orkestrasi & Deteksi Ancaman (Di dalam n8n)
3. Cron Trigger (n8n): n8n menjalankan jadwal otomatis (Schedule Node) setiap 3 atau 5 menit.
4. BMKG Ingestion (n8n): n8n memanggil API Publik BMKG (HTTP Request Node). Jika tidak ada gempa baru, proses n8n berhenti di sini. Jika ada gempa baru, lanjut ke langkah 5.
5. Data Pulling (n8n): n8n menembak endpoint GET ke Website Anda untuk meminta data suhu MySQL paling mutakhir (GET /api/sensor/latest).
6. Kalkulasi Spasial (n8n): Sebuah Code Node (JavaScript/Python di dalam n8n) mengeksekusi Rumus Haversine untuk menghitung jarak antara koordinat gempa BMKG dengan koordinat fisik datacenter.

Fase 3: Penalaran AI & Mitigasi (Di dalam n8n)
7. Gemini API Execution: n8n menggabungkan data suhu terbaru dan jarak gempa (dalam satuan KM) menjadi sebuah Prompt terstruktur. Data ini dilempar ke Google Gemini Node.
8. Mitigation Decision: Gemini membalas dengan JSON berisi status bahaya dan rekomendasi tindakan (misal: "tindakan": "nyalakan_genset_cadangan").

Fase 4: Umpan Balik & Eksekusi
9. Website Update: n8n melakukan HTTP POST kembali ke Website Anda (POST /api/mitigasi/log) membawa JSON dari Gemini. Website menyimpannya ke Repository untuk ditampilkan di antarmuka Dashboard.
10. Emergency Alert: n8n menembak notifikasi instan (Telegram/WhatsApp) kepada tim infrastruktur.