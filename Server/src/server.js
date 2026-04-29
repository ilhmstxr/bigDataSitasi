'use strict';

const Fastify = require('fastify');
const config = require('./config');
const db = require('./db');
const ingestRoutes = require('./routes/ingest');

function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss.l' },
            },
    },
    bodyLimit: 64 * 1024, // 64 KB sudah lebih dari cukup untuk payload kecil
  });

  // Healthcheck
  app.get('/health', async () => {
    let dbOk = false;
    try {
      dbOk = await db.ping();
    } catch (_) {
      dbOk = false;
    }
    return { status: 'ok', db: dbOk, ts: Math.floor(Date.now() / 1000) };
  });

  // Routes
  app.register(ingestRoutes);

  // 400 untuk error validasi schema
  app.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Payload tidak sesuai kontrak data',
        details: err.validation,
      });
    }
    request.log.error({ err: err.message }, 'Unhandled error');
    return reply
      .code(err.statusCode || 500)
      .send({ error: 'Internal Server Error', message: err.message });
  });

  return app;
}

async function start() {
  const app = buildApp();

  const shutdown = async (signal) => {
    app.log.info({ signal }, 'Shutdown signal diterima');
    try {
      await app.close();
      await db.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err: err.message }, 'Gagal shutdown bersih');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.server.port, host: config.server.host });
  } catch (err) {
    app.log.error({ err: err.message }, 'Gagal start server');
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildApp };
