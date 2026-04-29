'use strict';

/**
 * Migrasi idempoten untuk server2.
 * - Memastikan database (config.mysql.database) ada.
 * - Membuat tabel mitigasi_log jika belum ada.
 *
 * Tidak menyentuh tabel sensor_logs / seismic_logs (milik Server/).
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');

async function main() {
  // 1) Pastikan database ada (koneksi tanpa "database").
  const bootstrap = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    multipleStatements: true,
  });

  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\`
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
  } finally {
    await bootstrap.end();
  }

  // 2) Apply schema.sql ke database target.
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const conn = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log(
      `[server2/migrate] OK — schema diterapkan ke database "${config.mysql.database}".`
    );
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[server2/migrate] FAIL:', err.message);
  process.exit(1);
});
