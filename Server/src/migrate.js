'use strict';

/**
 * Migrasi sederhana: jalankan setiap statement dari src/schema.sql.
 * Idempoten — aman dijalankan berulang.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');

async function main() {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');

  // Pisahkan per statement (sederhana: pakai semicolon di akhir baris).
  // Buang komentar baris ('-- ...') sebelum filter, agar statement yang
  // didahului komentar tetap dieksekusi.
  const statements = raw
    .split(/;\s*$/m)
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((s) => s.length > 0);

  // Connect TANPA database supaya bisa CREATE DATABASE bila belum ada.
  const conn = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    multipleStatements: false,
  });

  try {
    for (const stmt of statements) {
      console.log('→', stmt.split('\n')[0].slice(0, 80), '...');
      await conn.query(stmt);
    }
    console.log('\n✓ Migrasi selesai.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('✗ Migrasi gagal:', err.message);
  process.exit(1);
});
