'use strict';

/**
 * Plugin Fastify yang mendaftarkan 3 endpoint proxy ke Data Gempabumi
 * Terbuka BMKG (https://data.bmkg.go.id/gempabumi).
 *
 * Endpoint dipasang di prefix /api/bmkg :
 *   GET /api/bmkg/autogempa       -> Gempabumi Terbaru (1 entry)
 *   GET /api/bmkg/gempaterkini    -> 15 Gempabumi M 5.0+ terakhir
 *   GET /api/bmkg/gempadirasakan  -> 15 Gempabumi Dirasakan terakhir
 *
 * Mirror dari sample PHP di Server/bmkg/*.php.
 *
 * PERHATIAN: Wajib mencantumkan BMKG sebagai sumber data di UI konsumen.
 * Lihat Server/bmkg/README.md.
 */

const axios = require('axios');

const BMKG_BASE = 'https://data.bmkg.go.id/DataMKG/TEWS';
const HTTP_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 30 * 1000; // 30 detik

const SOURCES = {
  autogempa: `${BMKG_BASE}/autogempa.json`,
  gempaterkini: `${BMKG_BASE}/gempaterkini.json`,
  gempadirasakan: `${BMKG_BASE}/gempadirasakan.json`,
};

/**
 * In-memory TTL cache per `kind`.
 * Struktur: Map<kind, { payload, expiresAt, inflight }>.
 *
 * - `payload`     : objek respons siap pakai (sudah di-wrap).
 * - `expiresAt`   : epoch ms kapan cache kadaluarsa.
 * - `inflight`    : Promise fetch yang sedang berjalan untuk dedup
 *                   request paralel (single-flight).
 */
const cache = new Map();

/**
 * Bungkus respons agar konsisten dan mempertahankan atribusi BMKG.
 */
function wrap(kind, data) {
  return {
    status: 'ok',
    attribution: 'BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)',
    source: SOURCES[kind],
    fetched_at: new Date().toISOString(),
    data,
  };
}

/**
 * Normalisasi field `Infogempa.gempa` → object (autogempa) atau array.
 */
function extract(kind, raw) {
  const node = raw?.Infogempa?.gempa;
  if (kind === 'autogempa') {
    return node ?? null;
  }
  if (Array.isArray(node)) return node;
  return node ? [node] : [];
}

/**
 * Fetch mentah ke BMKG + error mapping.
 */
async function fetchBmkg(kind, logger) {
  try {
    const res = await axios.get(SOURCES[kind], {
      timeout: HTTP_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    logger?.error(
      { kind, err: err.message, code: err.code },
      'Gagal fetch BMKG'
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

/**
 * Ambil data BMKG via cache 30 detik dengan single-flight.
 * Mengembalikan { ok, payload?, status?, message?, cache: 'HIT'|'MISS'|'STALE' }.
 */
async function getCached(kind, logger) {
  const now = Date.now();
  const entry = cache.get(kind);

  // 1) Cache hit segar.
  if (entry && entry.payload && entry.expiresAt > now) {
    return { ok: true, payload: entry.payload, cache: 'HIT' };
  }

  // 2) Single-flight: kalau sudah ada fetch berjalan, tunggu yang itu.
  if (entry?.inflight) {
    return entry.inflight;
  }

  // 3) Miss / kadaluarsa → fetch baru.
  const inflight = (async () => {
    const result = await fetchBmkg(kind, logger);
    if (!result.ok) {
      // Jangan cache error; lepas inflight slot.
      cache.set(kind, { payload: entry?.payload ?? null, expiresAt: 0 });
      return {
        ok: false,
        status: result.status,
        message: result.message,
        cache: 'MISS',
      };
    }
    const payload = wrap(kind, extract(kind, result.data));
    cache.set(kind, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return { ok: true, payload, cache: 'MISS' };
  })();

  // Simpan promise inflight agar request paralel ikut menunggu hasil yang sama.
  cache.set(kind, { ...(entry ?? {}), inflight });
  try {
    return await inflight;
  } finally {
    // Bersihkan inflight setelah selesai (pertahankan payload/expiresAt baru).
    const updated = cache.get(kind) ?? {};
    delete updated.inflight;
    cache.set(kind, updated);
  }
}

/**
 * Bangun handler untuk satu kind agar tidak duplikasi.
 */
function makeHandler(kind) {
  return async (request, reply) => {
    const result = await getCached(kind, request.log);
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.status === 404 ? 'Not Found' : 'Bad Gateway',
        message: result.message,
      });
    }
    reply.header('X-Cache', result.cache);
    reply.header('Cache-Control', `public, max-age=${CACHE_TTL_MS / 1000}`);
    return reply.send(result.payload);
  };
}

async function bmkgRoutes(fastify) {
  fastify.get('/api/bmkg/autogempa', makeHandler('autogempa'));
  fastify.get('/api/bmkg/gempaterkini', makeHandler('gempaterkini'));
  fastify.get('/api/bmkg/gempadirasakan', makeHandler('gempadirasakan'));
}

module.exports = bmkgRoutes;
module.exports.__cache = cache; // exposed untuk keperluan test/inspeksi
