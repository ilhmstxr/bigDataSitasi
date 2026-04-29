'use strict';

const db = require('../db');

/**
 * POST /api/mitigasi/log
 *
 * Pencatat keputusan mitigasi hasil pemikiran Gemini (dipanggil oleh n8n
 * setelah node Gemini menghasilkan jawaban).
 *
 * Body JSON (kontrak — sesuai server2/spesifikasi.md "Target Payload"):
 *   {
 *     "level_bahaya":       "AMAN | WASPADA | SIAGA | AWAS",   (WAJIB)
 *     "keputusan_mitigasi": "string non-empty",                (WAJIB)
 *     "jarak_gempa_km":     12.4,                              (opsional)
 *     "magnitude":          5.2,                               (opsional)
 *     "kedalaman_km":       10,                                (opsional)
 *     "earthquake_lat":     -7.8,                              (opsional)
 *     "earthquake_lon":     110.4,                             (opsional)
 *     "source_temp":        31.2,                              (opsional)
 *     "source_hum":         78.5,                              (opsional)
 *     "source_device_id":   "ESP32_Mesin_01",                  (opsional)
 *     "raw_response":       { ... }                            (opsional, payload Gemini)
 *   }
 *
 * Response 201: { id, level_bahaya, created_at_unix }
 */
async function routes(fastify) {
  const bodySchema = {
    type: 'object',
    required: ['level_bahaya', 'keputusan_mitigasi'],
    additionalProperties: true,
    properties: {
      level_bahaya: {
        type: 'string',
        minLength: 1,
        maxLength: 20,
      },
      keputusan_mitigasi: {
        type: 'string',
        minLength: 1,
      },
      jarak_gempa_km: { type: ['number', 'null'] },
      magnitude: { type: ['number', 'null'] },
      kedalaman_km: { type: ['number', 'null'] },
      earthquake_lat: { type: ['number', 'null'] },
      earthquake_lon: { type: ['number', 'null'] },
      source_temp: { type: ['number', 'null'] },
      source_hum: { type: ['number', 'null'] },
      source_device_id: {
        type: ['string', 'null'],
        maxLength: 50,
      },
      raw_response: {},
    },
  };

  fastify.post(
    '/api/mitigasi/log',
    { schema: { body: bodySchema } },
    async (request, reply) => {
      const b = request.body;

      const params = [
        b.earthquake_lat ?? null,
        b.earthquake_lon ?? null,
        b.magnitude ?? null,
        b.kedalaman_km ?? null,
        b.jarak_gempa_km ?? null,
        String(b.level_bahaya).toUpperCase().trim(),
        String(b.keputusan_mitigasi).trim(),
        b.source_temp ?? null,
        b.source_hum ?? null,
        b.source_device_id ?? null,
        b.raw_response == null ? null : JSON.stringify(b.raw_response),
      ];

      const [result] = await db.pool.execute(
        `INSERT INTO mitigasi_log
           (earthquake_lat, earthquake_lon, magnitude, kedalaman_km,
            jarak_gempa_km, level_bahaya, keputusan_mitigasi,
            source_temp, source_hum, source_device_id, raw_response)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params
      );

      return reply.code(201).send({
        ok: true,
        id: result.insertId,
        level_bahaya: params[5],
        created_at_unix: Math.floor(Date.now() / 1000),
      });
    }
  );
}

module.exports = routes;
