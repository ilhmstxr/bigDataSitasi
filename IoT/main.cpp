#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <time.h>
#include <ArduinoJson.h>

// --- KONFIGURASI JARINGAN & SERVER ---
const char* ssid = "strux";
const char* password = "12345678";
const char* serverUrl = "http://0.0.0.0:3000"; // Sesuaikan IP Server
const char* device_id = "ESP32-S3";

// --- KONFIGURASI PIN HARDWARE ---
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
    return 0; // Gagal sinkronisasi waktu
  }
  time(&now);
  return now;
}

void setup() {
  Serial.begin(115200);

  // 1. Koneksi WiFi
  WiFi.begin(ssid, password);
  Serial.print("Menghubungkan ke WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("\nWiFi Terhubung.");

  // 2. Sinkronisasi Waktu NTP (Mutlak diperlukan untuk arsitektur ini)
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Menunggu sinkronisasi NTP");
  while (getEpochTime() < 100000) {
    delay(500); Serial.print(".");
  }
  Serial.println("\nWaktu Tersinkronisasi.");

  // 3. Inisialisasi Sensor
  dht.begin();
  Wire.begin(I2C_SDA, I2C_SCL);
  
  if (!mpu.begin()) {
    Serial.println("Gagal menemukan MPU6050!");
    while (1) { delay(10); } // Hentikan sistem jika hardware gagal (Fail-Safe)
  }
  
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  // Set waktu awal jendela agregasi
  window_start_time = getEpochTime();
  Serial.println("Sistem Monitoring Berjalan...");
}

void loop() {
  unsigned long currentMillis = millis();
  unsigned long currentEpoch = getEpochTime();

  // --- TASK 1: BACA GETARAN (Super Cepat: 50Hz / Setiap 20ms) ---
  if (currentMillis - last_mpu_read >= 20) {
    last_mpu_read = currentMillis;
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // Kalkulasi magnitudo getaran (X, Y, Z) & kurangi ~9.8 (Gravitasi bumi)
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
    sendDataToServer(currentEpoch);
    
    // Reset agregasi untuk 1 menit berikutnya
    max_temp = 0.0; max_hum = 0.0; max_vib = 0.0;
    window_start_time = currentEpoch;
  }
}

// Fungsi untuk membungkus dan mengirim JSON DTO
void sendDataToServer(unsigned long window_end) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi Putus. Data 1 menit ini dibuang.");
    return;
  }

  // Buat JSON DTO sesuai kesepakatan spesifikasi MySQL
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

  // Eksekusi REST API POST
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.print("Data terkirim! Status: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("Gagal mengirim HTTP POST. Error: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
}