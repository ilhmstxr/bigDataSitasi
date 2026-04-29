'use strict';

require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
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
  thresholds: {
    temperature: parseFloat(process.env.THRESHOLD_TEMP || '60.0'),
    vibration: parseFloat(process.env.THRESHOLD_VIBRATION || '10.0'),
  },
  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL || '',
    timeoutMs: parseInt(process.env.N8N_WEBHOOK_TIMEOUT_MS || '5000', 10),
  },
};

module.exports = config;
