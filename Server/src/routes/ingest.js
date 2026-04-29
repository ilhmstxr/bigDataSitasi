'use strict';

const { pool } = require('../db');
const { ingestSchema } = require('../schemas');
const { evaluateAnomalies, fireWebhookAsync } = require('../anomaly');

const INSERT_SQL = `
  INSERT INTO seismic_logs
    (device_id, window_start, window_end,
     si_value_kayser, pga_value_gal,
     is_earthquake, is_structure_collapsing,
     max_temperature, max_humidity)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Plugin Fastify yang mendaftarkan endpoint /api/ingest.
 */
async function ingestRoutes(fastify) {
  fastify.post(
    '/api/ingest',
    { schema: ingestSchema },
    async (request, reply) => {
      const payload = request.body;

      // Validasi semantik tambahan: window_end >= window_start
      if (payload.window_end < payload.window_start) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'window_end harus >= window_start',
        });
      }

      const { seismic_data, climate_data } = payload;
      const params = [
        payload.device_id,
        payload.window_start,
        payload.window_end,
        seismic_data.si_value_kayser,
        seismic_data.pga_value_gal,
        seismic_data.flags.is_earthquake ? 1 : 0,
        seismic_data.flags.is_structure_collapsing ? 1 : 0,
        climate_data.max_temperature,
        climate_data.max_humidity,
      ];

      // Func A - Logging Pipeline.
      // Pool otomatis getConnection -> execute (prepared) -> release.
      let insertId;
      try {
        const [result] = await pool.execute(INSERT_SQL, params);
        insertId = result.insertId;
      } catch (err) {
        request.log.error(
          { err: err.message, code: err.code },
          'Gagal insert seismic_logs'
        );
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Gagal menyimpan data ke database',
        });
      }

      // Func B - Anomaly detection + async webhook.
      const alerts = evaluateAnomalies(payload);
      if (alerts.length > 0) {
        fireWebhookAsync(payload, alerts, request.log);
      }

      return reply.code(200).send({
        status: 'ok',
        id: insertId,
        anomaly: alerts.length > 0,
        alerts,
      });
    }
  );
}

module.exports = ingestRoutes;
