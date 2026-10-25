/**
 * ============================================================================
 * ROUTE: SESI FOKUS BELAJAR (/api/focus)
 * Menangani pencatatan timer fokus, validasi server-side anti-kecurangan,
 * dan pembaruan progres tanaman secara konsisten (anti-duplikat).
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// Helper: Menghitung level tanaman berdasarkan jumlah sesi sukses
function calculatePlantLevel(totalSessions) {
  if (totalSessions >= 15) return 5; // Pohon Dewasa Berbuah
  if (totalSessions >= 9) return 4;  // Pohon Berbunga
  if (totalSessions >= 5) return 3;  // Tanaman Muda
  if (totalSessions >= 2) return 2;  // Tunas Hijau
  return 1;                          // Benih Tidur
}

// ----------------------------------------------------------------------------
// POST /api/focus/start
// Memulai sesi fokus baru di database
// ----------------------------------------------------------------------------
router.post('/start', requireAuth, async (req, res) => {
  try {
    const { target_belajar, durasi_detik } = req.body;

    const target = (target_belajar && target_belajar.trim()) ? target_belajar.trim() : 'Belajar Mandiri';
    const duration = parseInt(durasi_detik, 10);

    if (isNaN(duration) || duration < 5) {
      return res.status(400).json({
        success: false,
        message: 'Durasi belajar minimal 5 detik.'
      });
    }

    // Batalkan sesi 'running' sebelumnya yang belum selesai jika ada
    await pool.execute(
      'UPDATE focus_sessions SET status = "cancelled" WHERE user_id = ? AND status = "running"',
      [req.user.id]
    );

    // Simpan sesi fokus baru
    const [result] = await pool.execute(
      'INSERT INTO focus_sessions (user_id, target_belajar, durasi_detik, started_at, status) VALUES (?, ?, ?, NOW(), "running")',
      [req.user.id, target, duration]
    );

    return res.status(201).json({
      success: true,
      message: 'Sesi fokus dimulai! Semangat belajar ya! 🌿',
      session_id: result.insertId,
      target_belajar: target,
      durasi_detik: duration,
      started_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Focus Start Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memulai sesi fokus di server.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/focus/complete
// Menyelesaikan sesi fokus dengan validasi ketat di sisi server
// Mencegah duplikasi dan memastikan waktu belajar benar-benar telah berlalu
// ----------------------------------------------------------------------------
router.post('/complete', requireAuth, async (req, res) => {
  const { session_id } = req.body;

  if (!session_id) {
    return res.status(400).json({
      success: false,
      message: 'ID sesi fokus wajib disertakan.'
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Kunci dan ambil baris sesi fokus milik user ini (FOR UPDATE)
    const [sessions] = await connection.execute(
      'SELECT id, user_id, target_belajar, durasi_detik, started_at, status FROM focus_sessions WHERE id = ? AND user_id = ? FOR UPDATE',
      [session_id, req.user.id]
    );

    if (sessions.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Sesi fokus tidak ditemukan atau Anda tidak memiliki akses ke sesi ini.'
      });
    }

    const session = sessions[0];

    // 2. Proteksi Request Duplikat: Jika sesi sudah pernah diselesaikan
    if (session.status === 'completed') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Sesi fokus ini sudah pernah diselesaikan. Permintaan duplikat ditolak.'
      });
    }

    if (session.status !== 'running') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Sesi fokus telah dibatalkan atau tidak aktif.'
      });
    }

    // 3. Validasi Waktu: Server memverifikasi bahwa timer benar-benar berjalan
    const startedTime = new Date(session.started_at).getTime();
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - startedTime) / 1000;
    
    // Toleransi latensi jaringan 5 detik (untuk durasi normal)
    // Sesi hanya dihitung selesai jika elapsedSeconds mencukupi
    const minRequiredSeconds = session.durasi_detik > 10 ? (session.durasi_detik - 5) : 3;

    if (elapsedSeconds < minRequiredSeconds) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Waktu belajar belum mencukupi durasi target. Sesi hanya sah ketika timer telah mencapai 00:00!'
      });
    }

    // 4. Perbarui status sesi fokus menjadi 'completed'
    await connection.execute(
      'UPDATE focus_sessions SET status = "completed", completed_at = NOW() WHERE id = ?',
      [session.id]
    );

    // 5. Perbarui plant_progress secara atomik dan konsisten
    const [plantRows] = await connection.execute(
      'SELECT id, total_sesi, total_durasi, level_tanaman FROM plant_progress WHERE user_id = ? FOR UPDATE',
      [req.user.id]
    );

    let newTotalSesi = 1;
    const sessionMinutes = Math.max(1, Math.round(session.durasi_detik / 60));
    let newTotalDurasi = sessionMinutes;

    if (plantRows.length > 0) {
      newTotalSesi = plantRows[0].total_sesi + 1;
      newTotalDurasi = plantRows[0].total_durasi + sessionMinutes;
    }

    const newLevel = calculatePlantLevel(newTotalSesi);

    if (plantRows.length > 0) {
      await connection.execute(
        'UPDATE plant_progress SET total_sesi = ?, total_durasi = ?, level_tanaman = ?, updated_at = NOW() WHERE user_id = ?',
        [newTotalSesi, newTotalDurasi, newLevel, req.user.id]
      );
    } else {
      await connection.execute(
        'INSERT INTO plant_progress (user_id, total_sesi, total_durasi, level_tanaman) VALUES (?, ?, ?, ?)',
        [req.user.id, newTotalSesi, newTotalDurasi, newLevel]
      );
    }

    await connection.commit();

    return res.json({
      success: true,
      message: 'Hebat sekali! Sesi fokus berhasil diverifikasi dan diselesaikan! 🎉',
      session: {
        id: session.id,
        target_belajar: session.target_belajar,
        durasi_detik: session.durasi_detik,
        status: 'completed'
      },
      plant_progress: {
        total_sesi: newTotalSesi,
        total_durasi: newTotalDurasi,
        level_tanaman: newLevel
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('[Focus Complete Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyelesaikan sesi fokus pada server.' });
  } finally {
    connection.release();
  }
});

// ----------------------------------------------------------------------------
// POST /api/focus/cancel
// Membatalkan sesi fokus yang sedang berjalan
// ----------------------------------------------------------------------------
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (session_id) {
      await pool.execute(
        'UPDATE focus_sessions SET status = "cancelled" WHERE id = ? AND user_id = ? AND status = "running"',
        [session_id, req.user.id]
      );
    } else {
      await pool.execute(
        'UPDATE focus_sessions SET status = "cancelled" WHERE user_id = ? AND status = "running"',
        [req.user.id]
      );
    }
    return res.json({ success: true, message: 'Sesi belajar dibatalkan.' });
  } catch (error) {
    console.error('[Focus Cancel Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal membatalkan sesi fokus.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/focus/history
// Riwayat sesi fokus pengguna
// ----------------------------------------------------------------------------
router.get('/history', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, target_belajar, durasi_detik, started_at, completed_at, status FROM focus_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 20',
      [req.user.id]
    );

    return res.json({
      success: true,
      sessions: rows
    });
  } catch (error) {
    console.error('[Focus History Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat riwayat sesi fokus.' });
  }
});

module.exports = router;
