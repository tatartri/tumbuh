/**
 * ============================================================================
 * LOGIKA DASHBOARD ADMINISTRATOR (admin.js)
 * Terhubung langsung ke REST API Express & Database MySQL
 * Menampilkan metrik nyata, manajemen pengguna, log sesi, dan materi edukasi.
 * ============================================================================
 */

// State Admin Client
let currentAdmin = null;
let allUsersData = [];

// Helper untuk fetch dengan menyertakan token dari localStorage
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('tumbuh_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    if (url !== '/api/auth/login') {
      showAdminLoginModal();
    }
  }

  return { ok: response.ok, status: response.status, data };
}

// Tampilkan Toast Notifikasi Admin
function showToast(message) {
  const toast = document.getElementById('admin-toast');
  const text = document.getElementById('toast-text');
  if (!toast || !text) return;
  text.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Buka Modal Login Admin
function showAdminLoginModal() {
  const modal = document.getElementById('admin-login-modal');
  if (modal) modal.classList.remove('hidden');
}

// Tutup Modal Login Admin
function hideAdminLoginModal() {
  const modal = document.getElementById('admin-login-modal');
  if (modal) modal.classList.add('hidden');
}

// ----------------------------------------------------------------------------
// 1. CEK OTORISASI ADMIN SAAT HALAMAN DIMUAT
// ----------------------------------------------------------------------------
async function checkAdminAuth() {
  const res = await apiFetch('/api/auth/me');

  if (res.ok && res.data.user && res.data.user.role === 'admin') {
    currentAdmin = res.data.user;
    updateAdminHeader(currentAdmin);
    hideAdminLoginModal();
    loadDashboardData();
  } else {
    // Jika belum login atau bukan admin, munculkan modal login admin
    showAdminLoginModal();
    if (res.data.user && res.data.user.role !== 'admin') {
      const errEl = document.getElementById('admin-login-error');
      if (errEl) {
        errEl.textContent = 'Akun Anda bukan Administrator. Silakan login dengan akun admin.';
        errEl.classList.remove('hidden');
      }
    }
  }
}

function updateAdminHeader(user) {
  const nameEl = document.getElementById('admin-user-name');
  const avatarEl = document.getElementById('admin-user-avatar');
  if (nameEl) nameEl.textContent = user.nama;
  if (avatarEl) avatarEl.textContent = user.avatar || '🌟';
}

// ----------------------------------------------------------------------------
// 2. MUAT STATISTIK REAL-TIME DARI MYSQL (/api/admin/stats)
// ----------------------------------------------------------------------------
async function loadDashboardStats() {
  const res = await apiFetch('/api/admin/stats');
  if (!res.ok) return;

  const s = res.data.stats;
  document.getElementById('stat-total-users').textContent = s.total_users || 0;
  document.getElementById('stat-active-users').textContent = `${s.active_users || 0} akun aktif`;
  document.getElementById('stat-completed-sessions').textContent = s.completed_sessions || 0;
  document.getElementById('stat-running-sessions').textContent = `${s.running_sessions_now || 0} sesi aktif sekarang`;
  document.getElementById('stat-total-minutes').textContent = `${s.total_minutes || 0} m`;
  document.getElementById('stat-total-reflections').textContent = s.total_reflections || 0;
}

// ----------------------------------------------------------------------------
// 3. DAFTAR PENGGUNA (/api/admin/users)
// ----------------------------------------------------------------------------
async function loadUsersTable() {
  const tbody = document.getElementById('users-table-body');
  const res = await apiFetch('/api/admin/users');

  if (!res.ok) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-td">Gagal memuat data pengguna.</td></tr>';
    return;
  }

  allUsersData = res.data.users || [];
  renderUsersTable(allUsersData);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-td">Belum ada pengguna terdaftar.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isSelf = currentAdmin && currentAdmin.id === u.id;
    const dateFormatted = new Date(u.created_at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const statusBadge = `<span class="badge badge-${u.status}">${u.status}</span>`;
    const roleBadge = `<span class="badge badge-role-${u.role}">${u.role}</span>`;

    // Tombol Toggle Status
    const toggleTargetStatus = u.status === 'active' ? 'inactive' : 'active';
    const actionBtn = isSelf 
      ? '<span style="color:#A0AEC0; font-size:0.75rem;">(Akun Anda)</span>'
      : `<button class="btn-action-status" onclick="toggleUserStatus(${u.id}, '${toggleTargetStatus}')">
          ${u.status === 'active' ? '🔴 Nonaktifkan' : '🟢 Aktifkan'}
         </button>`;

    return `
      <tr>
        <td><strong>#${u.id}</strong></td>
        <td><span style="font-size:1.2rem; margin-right:4px;">${u.avatar || '🌱'}</span> ${escapeHtml(u.nama)}</td>
        <td><code>${escapeHtml(u.email)}</code></td>
        <td>${roleBadge}</td>
        <td><strong>${u.total_sesi || 0}</strong> sesi (${u.total_durasi || 0}m)</td>
        <td>Level ${u.level_tanaman || 1}</td>
        <td>${statusBadge}</td>
        <td>${dateFormatted}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

// Ubah Status Pengguna
window.toggleUserStatus = async function(userId, newStatus) {
  const confirmMsg = `Yakin ingin mengubah status pengguna #${userId} menjadi ${newStatus}?`;
  if (!confirm(confirmMsg)) return;

  const res = await apiFetch(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });

  if (res.ok) {
    showToast(res.data.message || 'Status berhasil diubah!');
    loadUsersTable();
    loadDashboardStats();
  } else {
    alert(res.data.message || 'Gagal mengubah status pengguna.');
  }
};

