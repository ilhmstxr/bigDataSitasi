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
const char* device_id = "ESP32_Datacenter_01";

// --- KONSTANTA HEURISTIK D7S PSEUDO-EMULATION ---
constexpr float GRAVITY_MS2          = 9.81f;
constexpr float MS2_TO_GAL           = 100.0f;   // 1 m/s^2 = 100 Gal
constexpr float PGA_TO_SI_KAYSER     = 0.07f;    // konstanta heuristik statis
constexpr float TILT_THRESHOLD_DEG   = 20.0f;
constexpr float SI_EARTHQUAKE_THRES  = 5.0f;
constexpr float SI_COLLAPSE_THRES    = 40.0f;

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

float max_temp     = 0.0f;
float max_hum      = 0.0f;
float max_vib_ms2  = 0.0f;   // puncak magnitudo getaran (m/s^2, sudah dikurangi gravitasi)
bool  has_tilted   = false;  // flag: pernah melebihi 20 derajat dalam jendela 60 detik

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

  // --- TASK 1: BACA GETARAN + TILT (Super Cepat: 50Hz / Setiap 20ms) ---
  if (currentMillis - last_mpu_read >= 20) {
    last_mpu_read = currentMillis;
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    const float ax = a.acceleration.x;
    const float ay = a.acceleration.y;
    const float az = a.acceleration.z;

    // 1) Magnitudo getaran (m/s^2) dikurangi gravitasi standar.
    float raw_magnitude = sqrt((ax * ax) + (ay * ay) + (az * az));
    float current_vib   = fabsf(raw_magnitude - GRAVITY_MS2);
    if (current_vib > max_vib_ms2) {
      max_vib_ms2 = current_vib;
    }

    // 2) Kalkulasi Kemiringan: Pitch & Roll (derajat).
    float pitch_deg = atan2f(-ax, sqrtf((ay * ay) + (az * az))) * 180.0f / (float)PI;
    float roll_deg  = atan2f(ay, az) * 180.0f / (float)PI;
    float tilt_abs  = fmaxf(fabsf(pitch_deg), fabsf(roll_deg));
    if (tilt_abs > TILT_THRESHOLD_DEG) {
      has_tilted = true;
    }
  }

  // --- TASK 2: BACA SUHU & KELEMBAPAN (Lambat: 0.5Hz / Setiap 2 detik) ---
  if (currentMillis - last_dht_read >= 2000) {
    last_dht_read = currentMillis;

    float current_temp = dht.readTemperature();
    float current_hum  = dht.readHumidity();

    if (!isnan(current_temp) && current_temp > max_temp) {
      max_temp = current_temp;
    }
    if (!isnan(current_hum) && current_hum > max_hum) {
      max_hum = current_hum;
    }
  }

  // --- TASK 3: EVALUASI JENDELA WAKTU (Setiap 60 Detik Eksekusi HTTP POST) ---
  if (currentEpoch - window_start_time >= 60) {
    Serial.println("\n[INFO] Mengirim data agregasi 1 menit ke server...");
    sendDataToServer(currentEpoch);

    // Reset agregasi untuk 1 menit berikutnya
    max_temp     = 0.0f;
    max_hum      = 0.0f;
    max_vib_ms2  = 0.0f;
    has_tilted   = false;
    window_start_time = currentEpoch;
  }
}

// Fungsi untuk membungkus DTO dan menembakkan Webhook/API
void sendDataToServer(unsigned long window_end) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("ERROR: WiFi Putus. Data 1 menit ini dihanguskan.");
    return;
  }

  // --- TASK 3 (lanjut): Pseudo-Calculation D7S ---
  // Transformasi heuristik dari magnitudo getaran (m/s^2) -> PGA (Gal) -> SI (Kayser).
  const float pga_value_gal    = max_vib_ms2 * MS2_TO_GAL;
  const float si_value_kayser  = pga_value_gal * PGA_TO_SI_KAYSER;

  const bool is_earthquake          = (si_value_kayser > SI_EARTHQUAKE_THRES);
  const bool is_structure_collapsing = (has_tilted) || (si_value_kayser > SI_COLLAPSE_THRES);

  // Bungkus JSON sesuai kontrak D7S Pseudo-Emulation.
  StaticJsonDocument<512> doc;
  doc["device_id"]    = device_id;
  doc["window_start"] = window_start_time;
  doc["window_end"]   = window_end;

  JsonObject seismic = doc.createNestedObject("seismic_data");
  seismic["si_value_kayser"] = si_value_kayser;
  seismic["pga_value_gal"]   = pga_value_gal;

  JsonObject flags = seismic.createNestedObject("flags");
  flags["is_earthquake"]           = is_earthquake;
  flags["is_structure_collapsing"] = is_structure_collapsing;

  JsonObject climate = doc.createNestedObject("climate_data");
  climate["max_temperature"] = max_temp;
  climate["max_humidity"]    = max_hum;

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