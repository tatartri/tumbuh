/**
 * ============================================================================
 * KONFIGURASI KONEKSI DATABASE MYSQL
 * Menggunakan mysql2/promise untuk pool koneksi asinkronus yang aman dan cepat
 * ============================================================================
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// Konfigurasi pool koneksi: Mendukung DATABASE_URL / MYSQL_URL (Cloud) atau variabel individual (Lokal / Railway)
let pool;
let dbConfig = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '8889', 10),
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || 'root',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'tumbuh_db',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  queueLimit: 0,
  charset: 'utf8mb4'
};

if (process.env.DATABASE_URL || process.env.MYSQL_URL) {
  const connectionUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  pool = mysql.createPool(connectionUrl);
} else {
  pool = mysql.createPool(dbConfig);
}

// Fungsi uji koneksi saat inisialisasi aplikasi
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`[Database] Terhubung ke MySQL ${dbConfig.host}:${dbConfig.port} (Database: ${dbConfig.database})`);
    connection.release();
    return true;
  } catch (error) {
    console.error('[Database Error] Gagal terhubung ke MySQL:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection
};