// ----------------------------------------------------------------------------
// 4. LOG SESI FOKUS (/api/admin/sessions)
// ----------------------------------------------------------------------------
async function loadSessionsTable() {
  const tbody = document.getElementById('sessions-table-body');
  const res = await apiFetch('/api/admin/sessions');

  if (!res.ok) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-td">Gagal memuat log sesi.</td></tr>';
    return;
  }

  const sessions = res.data.sessions || [];
  if (sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-td">Belum ada sesi fokus yang tercatat.</td></tr>';
    return;
  }

  tbody.innerHTML = sessions.map(s => {
    const minutes = Math.round(s.durasi_detik / 60);
    const startFmt = new Date(s.started_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    const endFmt = s.completed_at 
      ? new Date(s.completed_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
      : '-';

    return `
      <tr>
        <td><strong>#${s.id}</strong></td>
        <td><strong>${escapeHtml(s.user_nama)}</strong> <br><small style="color:#718096">${escapeHtml(s.user_email)}</small></td>
        <td>🎯 ${escapeHtml(s.target_belajar)}</td>
        <td>${minutes} menit (${s.durasi_detik}s)</td>
        <td>${startFmt}</td>
        <td>${endFmt}</td>
        <td><span class="badge badge-status-${s.status}">${s.status}</span></td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------------------------------
// 5. PEMANTAUAN REFLEKSI (/api/admin/reflections)
// ----------------------------------------------------------------------------
async function loadReflectionsTable() {
  const tbody = document.getElementById('reflections-table-body');
  const res = await apiFetch('/api/admin/reflections');

  if (!res.ok) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-td">Gagal memuat data refleksi.</td></tr>';
    return;
  }

  const reflections = res.data.reflections || [];
  if (reflections.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-td">Belum ada catatan refleksi yang tersimpan.</td></tr>';
    return;
  }

  const moodEmojis = {
    senang: '😃 Senang',
    tenang: '😊 Tenang',
    biasa: '😐 Biasa',
    lelah: '🥱 Lelah',
    sulit: '🤯 Sulit'
  };

  tbody.innerHTML = reflections.map(r => {
    const timeFmt = new Date(r.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    const distractionsHtml = (r.pemicu_distraksi || [])
      .map(d => `<span class="badge" style="background:#E2E8F0; margin:2px;">${escapeHtml(d)}</span>`)
      .join('');

    return `
      <tr>
        <td><strong>#${r.id}</strong></td>
        <td><strong>${escapeHtml(r.user_nama)}</strong></td>
        <td>${escapeHtml(r.target_belajar || '-')}</td>
        <td><strong>${moodEmojis[r.perasaan] || r.perasaan}</strong></td>
        <td>${distractionsHtml || '-'}</td>
        <td>${escapeHtml(r.strategi)}</td>
        <td>${timeFmt}</td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------------------------------
// 6. KONTEN EDUKASI CRUD (/api/admin/contents)
// ----------------------------------------------------------------------------
async function loadContentsList() {
  const container = document.getElementById('contents-list-container');
  const res = await apiFetch('/api/admin/contents');

  if (!res.ok) {
    container.innerHTML = '<p class="loading-text">Gagal memuat materi edukasi.</p>';
    return;
  }

  const contents = res.data.contents || [];
  if (contents.length === 0) {
    container.innerHTML = '<p class="loading-text">Belum ada materi atau tips yang dibuat.</p>';
    return;
  }

  container.innerHTML = contents.map(c => {
    return `
      <div class="admin-content-item">
        <div class="item-header">
          <h4>${escapeHtml(c.judul)}</h4>
          <div>
            <span class="badge" style="background:#DCEFE0; color:#477B62;">${c.tipe}</span>
            <span class="badge badge-${c.status}">${c.status}</span>
          </div>
        </div>
        <p class="item-body">${escapeHtml(c.isi)}</p>
        <button class="item-delete-btn" onclick="deleteContent(${c.id})">🗑️ Hapus Konten</button>
      </div>
    `;
  }).join('');
}

window.deleteContent = async function(contentId) {
  if (!confirm('Yakin ingin menghapus konten edukasi ini?')) return;
  const res = await apiFetch(`/api/admin/contents/${contentId}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Konten edukasi berhasil dihapus.');
    loadContentsList();
  } else {
    alert(res.data.message || 'Gagal menghapus konten.');
  }
};

// Muat Seluruh Komponen Dashboard
function loadDashboardData() {
  loadDashboardStats();
  loadUsersTable();
  loadSessionsTable();
  loadReflectionsTable();
  loadContentsList();
}

// Helper XSS Escape
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ----------------------------------------------------------------------------
// INISIALISASI EVENT LISTENERS
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // 1. Cek autentikasi awal
  checkAdminAuth();

  // 2. Tombol Segarkan Data
  const btnRefresh = document.getElementById('btn-refresh-stats');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadDashboardData();
      showToast('Data dashboard berhasil diperbarui!');
    });
  }

  // 3. Tab Navigasi Admin
  const tabBtns = document.querySelectorAll('.admin-nav-tabs .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(c => {
        if (c.id === targetTab) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
    });
  });

  // 4. Pencarian Pengguna Real-time
  const searchInput = document.getElementById('user-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = allUsersData.filter(u => 
        (u.nama && u.nama.toLowerCase().includes(q)) || 
        (u.email && u.email.toLowerCase().includes(q))
      );
      renderUsersTable(filtered);
    });
  }

  // 5. Submit Form Tambah Konten Baru
  const formContent = document.getElementById('form-add-content');
  if (formContent) {
    formContent.addEventListener('submit', async (e) => {
      e.preventDefault();
      const judul = document.getElementById('content-title').value;
      const tipe = document.getElementById('content-type').value;
      const status = document.getElementById('content-status').value;
      const isi = document.getElementById('content-body').value;

      const res = await apiFetch('/api/admin/contents', {
        method: 'POST',
        body: JSON.stringify({ judul, tipe, status, isi })
      });

      if (res.ok) {
        showToast('Konten edukasi baru berhasil disimpan!');
        formContent.reset();
        loadContentsList();
      } else {
        alert(res.data.message || 'Gagal menyimpan konten baru.');
      }
    });
  }

  // 6. Form Login Khusus Admin
  const formLogin = document.getElementById('form-admin-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('admin-login-email').value;
      const password = document.getElementById('admin-login-password').value;
      const errEl = document.getElementById('admin-login-error');

      errEl.classList.add('hidden');

      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (res.ok && res.data.user) {
        if (res.data.user.role !== 'admin') {
          errEl.textContent = 'Akun ini bukan administrator. Akses ditolak.';
          errEl.classList.remove('hidden');
          return;
        }

        // Simpan token ke localStorage
        localStorage.setItem('tumbuh_token', res.data.token);
        currentAdmin = res.data.user;
        updateAdminHeader(currentAdmin);
        hideAdminLoginModal();
        showToast(`Selamat datang Administrator ${currentAdmin.nama}!`);
        loadDashboardData();
      } else {
        errEl.textContent = res.data.message || 'Email atau kata sandi admin tidak cocok.';
        errEl.classList.remove('hidden');
      }
    });
  }

  // 7. Tombol Logout Admin
  const btnLogout = document.getElementById('btn-admin-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (confirm('Keluar dari portal admin?')) {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('tumbuh_token');
        currentAdmin = null;
        showToast('Anda telah keluar.');
        showAdminLoginModal();
      }
    });
  }
});
