CREATE DATABASE IF NOT EXISTS big_data_sitasi
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE big_data_sitasi;

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
