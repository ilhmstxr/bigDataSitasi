'use strict';

const db = require('../db');
const config = require('../config');

/**
 * GET /api/sensor/latest?device_id=ESP32_Mesin_01
 *
 * Mengembalikan nilai puncak suhu (max_temp) & kelembapan (max_hum) dari
 * jendela 60 detik TERAKHIR yang dikirim ESP32. Sumber data: tabel
 * seismic_logs (primer, kontrak D7S Pseudo-Emulation), fallback ke
 * sensor_logs (legacy peaks.temperature/humidity) jika seismic_logs kosong.
 *
 * Response 200:
 *   {
 *     "device_id": "ESP32_Mesin_01",
 *     "window_start": 1714421800,
 *     "window_end":   1714421860,
 *     "max_temp": 31.2,
 *     "max_hum":  78.5,
 *     "source":  "seismic_logs",       // atau "sensor_logs"
 *     "age_sec": 12,                    // umur data (sekarang - window_end)
 *     "ts": 1714421872
 *   }
 *
 * Response 404: belum ada data untuk device_id tsb.
 * Response 410: data terbaru lebih tua dari STALE_AFTER_SEC (data basi).
 */
async function routes(fastify) {
  const querystringSchema = {
    type: 'object',
    properties: {
      device_id: { type: 'string', minLength: 1, maxLength: 50 },
    },
    additionalProperties: false,
  };

  fastify.get(
    '/api/sensor/latest',
    { schema: { querystring: querystringSchema } },
    async (request, reply) => {
      const deviceId =
        (request.query && request.query.device_id) ||
        config.sensor.defaultDeviceId;

      // 1) Primer: seismic_logs.
      const [seismicRows] = await db.pool.execute(
        `SELECT device_id, window_start, window_end,
                max_temperature AS max_temp,
                max_humidity    AS max_hum
           FROM seismic_logs
          WHERE device_id = ?
          ORDER BY window_end DESC
          LIMIT 1`,
        [deviceId]
      );

      let row = seismicRows[0];
      let source = 'seismic_logs';

      // 2) Fallback: sensor_logs (legacy).
      if (!row) {
        const [legacyRows] = await db.pool.execute(
          `SELECT device_id, window_start, window_end,
                  temp_max AS max_temp,
                  hum_max  AS max_hum
             FROM sensor_logs
            WHERE device_id = ?
            ORDER BY window_end DESC
            LIMIT 1`,
          [deviceId]
        );
        row = legacyRows[0];
        source = 'sensor_logs';
      }

      if (!row) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Belum ada data sensor untuk device_id="${deviceId}".`,
        });
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const ageSec = Math.max(0, nowSec - Number(row.window_end));

      if (
        config.sensor.staleAfterSec > 0 &&
        ageSec > config.sensor.staleAfterSec
      ) {
        return reply.code(410).send({
          error: 'Gone',
          message: `Data sensor basi (umur ${ageSec}s > ${config.sensor.staleAfterSec}s).`,
          device_id: row.device_id,
          window_end: Number(row.window_end),
          age_sec: ageSec,
        });
      }

      return {
        device_id: row.device_id,
        window_start: Number(row.window_start),
        window_end: Number(row.window_end),
        max_temp: row.max_temp == null ? null : Number(row.max_temp),
        max_hum: row.max_hum == null ? null : Number(row.max_hum),
        source,
        age_sec: ageSec,
        ts: nowSec,
      };
    }
  );
}

module.exports = routes;
