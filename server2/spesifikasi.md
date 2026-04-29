1. Peta Jalan API (Kontrak Data Eksternal)
Sistem n8n Anda membutuhkan tiga jalur API berbeda untuk bernapas. Jika salah satu dari ini gagal, orkestrasi Anda akan runtuh.

API 1: BMKG (Penarik Data Seismik)

Tipe: HTTP GET (Eksternal, Publik)

Endpoint Standar: [https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json](https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json)

Target Ekstraksi: Anda hanya membutuhkan key Point.Coordinates (biasanya dalam format string "Lat,Lon"), Magnitude, dan Kedalaman.

API 2: Website Backend Anda (Penyedia State Termal)

Tipe: HTTP GET (Internal / LAN)

Endpoint: http://IP_SERVER_ANDA/api/sensor/latest

Target Ekstraksi: Nilai Float dari suhu (max_temp) dan kelembapan (max_hum) yang dikirim oleh ESP32 pada menit terakhir.

API 3: Website Backend Anda (Pencatat Mitigasi AI)

Tipe: HTTP POST (Internal / LAN)

Endpoint: http://IP_SERVER_ANDA/api/mitigasi/log

Target Payload: JSON hasil pemikiran Gemini (Jarak gempa, level bahaya, keputusan mitigasi otomatis).