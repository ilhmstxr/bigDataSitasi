'use strict';

/**
 * Helper: kirim payload dummy ke endpoint /api/ingest untuk uji manual.
 * Jalankan: node scripts/sendTest.js [normal|anomaly]
 */

const http = require('http');

const mode = process.argv[2] || 'normal';
const now = Math.floor(Date.now() / 1000);

const payloads = {
  normal: {
    device_id: 'ESP32_Mesin_01',
    window_start: now - 60,
    window_end: now,
    peaks: {
      temperature: { max_value: 32.4, exact_timestamp: now - 25 },
      humidity: { max_value: 65.0, exact_timestamp: now - 40 },
      vibration: { max_value: 2.1, exact_timestamp: now - 10 },
    },
  },
  anomaly: {
    device_id: 'ESP32_Mesin_01',
    window_start: now - 60,
    window_end: now,
    peaks: {
      temperature: { max_value: 65.0, exact_timestamp: now - 45 },
      humidity: { max_value: 70.0, exact_timestamp: now - 30 },
      vibration: { max_value: 15.8, exact_timestamp: now - 5 },
    },
  },
};

const body = JSON.stringify(payloads[mode] || payloads.normal);

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: parseInt(process.env.PORT || '3000', 10),
    path: '/api/ingest',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Body  :', data);
    });
  }
);

req.on('error', (e) => console.error('Request error:', e.message));
req.write(body);
req.end();
