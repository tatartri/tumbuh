/**
 * ============================================================================
 * ROUTE: JURNAL REFLEKSI (/api/reflections)
 * Menyimpan catatan refleksi belajar anak, menganalisis gangguan fokus,
 * dan menyediakan riwayat refleksi yang tersimpan di MySQL.
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ----------------------------------------------------------------------------
// POST /api/reflections
// Menyimpan refleksi belajar baru
// ----------------------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  try {
    const { focus_session_id, target_belajar, perasaan, pemicu_distraksi, hal_baru, strategi } = req.body;

    // Validasi field wajib
    if (!target_belajar || !target_belajar.trim()) {
      return res.status(400).json({ success: false, message: 'Target atau materi belajar wajib diisi.' });
    }
    if (!perasaan || !perasaan.trim()) {
      return res.status(400).json({ success: false, message: 'Pilih salah satu ekspresi perasaanmu saat belajar.' });
    }
    if (!strategi || !strategi.trim()) {
      return res.status(400).json({ success: false, message: 'Tuliskan ide atau strategi untuk sesi berikutnya.' });
    }

    // Pastikan pemicu_distraksi dalam bentuk array JSON
    let distractionsJson = JSON.stringify(['Tidak Ada (Fokus Penuh!)']);
    if (Array.isArray(pemicu_distraksi) && pemicu_distraksi.length > 0) {
      distractionsJson = JSON.stringify(pemicu_distraksi);
    } else if (typeof pemicu_distraksi === 'string' && pemicu_distraksi.trim()) {
      distractionsJson = JSON.stringify([pemicu_distraksi.trim()]);
    }

    // Validasi opsional focus_session_id milik user
    let validSessionId = null;
    if (focus_session_id) {
      const [sessionRows] = await pool.execute(
        'SELECT id FROM focus_sessions WHERE id = ? AND user_id = ? LIMIT 1',
        [focus_session_id, req.user.id]
      );
      if (sessionRows.length > 0) {
        validSessionId = sessionRows[0].id;
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO reflections 
        (user_id, focus_session_id, target_belajar, pemicu_distraksi, perasaan, hal_baru, strategi) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        validSessionId,
        target_belajar.trim(),
        distractionsJson,
        perasaan.trim(),
        hal_baru ? hal_baru.trim() : null,
        strategi.trim()
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Jurnal refleksi berhasil disimpan ke kebun belajarmu! 🌟',
      reflection_id: result.insertId
    });
  } catch (error) {
    console.error('[Reflection Create Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan catatan refleksi ke database.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/reflections
// Mengambil seluruh riwayat refleksi milik pengguna yang login
// ----------------------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, focus_session_id, target_belajar, pemicu_distraksi, perasaan, hal_baru, strategi, created_at 
       FROM reflections 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.id]
    );

    // Parse JSON distraksi
    const reflections = rows.map(r => {
      let parsedDistractions = [];
      try {
        parsedDistractions = typeof r.pemicu_distraksi === 'string' 
          ? JSON.parse(r.pemicu_distraksi) 
          : r.pemicu_distraksi;
      } catch (e) {
        parsedDistractions = [r.pemicu_distraksi];
      }
      return {
        ...r,
        pemicu_distraksi: parsedDistractions
      };
    });

    return res.json({
      success: true,
      reflections
    });
  } catch (error) {
    console.error('[Reflection List Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat riwayat refleksi.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/reflections/summary
// Analisis statistik distraksi dan persebaran perasaan khusus pengguna ini
// ----------------------------------------------------------------------------
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT pemicu_distraksi, perasaan FROM reflections WHERE user_id = ?',
      [req.user.id]
    );

    const distractionCounts = {};
    const moodCounts = { senang: 0, tenang: 0, biasa: 0, lelah: 0, sulit: 0 };

    rows.forEach(r => {
      if (r.perasaan && moodCounts[r.perasaan] !== undefined) {
        moodCounts[r.perasaan]++;
      }

      let tags = [];
      try {
        tags = typeof r.pemicu_distraksi === 'string' ? JSON.parse(r.pemicu_distraksi) : r.pemicu_distraksi;
      } catch (e) {}

      if (Array.isArray(tags)) {
        tags.forEach(t => {
          distractionCounts[t] = (distractionCounts[t] || 0) + 1;
        });
      }
    });

    return res.json({
      success: true,
      total_reflections: rows.length,
      distractions: distractionCounts,
      moods: moodCounts
    });
  } catch (error) {
    console.error('[Reflection Summary Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat ringkasan refleksi.' });
  }
});

// ----------------------------------------------------------------------------
// DELETE /api/reflections/:id
// Menghapus satu entri refleksi milik pengguna
// ----------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const reflectionId = parseInt(req.params.id, 10);
    if (isNaN(reflectionId)) {
      return res.status(400).json({ success: false, message: 'ID refleksi tidak valid.' });
    }

    const [result] = await pool.execute(
      'DELETE FROM reflections WHERE id = ? AND user_id = ?',
      [reflectionId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Refleksi tidak ditemukan atau tidak memiliki hak akses.' });
    }

    return res.json({ success: true, message: 'Catatan refleksi berhasil dihapus.' });
  } catch (error) {
    console.error('[Reflection Delete Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus catatan refleksi.' });
  }
});

module.exports = router;
