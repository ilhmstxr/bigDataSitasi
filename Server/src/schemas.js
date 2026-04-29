'use strict';

/**
 * JSON Schema untuk validasi payload D7S Pseudo-Emulation dari IoT.
 * Reject 400 Bad Request bila tidak sesuai struktur ini.
 *
 * Kontrak ini sinkron dengan firmware ESP32 di Server/koneksi.cpp
 * (lihat juga Server/spesifikasitambahan.md bagian "Kontrak Data").
 */
const ingestSchema = {
  body: {
    type: 'object',
    required: [
      'device_id',
      'window_start',
      'window_end',
      'seismic_data',
      'climate_data',
    ],
    additionalProperties: false,
    properties: {
      device_id: {
        type: 'string',
        minLength: 1,
        maxLength: 50,
      },
      window_start: { type: 'integer', minimum: 0 },
      window_end: { type: 'integer', minimum: 0 },

      seismic_data: {
        type: 'object',
        required: ['si_value_kayser', 'pga_value_gal', 'flags'],
        additionalProperties: false,
        properties: {
          si_value_kayser: { type: 'number', minimum: 0 },
          pga_value_gal: { type: 'number', minimum: 0 },
          flags: {
            type: 'object',
            required: ['is_earthquake', 'is_structure_collapsing'],
            additionalProperties: false,
            properties: {
              is_earthquake: { type: 'boolean' },
              is_structure_collapsing: { type: 'boolean' },
            },
          },
        },
      },

      climate_data: {
        type: 'object',
        required: ['max_temperature', 'max_humidity'],
        additionalProperties: false,
        properties: {
          max_temperature: { type: 'number' },
          max_humidity: { type: 'number' },
        },
      },
    },
  },
};

module.exports = { ingestSchema };
