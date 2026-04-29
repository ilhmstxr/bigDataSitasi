# SPESIFIKASI TEKNIS (PRD): Firmware ESP32-S3 - "MPU6050 to D7S Pseudo-Emulation"

## 1. Konteks & Tujuan Arsitektur
Buatkan saya kode C++ untuk mikrokontroler ESP32-S3 menggunakan Arduino IDE. Sistem ini berfungsi sebagai *Edge-Aggregator* IoT yang membaca sensor suhu (DHT22) dan sensor getaran umum (MPU6050). 

**Tujuan Kritis:** Firmware ini WAJIB melakukan manipulasi matematika (Heuristik) di sisi perangkat keras untuk meniru (*emulate*) struktur dan satuan output dari sensor seismik industri **Omron D7S**. Data tidak dikirim secara *real-time*, melainkan diagregasi dan dikirim persis **1 kali setiap 60 detik**.

## 2. Definisi Perangkat Keras & Pinout
*   **Board:** ESP32-S3
*   **Sensor Suhu:** DHT22 (Pin Data = GPIO 15)
*   **Sensor Getaran:** MPU6050 (Komunikasi I2C: SDA = GPIO 8, SCL = GPIO 9)

## 3. Aturan Komputasi Edge-Aggregation (Zero-Gap Logic)
Sistem tidak boleh menggunakan fungsi `delay()` yang memblokir proses (*non-blocking loop*). Gunakan `millis()` untuk *task scheduling*.

**A. Task 1: Pembacaan MPU6050 (Setiap 20 milidetik / 50Hz)**
1. Baca akselerasi $X, Y, Z$ dari MPU6050.
2. Hitung Magnitudo Vektor Getaran ($m/s^2$) dikurangi gravitasi bumi ($9.81$).
3. Jika nilai magnitudo ini lebih besar dari nilai puncak yang tersimpan (`max_vib_ms2`), timpa nilai tersebut.
4. **Kalkulasi Kemiringan (Tilt):** Hitung sudut *Pitch* dan *Roll* dari nilai $X, Y, Z$. Jika kemiringan melebihi 20 derajat, set flag boolean `has_tilted = true`.

**B. Task 2: Pembacaan DHT22 (Setiap 2000 milidetik / 2 detik)**
1. Baca Suhu (Celcius) dan Kelembapan (%).
2. Simpan nilai tertinggi (`max_temp` dan `max_hum`) selama jendela waktu 60 detik.

**C. Task 3: Pseudo-Calculation D7S (Dieksekusi di Detik ke-60)**
Saat jendela waktu 60 detik tercapai, lakukan transformasi matematika heuristik berikut pada nilai `max_vib_ms2` sebelum dibungkus ke JSON:
1.  **Hitung PGA (Gal):** `pga_value_gal = max_vib_ms2 * 100.0;`
2.  **Hitung Pseudo SI Value (Kayser):** `si_value_kayser = pga_value_gal * 0.07;` *(Catatan: Ini adalah konstanta heuristik statis untuk simulasi).*
3.  **Logika Earthquake Flag:** Jika `si_value_kayser > 5.0`, maka `is_earthquake = true`.
4.  **Logika Collapse Flag:** Jika `has_tilted == true` ATAU `si_value_kayser > 40.0`, maka `is_structure_collapsing = true`.

## 4. Kontrak Data (Payload JSON)
Setelah Task 3 selesai, ESP32 wajib mengirimkan `HTTP POST` ke endpoint server dengan struktur JSON DTO berikut:
```json
{
  "device_id": "ESP32_Datacenter_01",
  "window_start": 1714425000,
  "window_end": 1714425060,
  "seismic_data": {
    "si_value_kayser": 24.5,
    "pga_value_gal": 350.2,
    "flags": {
      "is_earthquake": true,
      "is_structure_collapsing": false
    }
  },
  "climate_data": {
    "max_temperature": 28.5,
    "max_humidity": 65.2
  }
}