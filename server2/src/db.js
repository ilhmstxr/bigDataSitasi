'use strict';

const mysql = require('mysql2/promise');
const config = require('./config');

/**
 * Single shared Connection Pool — wajib (lihat constraint spesifikasi
 * Server/spesifikasi.md). JANGAN createConnection per-request.
 */
const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: config.mysql.connectionLimit,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  namedPlaceholders: false,
});

async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

async function close() {
  await pool.end();
}

module.exports = { pool, ping, close };
