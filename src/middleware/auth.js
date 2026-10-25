/**
 * ============================================================================
 * MIDDLEWARE AUTENTIKASI SERVER-SIDE (JWT)
 * Memverifikasi token JWT dan memuat identitas pengguna dari database
 * ============================================================================
 */

const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

async function requireAuth(req, res, next) {
  try {
    let token = null;

    // 1. Periksa header Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      // 2. Periksa cookie 'token' jika ada
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak. Silakan masuk (login) terlebih dahulu.'
      });
    }

    // Verifikasi token dengan rahasia server
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ambil data user terkini dari database menggunakan prepared statement
    const [rows] = await pool.execute(
      'SELECT id, nama, email, role, status, avatar FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Akun pengguna tidak ditemukan.'
      });
    }

    const user = rows[0];

    // Periksa status akun
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Akun Anda sedang dinonaktifkan atau ditangguhkan. Hubungi admin.'
      });
    }

    // Simpan data user ke req untuk dipakai di route handler
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Sesi login telah berakhir. Silakan login kembali.'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Token autentikasi tidak valid.'
    });
  }
}

// Middleware opsional: jika ada token, masukkan data user. Jika tidak, tetap lanjut sebagai tamu.
async function optionalAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [rows] = await pool.execute(
        'SELECT id, nama, email, role, status, avatar FROM users WHERE id = ? AND status = "active" LIMIT 1',
        [decoded.id]
      );
      if (rows.length > 0) {
        req.user = rows[0];
      }
    }
  } catch (e) {
    // Abaikan error pada autentikasi opsional
  }
  next();
}

module.exports = {
  requireAuth,
  optionalAuth
};
