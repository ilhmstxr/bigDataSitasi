#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <time.h>
#include <ArduinoJson.h>

// --- KONFIGURASI JARINGAN & SERVER ---
// Menggunakan WiFi bawaan simulator (Wokwi / Cirkit)
const char* ssid = "Wokwi-GUEST";
const char* password = ""; 

// PERINGATAN: Ganti "IP_SERVER_ANDA" dengan IP LAN komputer Anda (misal: 192.168.1.10)
// JANGAN gunakan "localhost" atau "127.0.0.1" karena ESP32 akan menembak dirinya sendiri.
const char* serverUrl = "http://IP_SERVER_ANDA:3000/api/ingest"; 
const char* device_id = "ESP32_Mesin_01";

// --- KONFIGURASI PIN HARDWARE (ESP32-S3) ---
#define DHTPIN 15
#define DHTTYPE DHT22
#define I2C_SDA 8
#define I2C_SCL 9

// --- INISIALISASI OBJEK ---
DHT dht(DHTPIN, DHTTYPE);
Adafruit_MPU6050 mpu;

// --- VARIABEL EDGE-AGGREGATION ---
unsigned long window_start_time = 0;
unsigned long last_dht_read = 0;
unsigned long last_mpu_read = 0;

float max_temp = 0.0; unsigned long ts_temp = 0;
float max_hum = 0.0;  unsigned long ts_hum = 0;
float max_vib = 0.0;  unsigned long ts_vib = 0;

// Fungsi untuk mendapatkan UNIX Timestamp saat ini
unsigned long getEpochTime() {
  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return 0;
  }
  time(&now);
  return now;
}

void setup() {
  Serial.begin(115200);

  // 1. Koneksi WiFi Virtual
  WiFi.begin(ssid, password);
  Serial.print("Menghubungkan ke WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("\nWiFi Terhubung.");

  // 2. Sinkronisasi Waktu NTP (Mutlak untuk arsitektur Canvas)
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Menunggu sinkronisasi NTP");
  while (getEpochTime() < 100000) {
    delay(500); Serial.print(".");
  }
  Serial.println("\nWaktu Tersinkronisasi.");

  // 3. Inisialisasi Sensor DHT22
  dht.begin();
  Serial.println("DHT22 Siap.");

  // 4. Inisialisasi MPU6050 (I2C)
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!mpu.begin()) {
    Serial.println("FATAL: Gagal menemukan MPU6050! Cek kabel SDA (8) & SCL (9).");
    while (1) { delay(10); } // Hentikan sistem (Fail-Safe)
  }
  
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  Serial.println("MPU6050 Siap.");

  // Set waktu awal jendela agregasi
  window_start_time = getEpochTime();
  Serial.println("--- SISTEM MONITORING BERJALAN ---");
}

void loop() {
  unsigned long currentMillis = millis();
  unsigned long currentEpoch = getEpochTime();

  // --- TASK 1: BACA GETARAN (Super Cepat: 50Hz / Setiap 20ms) ---
  if (currentMillis - last_mpu_read >= 20) {
    last_mpu_read = currentMillis;
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // Kalkulasi magnitudo getaran (X, Y, Z) dikurangi gravitasi standar
    float raw_magnitude = sqrt(pow(a.acceleration.x, 2) + pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2));
    float current_vib = abs(raw_magnitude - 9.81); 

    if (current_vib > max_vib) {
      max_vib = current_vib;
      ts_vib = currentEpoch;
    }
  }

  // --- TASK 2: BACA SUHU & KELEMBAPAN (Lambat: 0.5Hz / Setiap 2 detik) ---
  if (currentMillis - last_dht_read >= 2000) {
    last_dht_read = currentMillis;
    
    float current_temp = dht.readTemperature();
    float current_hum = dht.readHumidity();

    if (!isnan(current_temp) && current_temp > max_temp) {
      max_temp = current_temp;
      ts_temp = currentEpoch;
    }
    if (!isnan(current_hum) && current_hum > max_hum) {
      max_hum = current_hum;
      ts_hum = currentEpoch;
    }
  }

  // --- TASK 3: EVALUASI JENDELA WAKTU (Setiap 60 Detik Eksekusi HTTP POST) ---
  if (currentEpoch - window_start_time >= 60) {
    Serial.println("\n[INFO] Mengirim data agregasi 1 menit ke server...");
    sendDataToServer(currentEpoch);
    
    // Reset agregasi untuk 1 menit berikutnya
    max_temp = 0.0; max_hum = 0.0; max_vib = 0.0;
    window_start_time = currentEpoch;
  }
}

// Fungsi untuk membungkus DTO dan menembakkan Webhook/API
void sendDataToServer(unsigned long window_end) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("ERROR: WiFi Putus. Data 1 menit ini dihanguskan.");
    return;
  }

  // Bungkus JSON sesuai skema arsitektur
  StaticJsonDocument<512> doc;
  doc["device_id"] = device_id;
  doc["window_start"] = window_start_time;
  doc["window_end"] = window_end;

  JsonObject peaks = doc.createNestedObject("peaks");
  
  JsonObject tempObj = peaks.createNestedObject("temperature");
  tempObj["max_value"] = max_temp;
  tempObj["exact_timestamp"] = ts_temp;

  JsonObject humObj = peaks.createNestedObject("humidity");
  humObj["max_value"] = max_hum;
  humObj["exact_timestamp"] = ts_hum;

  JsonObject vibObj = peaks.createNestedObject("vibration");
  vibObj["max_value"] = max_vib;
  vibObj["exact_timestamp"] = ts_vib;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // Eksekusi HTTP POST ke Server Node.js/MySQL
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.print("SUCCESS: Data masuk ke Database. HTTP Code: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("FAILED: Gagal menjangkau server. Error: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
}