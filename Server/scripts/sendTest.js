'use strict';

/**
 * Helper: kirim payload dummy ke endpoint /api/ingest untuk uji manual.
 * Jalankan: node scripts/sendTest.js [normal|anomaly|collapse]
 *
 * Kontrak: D7S Pseudo-Emulation (Server/spesifikasitambahan.md).
 */

const http = require('http');

const mode = process.argv[2] || 'normal';
const now = Math.floor(Date.now() / 1000);

const payloads = {
  // Tenang: SI < 5.0 → tidak ada alert.
  normal: {
    device_id: 'ESP32_Datacenter_01',
    window_start: now - 60,
    window_end: now,
    seismic_data: {
      si_value_kayser: 0.7, // ~ 10 Gal * 0.07
      pga_value_gal: 10.0,
      flags: { is_earthquake: false, is_structure_collapsing: false },
    },
    climate_data: { max_temperature: 32.4, max_humidity: 65.0 },
  },

  // Gempa terdeteksi: SI > 5.0 (mis. PGA 100 Gal → SI 7.0).
  anomaly: {
    device_id: 'ESP32_Datacenter_01',
    window_start: now - 60,
    window_end: now,
    seismic_data: {
      si_value_kayser: 7.0,
      pga_value_gal: 100.0,
      flags: { is_earthquake: true, is_structure_collapsing: false },
    },
    climate_data: { max_temperature: 65.0, max_humidity: 70.0 },
  },

  // Struktur runtuh: tilt > 20° atau SI > 40.
  collapse: {
    device_id: 'ESP32_Datacenter_01',
    window_start: now - 60,
    window_end: now,
    seismic_data: {
      si_value_kayser: 45.0,
      pga_value_gal: 642.86,
      flags: { is_earthquake: true, is_structure_collapsing: true },
    },
    climate_data: { max_temperature: 70.5, max_humidity: 55.0 },
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
