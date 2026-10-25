/**
 * ============================================================================
 * ROUTE: KONTEN BELAJAR PUBLIK (/api/contents)
 * Menyediakan panduan, tips fokus, dan kutipan motivasi yang telah dipublikasikan
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// ----------------------------------------------------------------------------
// GET /api/contents
// Mengambil seluruh konten belajar berstatus 'published'
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { tipe } = req.query;
    let query = 'SELECT id, judul, isi, tipe, created_at FROM learning_contents WHERE status = "published"';
    const params = [];

    if (tipe) {
      query += ' AND tipe = ?';
      params.push(tipe);
    }

    query += ' ORDER BY id ASC';

    const [rows] = await pool.execute(query, params);

    return res.json({
      success: true,
      contents: rows
    });
  } catch (error) {
    console.error('[Contents Get Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat konten panduan dan tips belajar.' });
  }
});

module.exports = router;
