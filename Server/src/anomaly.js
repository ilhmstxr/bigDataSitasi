'use strict';

const axios = require('axios');
const config = require('./config');

/**
 * Func B - Rule Engine.
 * Mengembalikan daftar peringatan teks; array kosong artinya tidak ada anomali.
 *
 * @param {object} payload - payload mentah dari IoT
 * @returns {string[]} daftar peringatan
 */
function evaluateAnomalies(payload) {
  const alerts = [];
  const { peaks } = payload;

  if (peaks?.vibration?.max_value > config.thresholds.vibration) {
    alerts.push(
      `Getaran Kritis: ${peaks.vibration.max_value} pada timestamp ${peaks.vibration.exact_timestamp}`
    );
  }

  if (peaks?.temperature?.max_value > config.thresholds.temperature) {
    alerts.push(
      `Suhu Overheat: ${peaks.temperature.max_value}C pada timestamp ${peaks.temperature.exact_timestamp}`
    );
  }

  return alerts;
}

/**
 * Membangun pesan webhook sesuai format spesifikasi.
 */
function buildWebhookPayload(payload, alerts) {
  return {
    device: payload.device_id,
    waktu_jendela: `${payload.window_start} - ${payload.window_end}`,
    peringatan: alerts.join(' | '),
    raw_data: payload,
  };
}

/**
 * Tembak HTTP POST ke n8n webhook secara asynchronous (non-blocking).
 * Tidak boleh memblokir HTTP response utama ke IoT.
 *
 * @param {object} payload - payload asli IoT
 * @param {string[]} alerts - daftar peringatan teks
 * @param {import('fastify').FastifyBaseLogger} [logger]
 */
function fireWebhookAsync(payload, alerts, logger) {
  if (!alerts.length) return;
  if (!config.n8n.webhookUrl) {
    logger?.warn(
      { device: payload.device_id, alerts },
      'Anomali terdeteksi tapi N8N_WEBHOOK_URL belum dikonfigurasi'
    );
    return;
  }

  const body = buildWebhookPayload(payload, alerts);

  // Sengaja TANPA await — sesuai constraint Async non-blocking.
  axios
    .post(config.n8n.webhookUrl, body, {
      timeout: config.n8n.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
    })
    .then((res) => {
      logger?.info(
        { device: payload.device_id, status: res.status },
        'Webhook n8n terkirim'
      );
    })
    .catch((err) => {
      logger?.error(
        {
          device: payload.device_id,
          err: err.message,
          code: err.code,
        },
        'Gagal mengirim webhook n8n'
      );
    });
}

module.exports = {
  evaluateAnomalies,
  buildWebhookPayload,
  fireWebhookAsync,
};
