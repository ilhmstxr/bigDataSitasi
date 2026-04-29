'use strict';

require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT || '3100', 10),
    host: process.env.HOST || '0.0.0.0',
  },
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'big_data_sitasi',
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
  },
  bmkg: {
    autogempaUrl:
      process.env.BMKG_AUTOGEMPA_URL ||
      'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json',
    timeoutMs: parseInt(process.env.BMKG_TIMEOUT_MS || '8000', 10),
  },
  sensor: {
    defaultDeviceId: process.env.DEFAULT_DEVICE_ID || 'ESP32_Mesin_01',
    staleAfterSec: parseInt(process.env.STALE_AFTER_SEC || '300', 10),
  },
};

module.exports = config;
