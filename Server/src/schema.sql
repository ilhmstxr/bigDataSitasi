CREATE DATABASE IF NOT EXISTS big_data_sitasi
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE big_data_sitasi;

-- Tabel lama (kontrak peaks.temperature/humidity/vibration). Dipertahankan
-- agar migrasi idempoten dan data historis tidak hilang. Endpoint /api/ingest
-- versi baru sudah TIDAK menulis ke tabel ini.
CREATE TABLE IF NOT EXISTS sensor_logs (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id     VARCHAR(50)   NOT NULL,
  window_start  INT UNSIGNED  NOT NULL,
  window_end    INT UNSIGNED  NOT NULL,
  temp_max      FLOAT         NULL,
  temp_ts       INT UNSIGNED  NULL,
  hum_max       FLOAT         NULL,
  hum_ts        INT UNSIGNED  NULL,
  vib_max       FLOAT         NULL,
  vib_ts        INT UNSIGNED  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_id (device_id),
  INDEX idx_window_start (window_start),
  INDEX idx_device_window (device_id, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel utama kontrak D7S Pseudo-Emulation (sinkron dengan koneksi.cpp +
-- spesifikasitambahan.md). Setiap baris = 1 jendela agregasi 60 detik.
CREATE TABLE IF NOT EXISTS seismic_logs (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id                VARCHAR(50)   NOT NULL,
  window_start             INT UNSIGNED  NOT NULL,
  window_end               INT UNSIGNED  NOT NULL,
  si_value_kayser          FLOAT         NOT NULL,
  pga_value_gal            FLOAT         NOT NULL,
  is_earthquake            TINYINT(1)    NOT NULL DEFAULT 0,
  is_structure_collapsing  TINYINT(1)    NOT NULL DEFAULT 0,
  max_temperature          FLOAT         NULL,
  max_humidity             FLOAT         NULL,
  created_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_seismic_device (device_id),
  INDEX idx_seismic_window (window_start),
  INDEX idx_seismic_device_window (device_id, window_start),
  INDEX idx_seismic_flags (is_earthquake, is_structure_collapsing)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
