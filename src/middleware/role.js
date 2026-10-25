/**
 * ============================================================================
 * MIDDLEWARE OTORISASI PERAN (ROLE-BASED AUTHORIZATION)
 * Memastikan hak akses admin divalidasi langsung di sisi server
 * Jangan pernah percaya role yang dikirimkan dari frontend!
 * ============================================================================
 */

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Silakan login terlebih dahulu untuk mengakses menu ini.'
    });
  }

  // Verifikasi role dari database pengguna, bukan dari client payload
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Anda tidak memiliki izin administrator untuk halaman ini.'
    });
  }

  next();
}

module.exports = {
  requireAdmin
};
