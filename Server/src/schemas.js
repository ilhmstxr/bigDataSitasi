'use strict';

/**
 * JSON Schema untuk validasi payload dari IoT (Fastify built-in Ajv).
 * Reject 400 Bad Request bila tidak sesuai struktur ini.
 */
const ingestSchema = {
  body: {
    type: 'object',
    required: ['device_id', 'window_start', 'window_end', 'peaks'],
    additionalProperties: false,
    properties: {
      device_id: {
        type: 'string',
        minLength: 1,
        maxLength: 50,
      },
      window_start: { type: 'integer', minimum: 0 },
      window_end: { type: 'integer', minimum: 0 },
      peaks: {
        type: 'object',
        required: ['temperature', 'humidity', 'vibration'],
        additionalProperties: false,
        properties: {
          temperature: {
            type: 'object',
            required: ['max_value', 'exact_timestamp'],
            additionalProperties: false,
            properties: {
              max_value: { type: 'number' },
              exact_timestamp: { type: 'integer', minimum: 0 },
            },
          },
          humidity: {
            type: 'object',
            required: ['max_value', 'exact_timestamp'],
            additionalProperties: false,
            properties: {
              max_value: { type: 'number' },
              exact_timestamp: { type: 'integer', minimum: 0 },
            },
          },
          vibration: {
            type: 'object',
            required: ['max_value', 'exact_timestamp'],
            additionalProperties: false,
            properties: {
              max_value: { type: 'number' },
              exact_timestamp: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    },
  },
};

module.exports = { ingestSchema };
