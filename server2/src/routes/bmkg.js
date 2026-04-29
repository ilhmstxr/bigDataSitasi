'use strict';

/**
 * GET /api/bmkg/autogempa
 *
 * Proxy + ekstraktor field minimum yang dibutuhkan oleh node Gemini di n8n
 * (sesuai server2/spesifikasi.md "API 1 BMKG"):
 *
 *   - coordinates  : "Lat,Lon" (string asli dari BMKG)
 *   - lat, lon     : float hasil parse
 *   - magnitude    : float
 *   - kedalaman_km : float (parsed dari "10 km")
 *
 * Field "raw" mempertahankan blok asli Infogempa.gempa untuk audit.
 *
 * Mengikuti syarat atribusi BMKG (header X-Source).
 *
 * Cache in-memory 30 detik dengan single-flight untuk menghormati BMKG.
 */

const axios = require('axios');
const config = require('../config');

const CACHE_TTL_MS = 30 * 1000;

let cached = null; // { payload, expiresAt }
let inflight = null; // Promise

function parseLatLon(coordStr) {
  if (typeof coordStr !== 'string') return { lat: null, lon: null };
  const parts = coordStr.split(',').map((s) => s.trim());
  if (parts.length !== 2) return { lat: null, lon: null };
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

function parseFloatLoose(val) {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  // Contoh: "10 km", "5.2"
  const m = String(val).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function buildPayload(rawJson) {
  const g = rawJson?.Infogempa?.gempa ?? null;
  const coordinates = g?.Coordinates ?? null;
  const { lat, lon } = parseLatLon(coordinates);
  return {
    status: 'ok',
    attribution: 'BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)',
    source: config.bmkg.autogempaUrl,
    fetched_at: new Date().toISOString(),
    extracted: {
      coordinates,
      lat,
      lon,
      magnitude: parseFloatLoose(g?.Magnitude),
      kedalaman_km: parseFloatLoose(g?.Kedalaman),
      wilayah: g?.Wilayah ?? null,
      datetime: g?.DateTime ?? null,
    },
    raw: g,
  };
}

async function fetchUpstream(logger) {
  try {
    const res = await axios.get(config.bmkg.autogempaUrl, {
      timeout: config.bmkg.timeoutMs,
      headers: { Accept: 'application/json' },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return { ok: true, payload: buildPayload(res.data) };
  } catch (err) {
    logger?.error(
      { err: err.message, code: err.code },
      'Gagal fetch BMKG autogempa'
    );
    return {
      ok: false,
      status: err.response?.status === 404 ? 404 : 502,
      message:
        err.response?.status === 404
          ? 'Sumber BMKG tidak ditemukan'
          : 'Gagal menjangkau server BMKG',
    };
  }
}

async function getCached(logger) {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { ok: true, payload: cached.payload, cacheState: 'HIT' };
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    const result = await fetchUpstream(logger);
    if (result.ok) {
      cached = { payload: result.payload, expiresAt: Date.now() + CACHE_TTL_MS };
      return { ok: true, payload: result.payload, cacheState: 'MISS' };
    }
    return { ok: false, ...result, cacheState: 'MISS' };
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function routes(fastify) {
  fastify.get('/api/bmkg/autogempa', async (request, reply) => {
    const result = await getCached(request.log);
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.status === 404 ? 'Not Found' : 'Bad Gateway',
        message: result.message,
      });
    }
    reply.header('X-Cache', result.cacheState);
    reply.header('Cache-Control', `public, max-age=${CACHE_TTL_MS / 1000}`);
    return reply.send(result.payload);
  });
}

module.exports = routes;
