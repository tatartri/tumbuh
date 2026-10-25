/**
 * ============================================================================
 * ROUTE: DASHBOARD ADMINISTRATOR (/api/admin)
 * Membaca data agregat nyata dari MySQL, manajemen pengguna, pemantauan sesi,
 * dan manajemen konten panduan. Wajib hak akses server-side 'admin'.
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');

// Terapkan proteksi ganda: Autentikasi JWT + Otorisasi Role Admin
router.use(requireAuth, requireAdmin);

// ----------------------------------------------------------------------------
// GET /api/admin/stats
// Statistik agregat nyata langsung dari database MySQL (Bukan angka demo!)
// ----------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    // 1. Total Pengguna
    const [[usersCount]] = await pool.execute(
      'SELECT COUNT(*) AS total_users FROM users'
    );

    // 2. Total Pengguna Aktif
    const [[activeUsersCount]] = await pool.execute(
      'SELECT COUNT(*) AS active_users FROM users WHERE status = "active"'
    );

    // 3. Total Sesi Fokus yang Selesai
    const [[sessionsCount]] = await pool.execute(
      'SELECT COUNT(*) AS completed_sessions FROM focus_sessions WHERE status = "completed"'
    );

    // 4. Total Menit Belajar Seluruh Pengguna
    const [[minutesCount]] = await pool.execute(
      'SELECT COALESCE(SUM(ROUND(durasi_detik / 60)), 0) AS total_minutes FROM focus_sessions WHERE status = "completed"'
    );

    // 5. Total Refleksi Tersimpan
    const [[reflectionsCount]] = await pool.execute(
      'SELECT COUNT(*) AS total_reflections FROM reflections'
    );

    // 6. Distribusi Level Tanaman di Kebun
    const [plantLevels] = await pool.execute(
      'SELECT level_tanaman, COUNT(*) AS count FROM plant_progress GROUP BY level_tanaman ORDER BY level_tanaman ASC'
    );

    // 7. Sesi yang sedang berjalan saat ini
    const [[runningSessions]] = await pool.execute(
      'SELECT COUNT(*) AS running_now FROM focus_sessions WHERE status = "running"'
    );

    return res.json({
      success: true,
      stats: {
        total_users: usersCount.total_users,
        active_users: activeUsersCount.active_users,
        completed_sessions: sessionsCount.completed_sessions,
        total_minutes: minutesCount.total_minutes,
        total_reflections: reflectionsCount.total_reflections,
        running_sessions_now: runningSessions.running_now,
        plant_distribution: plantLevels
      }
    });
  } catch (error) {
    console.error('[Admin Stats Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data statistik administrator.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/admin/users
// Daftar seluruh pengguna terdaftar di MySQL
// ----------------------------------------------------------------------------
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT 
        u.id, u.nama, u.email, u.role, u.status, u.avatar, u.created_at,
        COALESCE(p.total_sesi, 0) AS total_sesi,
        COALESCE(p.total_durasi, 0) AS total_durasi,
        COALESCE(p.level_tanaman, 1) AS level_tanaman
       FROM users u
       LEFT JOIN plant_progress p ON u.id = p.user_id
       ORDER BY u.id DESC`
    );

    return res.json({
      success: true,
      users: rows
    });
  } catch (error) {
    console.error('[Admin Users Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat daftar pengguna.' });
  }
});

// ----------------------------------------------------------------------------
// PATCH /api/admin/users/:id/status
// Mengubah status akun pengguna (active / inactive / suspended)
// ----------------------------------------------------------------------------
router.patch('/users/:id/status', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { status } = req.body;

    const validStatuses = ['active', 'inactive', 'suspended'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status pengguna tidak valid.' });
    }

    // Mencegah admin menonaktifkan akunnya sendiri secara tidak sengaja
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Anda tidak dapat mengubah status akun Anda sendiri.' });
    }

    const [result] = await pool.execute(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, targetUserId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    }

    return res.json({
      success: true,
      message: `Status pengguna ID #${targetUserId} berhasil diubah menjadi: ${status}`
    });
  } catch (error) {
    console.error('[Admin Update User Status Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui status pengguna.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/admin/sessions
// Log sesi belajar terkini dari semua pengguna
// ----------------------------------------------------------------------------
router.get('/sessions', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT 
        f.id, f.user_id, u.nama AS user_nama, u.email AS user_email,
        f.target_belajar, f.durasi_detik, f.started_at, f.completed_at, f.status
       FROM focus_sessions f
       JOIN users u ON f.user_id = u.id
       ORDER BY f.id DESC
       LIMIT 30`
    );

    return res.json({
      success: true,
      sessions: rows
    });
  } catch (error) {
    console.error('[Admin Sessions Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat log sesi belajar.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/admin/reflections
// Riwayat refleksi seluruh pengguna untuk pemantauan kesehatan belajar
// ----------------------------------------------------------------------------
router.get('/reflections', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT 
        r.id, r.user_id, u.nama AS user_nama,
        r.target_belajar, r.pemicu_distraksi, r.perasaan, r.hal_baru, r.strategi, r.created_at
       FROM reflections r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.id DESC
       LIMIT 30`
    );

    const parsedRows = rows.map(r => {
      let distractions = [];
      try {
        distractions = typeof r.pemicu_distraksi === 'string' ? JSON.parse(r.pemicu_distraksi) : r.pemicu_distraksi;
      } catch (e) {}
      return {
        ...r,
        pemicu_distraksi: distractions
      };
    });

    return res.json({
      success: true,
      reflections: parsedRows
    });
  } catch (error) {
    console.error('[Admin Reflections Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat data refleksi.' });
  }
});

// ----------------------------------------------------------------------------
// CRUD KONTEN BELAJAR OLEH ADMIN (/api/admin/contents)
// ----------------------------------------------------------------------------

// 1. GET Daftar Semua Konten (termasuk draft & archived)
router.get('/contents', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.judul, c.isi, c.tipe, c.status, c.created_at, u.nama AS author_name 
       FROM learning_contents c
       LEFT JOIN users u ON c.created_by = u.id
       ORDER BY c.id DESC`
    );
    return res.json({ success: true, contents: rows });
  } catch (error) {
    console.error('[Admin Contents Get Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat konten edukasi.' });
  }
});

// 2. POST Tambah Konten Baru
router.post('/contents', async (req, res) => {
  try {
    const { judul, isi, tipe, status } = req.body;
    if (!judul || !isi) {
      return res.status(400).json({ success: false, message: 'Judul dan isi konten wajib diisi.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO learning_contents (judul, isi, tipe, status, created_by) VALUES (?, ?, ?, ?, ?)',
      [judul.trim(), isi.trim(), tipe || 'tip', status || 'published', req.user.id]
    );

    return res.status(201).json({
      success: true,
      message: 'Konten belajar berhasil ditambahkan!',
      content_id: result.insertId
    });
  } catch (error) {
    console.error('[Admin Content Create Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal menambahkan konten baru.' });
  }
});

// 3. DELETE Hapus Konten
router.delete('/contents/:id', async (req, res) => {
  try {
    const contentId = parseInt(req.params.id, 10);
    const [result] = await pool.execute(
      'DELETE FROM learning_contents WHERE id = ?',
      [contentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Konten tidak ditemukan.' });
    }

    return res.json({ success: true, message: 'Konten berhasil dihapus.' });
  } catch (error) {
    console.error('[Admin Content Delete Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus konten.' });
  }
});

module.exports = router;
