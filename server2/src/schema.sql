-- Skema khusus server2 (jembatan n8n).
--
-- Catatan: server2 berbagi database dengan folder Server/ (default
-- big_data_sitasi). File ini HANYA berisi tabel baru milik server2,
-- yaitu mitigasi_log. Tabel sensor_logs / seismic_logs sudah dikelola
-- oleh Server/src/schema.sql dan TIDAK dibuat ulang di sini.

CREATE TABLE IF NOT EXISTS mitigasi_log (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  -- Konteks gempa (opsional, dari hasil ekstraksi BMKG di n8n)
  earthquake_lat      FLOAT         NULL,
  earthquake_lon      FLOAT         NULL,
  magnitude           FLOAT         NULL,
  kedalaman_km        FLOAT         NULL,
  -- Hasil pemikiran Gemini (wajib)
  jarak_gempa_km      FLOAT         NULL,
  level_bahaya        VARCHAR(20)   NOT NULL,
  keputusan_mitigasi  TEXT          NOT NULL,
  -- Snapshot state termal saat keputusan dibuat (opsional)
  source_temp         FLOAT         NULL,
  source_hum          FLOAT         NULL,
  source_device_id    VARCHAR(50)   NULL,
  -- Audit trail payload mentah dari n8n / Gemini
  raw_response        JSON          NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mitigasi_level (level_bahaya),
  INDEX idx_mitigasi_created (created_at),
  INDEX idx_mitigasi_device (source_device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
