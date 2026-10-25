/**
 * ============================================================================
 * ROUTE: AUTENTIKASI PENGGUNA (/api/auth)
 * Menangani Registrasi, Login, Profil User Terkini, dan Logout
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// Helper: Buat token JWT
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ----------------------------------------------------------------------------
// POST /api/auth/register
// Mendaftarkan akun baru untuk anak / orang tua
// ----------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { nama, email, password, avatar } = req.body;

    // Validasi input
    if (!nama || nama.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Nama harus diisi minimal 2 karakter.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Format alamat email tidak valid.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Kata sandi minimal 6 karakter demi keamanan.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanNama = nama.trim();
    const chosenAvatar = avatar || '🌱';

    // Periksa apakah email sudah terdaftar
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Alamat email ini sudah terdaftar. Silakan login atau gunakan email lain.'
      });
    }

    // Hash password dengan bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Gunakan transaksi untuk menjamin user + plant_progress terbuat bersamaan
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Selalu daftarkan dengan role 'user', jangan pernah percaya input role dari client!
      const [insertResult] = await connection.execute(
        'INSERT INTO users (nama, email, password_hash, role, status, avatar) VALUES (?, ?, ?, "user", "active", ?)',
        [cleanNama, cleanEmail, passwordHash, chosenAvatar]
      );

      const newUserId = insertResult.insertId;

      // Buat status awal di plant_progress
      await connection.execute(
        'INSERT INTO plant_progress (user_id, total_sesi, total_durasi, level_tanaman) VALUES (?, 0, 0, 1)',
        [newUserId]
      );

      await connection.commit();

      const newUser = {
        id: newUserId,
        nama: cleanNama,
        email: cleanEmail,
        role: 'user',
        avatar: chosenAvatar,
        plant_progress: {
          total_sesi: 0,
          total_durasi: 0,
          level_tanaman: 1
        }
      };

      const token = generateToken(newUser);

      // Set cookie httpOnly untuk keamanan
      res.cookie('token', token, {
        httpOnly: true,
        secure: false, // false agar bekerja di HTTP (LAN/mobile)
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 hari
      });

      return res.status(201).json({
        success: true,
        message: 'Pendaftaran akun berhasil! Selamat datang di TUMBUH!',
        token,
        user: newUser
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('[Auth Register Error]:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat pendaftaran akun.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/auth/login
// Masuk ke akun
// ----------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan kata sandi wajib diisi.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Ambil data user
    const [rows] = await pool.execute(
      'SELECT id, nama, email, password_hash, role, status, avatar FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email atau kata sandi tidak sesuai.'
      });
    }

    const user = rows[0];

    // Periksa status akun
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Akun Anda sedang dinonaktifkan atau ditangguhkan. Silakan hubungi admin.'
      });
    }

    // Bandingkan kata sandi
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email atau kata sandi tidak sesuai.'
      });
    }

    // Ambil progres tanaman
    const [plantRows] = await pool.execute(
      'SELECT total_sesi, total_durasi, level_tanaman FROM plant_progress WHERE user_id = ? LIMIT 1',
      [user.id]
    );

    const plantProgress = plantRows.length > 0 ? plantRows[0] : { total_sesi: 0, total_durasi: 0, level_tanaman: 1 };

    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // false agar bekerja di HTTP (LAN/mobile)
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const userResponse = {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      plant_progress: plantProgress
    };

    return res.json({
      success: true,
      message: `Selamat datang kembali, ${user.nama}! 🌱`,
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('[Auth Login Error]:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat proses masuk.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/auth/me
// Mendapatkan data akun terkini yang sedang login
// ----------------------------------------------------------------------------
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [plantRows] = await pool.execute(
      'SELECT total_sesi, total_durasi, level_tanaman, updated_at FROM plant_progress WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );

    const plantProgress = plantRows.length > 0 ? plantRows[0] : { total_sesi: 0, total_durasi: 0, level_tanaman: 1 };

    return res.json({
      success: true,
      user: {
        id: req.user.id,
        nama: req.user.nama,
        email: req.user.email,
        role: req.user.role,
        avatar: req.user.avatar,
        status: req.user.status,
        plant_progress: plantProgress
      }
    });
  } catch (error) {
    console.error('[Auth Me Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat profil pengguna.' });
  }
});

// ----------------------------------------------------------------------------
// PATCH /api/auth/profile
// Mengubah nama panggilan atau avatar anak
// ----------------------------------------------------------------------------
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const { nama, avatar } = req.body;
    const updates = [];
    const params = [];

    if (nama && nama.trim().length >= 2) {
      updates.push('nama = ?');
      params.push(nama.trim());
    }
    if (avatar) {
      updates.push('avatar = ?');
      params.push(avatar);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data profil yang diubah.' });
    }

    params.push(req.user.id);
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return res.json({
      success: true,
      message: 'Profil berhasil diperbarui!'
    });
  } catch (error) {
    console.error('[Auth Update Profile Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui profil pengguna.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/auth/logout
// Keluar dari sesi
// ----------------------------------------------------------------------------
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({
    success: true,
    message: 'Sampai jumpa lagi! Tetap semangat belajar ya! 🌱'
  });
});

module.exports = router;
