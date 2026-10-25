/**
 * ============================================================================
 * TUMBUH - Belajar & Fokus Seru untuk Anak
 * File Logika Utama (script.js)
 * 
 * Fitur:
 * 1. Manajemen Navigasi 7 Halaman (SPA)
 * 2. Timer Pomodoro Ramah Anak (15 & 25 menit, Start, Pause, Resume, Reset)
 * 3. Kebun Pertumbuhan & Evolusi Tanaman (Benih -> Tunas -> Tanaman -> Bunga -> Pohon)
 * 4. Formulir Jurnal Refleksi dengan Validasi & localStorage
 * 5. Jeda Aktif (Latihan Napas Panduan, Timer Mata 20-20-20, Peregangan)
 * 6. Evaluasi Perkembangan (Riwayat Refleksi, Grafik Distraksi, Total Sesi)
 * 7. Efek Audio Web Audio API & Efek Konfeti Canvas
 * ============================================================================
 */

// ==========================================
// 1. DATA STATE APLIKASI & LOCALSTORAGE
// ==========================================

// Kunci penyimpanan localStorage
const STORAGE_KEYS = {
  USER: 'tumbuh_user',
  STATS: 'tumbuh_stats',
  REFLECTIONS: 'tumbuh_reflections',
  SETTINGS: 'tumbuh_settings'
};

// Data default anak & kebun
let appState = {
  user: {
    name: 'Pembelajar Cilik',
    avatar: '🌱'
  },
  stats: {
    completedSessions: 0,
    totalMinutes: 0
  },
  reflections: [],
  settings: {
    soundEnabled: true,
    musicEnabled: false,
    musicTrack: 'kotak_musik',
    musicVolume: 60,
    autoPlayOnStart: true
  }
};

// State Timer Berjalan
let timerState = {
  durationSeconds: 15 * 60, // Default 15 menit
  selectedMinutes: 15,
  remainingSeconds: 15 * 60,
  isRunning: false,
  isPaused: false,
  intervalId: null,
  currentTarget: '',
  sessionId: null,                // ID sesi aktif di database MySQL
  lastCompletedSessionId: null   // ID sesi yang baru selesai untuk dihubungkan ke refleksi
};

// State Autentikasi & Integrasi REST API MySQL
let authState = {
  isLoggedIn: false,
  token: localStorage.getItem('tumbuh_token') || null,
  currentUser: null
};

// Helper Komunikasi REST API ke Backend Express & MySQL
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('tumbuh_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.warn(`[API Network Error pada ${endpoint}]:`, err);
    return { ok: false, status: 0, data: { message: 'Koneksi ke backend server gagal.' } };
  }
}

// Sinkronisasi status akun & data kebun dengan MySQL
async function syncWithServer() {
  const token = localStorage.getItem('tumbuh_token');
  const badgeEl = document.getElementById('sidebar-db-badge');
  const loginBtn = document.getElementById('btn-show-auth-modal');
  const logoutBtn = document.getElementById('btn-user-logout');
  const adminLink = document.getElementById('link-admin-portal');

  if (!token) {
    authState.isLoggedIn = false;
    authState.currentUser = null;
    if (badgeEl) {
      badgeEl.textContent = 'Mode Tamu (Offline)';
      badgeEl.style.backgroundColor = '#EDF2F7';
      badgeEl.style.color = '#718096';
    }
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (adminLink) adminLink.classList.add('hidden');
    return;
  }

  const res = await apiFetch('/api/auth/me');
  if (res.ok && res.data.user) {
    authState.isLoggedIn = true;
    authState.currentUser = res.data.user;

    // Perbarui state lokal dengan data dari MySQL
    appState.user.name = res.data.user.nama;
    appState.user.avatar = res.data.user.avatar || '🌱';
    appState.user.role = res.data.user.role;

    if (res.data.user.plant_progress) {
      appState.stats.completedSessions = res.data.user.plant_progress.total_sesi;
      appState.stats.totalMinutes = res.data.user.plant_progress.total_durasi;
    }

    if (badgeEl) {
      badgeEl.textContent = 'Tersambung MySQL 🟢';
      badgeEl.style.backgroundColor = '#C6F6D5';
      badgeEl.style.color = '#22543D';
    }
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    // Tampilkan link admin jika user memiliki role admin
    if (adminLink) {
      if (res.data.user.role === 'admin') {
        adminLink.classList.remove('hidden');
      } else {
        adminLink.classList.add('hidden');
      }
    }

    // Ambil riwayat refleksi dari MySQL
    fetchServerReflections();

    // Render ulang tampilan dengan data MySQL
    updateSidebarProfile();
    renderHomeView();
    renderGardenView();
  } else {
    // Token kadaluarsa atau tidak valid
    localStorage.removeItem('tumbuh_token');
    authState.isLoggedIn = false;
    if (badgeEl) {
      badgeEl.textContent = 'Sesi Berakhir (Offline)';
    }
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (adminLink) adminLink.classList.add('hidden');
  }
}

// Ambil riwayat refleksi dari database MySQL
async function fetchServerReflections() {
  if (!authState.isLoggedIn) return;
  const res = await apiFetch('/api/reflections');
  if (res.ok && Array.isArray(res.data.reflections)) {
    // Format agar selaras dengan render kartu evaluasi
    appState.reflections = res.data.reflections.map(r => ({
      id: r.id,
      date: new Date(r.created_at).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      target: r.target_belajar,
      mood: r.perasaan,
      distractions: r.pemicu_distraksi,
      insight: r.hal_baru,
      strategy: r.strategi
    }));
    saveToStorage();
    renderEvaluationView();
  }
}

// State Jeda Napas
let breathingState = {
  isActive: false,
  intervalId: null,
  stepIndex: 0,
  secondsRemaining: 4
};

// State Timer Mata
let eyeTimerState = {
  seconds: 20,
  intervalId: null
};

// Definisi Tahapan Pertumbuhan Tanaman
const PLANT_STAGES = [
  {
    level: 1,
    name: 'Benih Tidur',
    minSessions: 0,
    maxSessions: 1,
    title: 'Benih Lucu yang Nyenyak',
    story: 'Benih ini terkubur hangat di dalam tanah sage yang subur. Dia menanti siraman fokus darimu agar bisa bertunas!',
    badge: 'Tahap 1: Benih',
    icon: '🌰'
  },
  {
    level: 2,
    name: 'Tunas Hijau',
    minSessions: 2,
    maxSessions: 4,
    title: 'Tunas Mungil yang Berani',
    story: 'Hore! Dua helai daun hijau segar mulai menyembul ke atas tanah menyapa sinar matahari pagi!',
    badge: 'Tahap 2: Tunas',
    icon: '🌱'
  },
  {
    level: 3,
    name: 'Tanaman Muda',
    minSessions: 5,
    maxSessions: 8,
    title: 'Tanaman Muda yang Tegak',
    story: 'Batangnya makin kokoh dan dedaunannya makin rimbun berkat disiplin belajarmu yang luar biasa!',
    badge: 'Tahap 3: Tanaman Muda',
    icon: '🌿'
  },
  {
    level: 4,
    name: 'Pohon Berbunga',
    minSessions: 9,
    maxSessions: 14,
    title: 'Bunga Mekar Semerbak',
    story: 'Kuntum-kuntum bunga indah mulai mekar harum mewangi. Kebiasaan fokusmu semakin kuat setiap hari!',
    badge: 'Tahap 4: Berbunga',
    icon: '🌸'
  },
  {
    level: 5,
    name: 'Pohon Dewasa Berbuah',
    minSessions: 15,
    maxSessions: Infinity,
    title: 'Pohon Rindang Penuh Buah',
    story: 'Luar biasa! Pohonmu kini menjadi pohon kebijaksanaan yang rindang, berbuah manis, dan menaungi banyak sahabat!',
    badge: 'Tahap 5: Pohon Dewasa',
    icon: '🌳'
  }
];

// Daftar Lencana Prestasi Belajar
const BADGES_LIST = [
  { id: 'first_step', name: 'Langkah Pertama', icon: '🌱', desc: 'Selesaikan 1 sesi fokus belajar pertama.', req: (s) => s.completedSessions >= 1 },
  { id: 'sprout_born', name: 'Tunas Harapan', icon: '🌿', desc: 'Raih Level 2 di Kebun Pertumbuhan.', req: (s) => s.completedSessions >= 2 },
  { id: 'focus_hero', name: 'Ksatria Fokus', icon: '⭐', desc: 'Selesaikan 5 sesi belajar penuh.', req: (s) => s.completedSessions >= 5 },
  { id: 'flowering', name: 'Bunga Kemenangan', icon: '🌸', desc: 'Tumbuhkan tanaman hingga berbunga.', req: (s) => s.completedSessions >= 9 },
  { id: 'garden_master', name: 'Raja Kebun Belajar', icon: '👑', desc: 'Capai level pohon dewasa (15 sesi).', req: (s) => s.completedSessions >= 15 },
  { id: 'first_reflection', name: 'Pena Refleksi', icon: '📝', desc: 'Tulis dan simpan 1 catatan refleksi.', req: (s, r) => r.length >= 1 },
  { id: 'mindful_child', name: 'Anak Bijaksana', icon: '🧠', desc: 'Simpan 3 catatan refleksi belajar.', req: (s, r) => r.length >= 3 }
];

// ==========================================
// 2. SISTEM SUARA (WEB AUDIO API)
// Ramah lingkungan, tanpa butuh file MP3 eksternal
// ==========================================
class SoundFX {
  constructor() {
    this.audioCtx = null;
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playPop() {
    if (!appState.settings.soundEnabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.08);
    } catch (e) {
      console.warn('Audio not allowed yet:', e);
    }
  }

  playWaterDrop() {
    if (!appState.settings.soundEnabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, this.audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.2);
    } catch (e) {}
  }

  playSuccessChime() {
    if (!appState.settings.soundEnabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // Do, Mi, Sol, Do tinggi
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const startTime = this.audioCtx.currentTime + (idx * 0.12);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.25, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.6);
      });
    } catch (e) {}
  }
}

const sounds = new SoundFX();

// ==========================================
// 2B. SISTEM PEMUTAR MUSIK & SUARA ALAM
// Menggunakan Web Audio API Synthesizer mandiri
// ==========================================
class MusicPlayer {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.currentTrack = 'kotak_musik';
    this.volume = 0.6; // Rentang 0 sampai 1
    this.loopTimer = null;
    this.activeNodes = [];
    this.melodyStep = 0;
  }

  initContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    if (!this.masterGain && this.audioCtx) {
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume * 0.45, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);
    }
  }

  setVolume(percent) {
    this.volume = Math.max(0, Math.min(1, percent / 100));
    appState.settings.musicVolume = percent;
    saveToStorage();
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.45, this.audioCtx.currentTime, 0.05);
    }
    syncVolumeSliders(percent);
  }

  setTrack(trackKey) {
    if (this.currentTrack === trackKey && this.isPlaying) return;
    this.currentTrack = trackKey;
    appState.settings.musicTrack = trackKey;
    saveToStorage();

    updateMusicUI();

    if (this.isPlaying) {
      this.stop();
      if (trackKey !== 'hening') {
        this.play();
      }
    }
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      if (this.currentTrack === 'hening') {
        this.setTrack('kotak_musik');
      }
      this.play();
    }
  }

  play() {
    if (this.currentTrack === 'hening') {
      showToast('Pilih lagu atau suara alam terlebih dahulu ya! 🎵', '🎶');
      return;
    }
    this.initContext();
    if (!this.audioCtx) return;
    this.stopNodes();

    this.isPlaying = true;
    appState.settings.musicEnabled = true;

    if (this.currentTrack === 'kotak_musik') {
      this.startMusicBox();
    } else if (this.currentTrack === 'hujan') {
      this.startRain();
    } else if (this.currentTrack === 'burung') {
      this.startForestBirds();
    } else if (this.currentTrack === 'sungai') {
      this.startRiver();
    } else if (this.currentTrack === 'zen') {
      this.startZenPad();
    }

    updateMusicUI();
    showToast(`Memutar: ${this.getTrackTitle(this.currentTrack)}`, '🎵');
  }

  stop() {
    this.isPlaying = false;
    appState.settings.musicEnabled = false;
    this.stopNodes();
    updateMusicUI();
  }

  stopNodes() {
    clearInterval(this.loopTimer);
    this.loopTimer = null;
    this.activeNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (e) {}
    });
    this.activeNodes = [];
  }

  getTrackTitle(trackKey) {
    const titles = {
      kotak_musik: 'Kotak Musik Ajaib',
      hujan: 'Hujan di Daun',
      burung: 'Kicau Burung Rimba',
      sungai: 'Sungai Damai',
      zen: 'Dengungan 432Hz',
      hening: 'Ruang Hening'
    };
    return titles[trackKey] || 'Musik Belajar';
  }

  // --- 1. TRACK: KOTAK MUSIK AJAIB (Melodi Kalimba Santai) ---
  startMusicBox() {
    const notes = [
      523.25, 659.25, 783.99, 659.25,
      880.00, 783.99, 659.25, 523.25,
      587.33, 659.25, 523.25, 392.00,
      440.00, 523.25, 587.33, 523.25,
      659.25, 783.99, 880.00, 1046.50,
      880.00, 783.99, 659.25, 587.33,
      523.25, 659.25, 783.99, 523.25,
      440.00, 392.00, 440.00, 523.25
    ];

    this.melodyStep = 0;
    const playNote = () => {
      if (!this.isPlaying) return;
      const freq = notes[this.melodyStep % notes.length];
      this.melodyStep++;

      const osc = this.audioCtx.createOscillator();
      const noteGain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.value = 2400;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      const now = this.audioCtx.currentTime;
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(0.18, now + 0.008);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

      const oscHarmonic = this.audioCtx.createOscillator();
      const harmGain = this.audioCtx.createGain();
      oscHarmonic.type = 'triangle';
      oscHarmonic.frequency.setValueAtTime(freq * 2, now);
      harmGain.gain.setValueAtTime(0.04, now);
      harmGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      osc.connect(filter);
      oscHarmonic.connect(harmGain);
      harmGain.connect(filter);

      filter.connect(noteGain);
      noteGain.connect(this.masterGain);

      osc.start(now);
      oscHarmonic.start(now);
      osc.stop(now + 1.4);
      oscHarmonic.stop(now + 0.5);
    };

    playNote();
    this.loopTimer = setInterval(playNote, 480);
  }

  // --- 2. TRACK: HUJAN DI DAUN (Gentle Rain) ---
  startRain() {
    const bufferSize = this.audioCtx.sampleRate * 2;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
    }

    const whiteNoise = this.audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;

    const rainGain = this.audioCtx.createGain();
    rainGain.gain.setValueAtTime(0.22, this.audioCtx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(this.masterGain);

    whiteNoise.start();
    this.activeNodes.push(whiteNoise, filter, rainGain);

    this.loopTimer = setInterval(() => {
      if (!this.isPlaying) return;
      if (Math.random() > 0.4) {
        const dropFreq = 700 + Math.random() * 800;
        const dropOsc = this.audioCtx.createOscillator();
        const dropGain = this.audioCtx.createGain();
        dropOsc.type = 'sine';
        dropOsc.frequency.setValueAtTime(dropFreq, this.audioCtx.currentTime);
        dropOsc.frequency.exponentialRampToValueAtTime(dropFreq * 1.6, this.audioCtx.currentTime + 0.08);

        dropGain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
        dropGain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.12);

        dropOsc.connect(dropGain);
        dropGain.connect(this.masterGain);
        dropOsc.start();
        dropOsc.stop(this.audioCtx.currentTime + 0.12);
      }
    }, 600);
  }

  // --- 3. TRACK: KICAU BURUNG RIMBA (Forest Birds) ---
  startForestBirds() {
    const bufferSize = this.audioCtx.sampleRate * 2;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.04;
    }
    const wind = this.audioCtx.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    wind.connect(filter);
    filter.connect(this.masterGain);
    wind.start();
    this.activeNodes.push(wind, filter);

    const chirp = () => {
      if (!this.isPlaying) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      const baseFreq = 2600 + Math.random() * 800;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq + 600, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(baseFreq - 200, now + 0.18);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.24);

      if (Math.random() > 0.5) {
        setTimeout(() => {
          if (!this.isPlaying) return;
          const osc2 = this.audioCtx.createOscillator();
          const gain2 = this.audioCtx.createGain();
          const now2 = this.audioCtx.currentTime;
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(baseFreq + 400, now2);
          osc2.frequency.exponentialRampToValueAtTime(baseFreq + 900, now2 + 0.1);
          gain2.gain.setValueAtTime(0.08, now2);
          gain2.gain.exponentialRampToValueAtTime(0.001, now2 + 0.18);
          osc2.connect(gain2);
          gain2.connect(this.masterGain);
          osc2.start(now2);
          osc2.stop(now2 + 0.2);
        }, 120);
      }
    };

    chirp();
    this.loopTimer = setInterval(() => {
      if (!this.isPlaying) return;
      chirp();
    }, 2800);
  }

  // --- 4. TRACK: SUNGAI DAMAI (Gentle River Stream) ---
  startRiver() {
    const bufferSize = this.audioCtx.sampleRate * 2;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.12;
    }

    const river = this.audioCtx.createBufferSource();
    river.buffer = noiseBuffer;
    river.loop = true;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 550;
    filter.Q.value = 0.8;

    const lfo = this.audioCtx.createOscillator();
    const lfoGain = this.audioCtx.createGain();
    lfo.frequency.value = 0.35;
    lfoGain.gain.value = 180;
    lfo.connect(filter.frequency);
    lfo.start();

    river.connect(filter);
    filter.connect(this.masterGain);
    river.start();

    this.activeNodes.push(river, filter, lfo, lfoGain);
  }

  // --- 5. TRACK: DENGUNGAN 432Hz (Zen Focus Pad) ---
  startZenPad() {
    const freqs = [216, 432, 648];
    freqs.forEach((f, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = idx === 1 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.08 / (idx + 1), this.audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.activeNodes.push(osc, gain);
    });
  }
}

const music = new MusicPlayer();

// Update status tampilan visual Pemutar Musik (Sidebar, Mobile, Fokus)
function updateMusicUI() {
  const sidebarCard = document.getElementById('sidebar-music-box');
  const sidebarTrackLabel = document.getElementById('music-current-track-label');
  const sidebarPlayIcon = document.getElementById('music-play-icon');
  const mobileMusicBtn = document.getElementById('btn-mobile-music');
  const focusPlayBtn = document.getElementById('btn-focus-play-music');
  const focusIconState = document.getElementById('focus-music-icon-state');
  const focusTextState = document.getElementById('focus-music-text-state');

  const title = music.getTrackTitle(music.currentTrack);
  if (sidebarTrackLabel) sidebarTrackLabel.textContent = title;

  if (music.isPlaying) {
    if (sidebarCard) sidebarCard.classList.add('playing');
    if (sidebarPlayIcon) sidebarPlayIcon.textContent = '⏸️';
    if (mobileMusicBtn) mobileMusicBtn.classList.add('playing');
    if (focusIconState) focusIconState.textContent = '⏸️';
    if (focusTextState) focusTextState.textContent = `Jeda Lagu (${title})`;
  } else {
    if (sidebarCard) sidebarCard.classList.remove('playing');
    if (sidebarPlayIcon) sidebarPlayIcon.textContent = '▶️';
    if (mobileMusicBtn) mobileMusicBtn.classList.remove('playing');
    if (focusIconState) focusIconState.textContent = '▶️';
    if (focusTextState) focusTextState.textContent = 'Putar Musik Sekarang';
  }

  // Update selektor track aktif di halaman fokus
  const trackButtons = document.querySelectorAll('#music-tracks-selector .track-btn');
  trackButtons.forEach(btn => {
    if (btn.getAttribute('data-track') === music.currentTrack) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function syncVolumeSliders(val) {
  const sidebarVol = document.getElementById('music-volume-slider');
  const focusVol = document.getElementById('focus-music-volume');
  if (sidebarVol) sidebarVol.value = val;
  if (focusVol) focusVol.value = val;
}

// ==========================================
// 3. INISIALISASI & PERSISTENSI DATA
// ==========================================
function loadFromStorage() {
  try {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (savedUser) appState.user = JSON.parse(savedUser);

    const savedStats = localStorage.getItem(STORAGE_KEYS.STATS);
    if (savedStats) appState.stats = JSON.parse(savedStats);

    const savedReflections = localStorage.getItem(STORAGE_KEYS.REFLECTIONS);
    if (savedReflections) appState.reflections = JSON.parse(savedReflections);

    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (savedSettings) appState.settings = JSON.parse(savedSettings);
  } catch (error) {
    console.error('Gagal memuat data dari localStorage:', error);
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(appState.user));
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(appState.stats));
    localStorage.setItem(STORAGE_KEYS.REFLECTIONS, JSON.stringify(appState.reflections));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));
  } catch (error) {
    console.error('Gagal menyimpan data ke localStorage:', error);
  }
}

// Menghitung status tanaman saat ini berdasarkan jumlah sesi
function getCurrentPlantStage(completedSessions = appState.stats.completedSessions) {
  for (let i = PLANT_STAGES.length - 1; i >= 0; i--) {
    if (completedSessions >= PLANT_STAGES[i].minSessions) {
      return PLANT_STAGES[i];
    }
  }
  return PLANT_STAGES[0];
}

// ==========================================
// 4. SVG GENERATOR UNTUK TANAMAN LUCU
// Menghasilkan ilustrasi tanaman SVG dinamis sesuai level
// ==========================================
function getPlantSvgMarkup(stageLevel) {
  switch (stageLevel) {
    case 1: // Benih Tidur
      return `
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          <!-- Tanah gundukan -->
          <ellipse cx="80" cy="125" rx="55" ry="18" fill="#8C6D58" />
          <ellipse cx="80" cy="120" rx="46" ry="14" fill="#A88B74" />
          <!-- Benih cokelat -->
          <path d="M80 75 C60 75 62 110 80 115 C98 110 100 75 80 75 Z" fill="#784B29" stroke="#4A2F1B" stroke-width="3" />
          <!-- Mata tidur (Zzz) -->
          <path d="M72 94 Q76 98 80 94" stroke="#FFE7D0" stroke-width="2" stroke-linecap="round" fill="none"/>
          <path d="M82 94 Q86 98 90 94" stroke="#FFE7D0" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Pipi merah merona -->
          <circle cx="70" cy="98" r="3" fill="#F87171" opacity="0.6"/>
          <circle cx="92" cy="98" r="3" fill="#F87171" opacity="0.6"/>
          <!-- Huruf Zzz melayang -->
          <text x="96" y="70" font-family="'Fredoka', sans-serif" font-weight="700" font-size="14" fill="#477B62">z</text>
          <text x="106" y="60" font-family="'Fredoka', sans-serif" font-weight="700" font-size="16" fill="#477B62">Z</text>
        </svg>
      `;

    case 2: // Tunas Hijau
      return `
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          <!-- Pot tanah -->
          <ellipse cx="80" cy="130" rx="50" ry="14" fill="#8C6D58" />
          <!-- Batang tunas -->
          <path d="M80 125 Q78 95 80 75" stroke="#477B62" stroke-width="6" stroke-linecap="round" fill="none"/>
          <!-- Daun kiri -->
          <path d="M80 85 C60 70 50 90 76 96 Z" fill="#69A27F" stroke="#376750" stroke-width="2.5" />
          <!-- Daun kanan -->
          <path d="M80 80 C100 65 110 85 84 92 Z" fill="#88C39E" stroke="#376750" stroke-width="2.5" />
          <!-- Wajah imut di batang -->
          <circle cx="76" cy="105" r="2.5" fill="#1B3B2B"/>
          <circle cx="84" cy="105" r="2.5" fill="#1B3B2B"/>
          <path d="M78 110 Q80 113 82 110" stroke="#1B3B2B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
          <circle cx="73" cy="107" r="2" fill="#F87171" opacity="0.7"/>
          <circle cx="87" cy="107" r="2" fill="#F87171" opacity="0.7"/>
          <!-- Tetes embun berkilau -->
          <circle cx="60" cy="74" r="3" fill="#63B3ED" />
        </svg>
      `;

    case 3: // Tanaman Muda
      return `
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          <!-- Pot bunga sage -->
          <path d="M50 115 L58 145 Q80 150 102 145 L110 115 Z" fill="#DCEFE0" stroke="#477B62" stroke-width="3"/>
          <ellipse cx="80" cy="115" rx="30" ry="8" fill="#8C6D58" stroke="#477B62" stroke-width="2"/>
          <!-- Batang tanaman kokoh -->
          <path d="M80 115 Q76 75 80 45" stroke="#477B62" stroke-width="7" stroke-linecap="round" fill="none"/>
          <!-- Ranting & Daun lebat -->
          <path d="M80 90 C50 78 50 100 78 98 Z" fill="#5F9B7D" stroke="#376750" stroke-width="2.5"/>
          <path d="M80 75 C110 65 112 88 82 85 Z" fill="#78B996" stroke="#376750" stroke-width="2.5"/>
          <path d="M80 60 C55 45 60 70 78 68 Z" fill="#88C39E" stroke="#376750" stroke-width="2.5"/>
          <path d="M80 45 C70 20 90 20 80 45 Z" fill="#A4DBB7" stroke="#376750" stroke-width="2.5"/>
          <!-- Senyum ceria pot -->
          <circle cx="73" cy="130" r="3" fill="#477B62"/>
          <circle cx="87" cy="130" r="3" fill="#477B62"/>
          <path d="M76 136 Q80 141 84 136" stroke="#477B62" stroke-width="2" stroke-linecap="round" fill="none"/>
        </svg>
      `;

    case 4: // Pohon Berbunga
      return `
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          <!-- Pot cantik -->
          <path d="M48 118 L56 148 Q80 152 104 148 L112 118 Z" fill="#477B62" stroke="#2D4A3E" stroke-width="3"/>
          <ellipse cx="80" cy="118" rx="32" ry="7" fill="#8C6D58"/>
          <!-- Batang -->
          <path d="M80 118 Q75 75 80 50" stroke="#7A5230" stroke-width="9" stroke-linecap="round" fill="none"/>
          <!-- Mahkota Dedaunan Rimbun -->
          <circle cx="80" cy="55" r="34" fill="#69A27F" opacity="0.95"/>
          <circle cx="62" cy="62" r="24" fill="#5F9B7D"/>
          <circle cx="98" cy="62" r="24" fill="#78B996"/>
          <circle cx="80" cy="38" r="22" fill="#88C39E"/>
          <!-- Bunga-bunga mekar merah muda -->
          <!-- Bunga 1 -->
          <circle cx="65" cy="48" r="6" fill="#FED7E2" stroke="#F687B3" stroke-width="1.5"/>
          <circle cx="65" cy="48" r="2.5" fill="#F6AD55"/>
          <!-- Bunga 2 -->
          <circle cx="95" cy="52" r="7" fill="#FED7E2" stroke="#F687B3" stroke-width="1.5"/>
          <circle cx="95" cy="52" r="3" fill="#F6AD55"/>
          <!-- Bunga 3 -->
          <circle cx="80" cy="68" r="6" fill="#FED7E2" stroke="#F687B3" stroke-width="1.5"/>
          <circle cx="80" cy="68" r="2.5" fill="#F6AD55"/>
          <!-- Wajah tersenyum di pot -->
          <circle cx="73" cy="132" r="3" fill="#FFFFFF"/>
          <circle cx="87" cy="132" r="3" fill="#FFFFFF"/>
          <path d="M77 138 Q80 142 83 138" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none"/>
        </svg>
      `;

    case 5: // Pohon Dewasa Berbuah
    default:
      return `
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          <!-- Tanah berumput luas -->
          <ellipse cx="80" cy="135" rx="60" ry="16" fill="#689377"/>
          <ellipse cx="80" cy="130" rx="48" ry="12" fill="#88C39E"/>
          <!-- Batang pohon kokoh berakar -->
          <path d="M80 130 C76 90 74 70 80 50" stroke="#68472B" stroke-width="14" stroke-linecap="round" fill="none"/>
          <path d="M72 130 Q65 135 55 136" stroke="#68472B" stroke-width="5" stroke-linecap="round" fill="none"/>
          <path d="M88 130 Q95 135 105 136" stroke="#68472B" stroke-width="5" stroke-linecap="round" fill="none"/>
          <!-- Rindang daun besar -->
          <circle cx="80" cy="48" r="42" fill="#477B62"/>
          <circle cx="56" cy="54" r="30" fill="#5F9B7D"/>
          <circle cx="104" cy="54" r="30" fill="#5F9B7D"/>
          <circle cx="80" cy="28" r="28" fill="#69A27F"/>
          <!-- Buah-buah apel merah keemasan -->
          <circle cx="58" cy="45" r="6.5" fill="#E53E3E" stroke="#9B2C2C" stroke-width="1.5"/>
          <circle cx="100" cy="42" r="6.5" fill="#E53E3E" stroke="#9B2C2C" stroke-width="1.5"/>
          <circle cx="78" cy="62" r="7" fill="#E53E3E" stroke="#9B2C2C" stroke-width="1.5"/>
          <circle cx="94" cy="68" r="6" fill="#F6AD55" stroke="#C05621" stroke-width="1.5"/>
          <!-- Mata & senyum pohon bijak di batang -->
          <circle cx="76" cy="85" r="2.5" fill="#FFFFFF"/>
          <circle cx="84" cy="85" r="2.5" fill="#FFFFFF"/>
          <path d="M78 92 Q80 95 82 92" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" fill="none"/>
          <!-- Bintang berkilau keemasan di pucuk -->
          <text x="73" y="18" font-size="16">✨</text>
        </svg>
      `;
  }
}

// ==========================================
// 5. MANAJEMEN NAVIGASI HALAMAN (SPA)
// ==========================================
function switchPage(targetPageId) {
  sounds.playPop();

  // 1. Update tombol sidebar desktop
  const desktopButtons = document.querySelectorAll('.sidebar-nav .nav-btn');
  desktopButtons.forEach(btn => {
    if (btn.getAttribute('data-page') === targetPageId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 2. Update tombol navigasi bawah mobile
  const mobileButtons = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn');
  mobileButtons.forEach(btn => {
    if (btn.getAttribute('data-page') === targetPageId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 3. Tampilkan section yang bersangkutan
  const allPages = document.querySelectorAll('.page-view');
  allPages.forEach(page => {
    if (page.id === `page-${targetPageId}`) {
      page.classList.add('active');
    } else {
      page.classList.remove('active');
    }
  });

  // 4. Update banner timer floating jika user berpindah halaman saat timer jalan
  updateFloatingTimerBar(targetPageId);

  // 5. Refresh data khusus halaman jika perlu
  if (targetPageId === 'beranda') {
    renderHomeView();
  } else if (targetPageId === 'kebun') {
    renderGardenView();
  } else if (targetPageId === 'evaluasi') {
    renderEvaluationView();
  }

  // Gulir ke atas
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateFloatingTimerBar(currentPageId) {
  const floatingBar = document.getElementById('floating-timer-bar');
  const timerBadge = document.getElementById('timer-indicator-badge');

  if (timerState.isRunning && currentPageId !== 'fokus') {
    floatingBar.classList.remove('hidden');
    if (timerBadge) timerBadge.classList.remove('hidden');
  } else {
    floatingBar.classList.add('hidden');
    if (timerBadge) timerBadge.classList.add('hidden');
  }
}

// ==========================================
// 6. LOGIKA TIMER FOKUS LENGKAP
// (15 Menit, 25 Menit, Start, Pause, Resume, Reset, Aturan 00:00)
// ==========================================
function formatTimeDisplay(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
  const digitsEl = document.getElementById('timer-digits');
  const floatingCountdown = document.getElementById('floating-timer-countdown');
  const ring = document.getElementById('timer-progress-ring');
  const formatted = formatTimeDisplay(timerState.remainingSeconds);

  if (digitsEl) digitsEl.textContent = formatted;
  if (floatingCountdown) floatingCountdown.textContent = formatted;

  // Update lingkaran progress stroke-dashoffset
  if (ring && timerState.durationSeconds > 0) {
    const totalCircumference = 2 * Math.PI * 100; // ~628
    const progressRatio = timerState.remainingSeconds / timerState.durationSeconds;
    const offset = totalCircumference * (1 - progressRatio);
    ring.style.strokeDashoffset = offset;
  }
}

function setTimerDuration(minutes) {
  if (timerState.isRunning && !timerState.isPaused) {
    const confirmChange = confirm('Timer sedang berjalan! Mau mengganti durasi dan mengulang sesi ini?');
    if (!confirmChange) return;
  }

  resetTimer(false);
  timerState.selectedMinutes = minutes;
  timerState.durationSeconds = minutes * 60;
  timerState.remainingSeconds = minutes * 60;

  // Update tampilan tombol preset durasi
  const durBtns = document.querySelectorAll('.duration-btn');
  durBtns.forEach(btn => {
    if (parseInt(btn.getAttribute('data-minutes'), 10) === minutes) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  updateTimerDisplay();

  const statusText = document.getElementById('timer-status-text');
  if (statusText) statusText.textContent = `Siap fokus selama ${minutes} menit!`;
}

function startTimer() {
  sounds.playPop();

  // Tangkap target belajar anak
  const targetInput = document.getElementById('fokus-target-input');
  if (targetInput && targetInput.value.trim() !== '') {
    timerState.currentTarget = targetInput.value.trim();
  } else {
    timerState.currentTarget = 'Belajar Mandiri';
  }

  // Jika sedang login, catat sesi fokus baru di database MySQL
  if (authState.isLoggedIn) {
    apiFetch('/api/focus/start', {
      method: 'POST',
      body: JSON.stringify({
        target_belajar: timerState.currentTarget,
        durasi_detik: timerState.durationSeconds
      })
    }).then(res => {
      if (res.ok && res.data.session_id) {
        timerState.sessionId = res.data.session_id;
        console.log('[MySQL] Sesi fokus dicatat dengan ID #' + timerState.sessionId);
      }
    });
  }

  // Putar musik pengiring otomatis jika opsi aktif
  const autoMusicCheck = document.getElementById('check-auto-music');
  const shouldAutoPlay = autoMusicCheck ? autoMusicCheck.checked : appState.settings.autoPlayOnStart;
  if (shouldAutoPlay && !music.isPlaying && music.currentTrack !== 'hening') {
    music.play();
  }

  timerState.isRunning = true;
  timerState.isPaused = false;

  // Toggle tombol
  document.getElementById('btn-timer-start').classList.add('hidden');
  document.getElementById('btn-timer-pause').classList.remove('hidden');
  document.getElementById('btn-timer-resume').classList.add('hidden');

  const statusText = document.getElementById('timer-status-text');
  const encouragement = document.getElementById('timer-encouragement-text');
  if (statusText) statusText.textContent = 'Sedang Fokus Belajar... 🌿';
  if (encouragement) encouragement.textContent = `🎯 Sedang fokus pada: "${timerState.currentTarget}". Kamu pasti bisa!`;

  // Interval hitung mundur
  clearInterval(timerState.intervalId);
  timerState.intervalId = setInterval(() => {
    if (timerState.remainingSeconds > 0) {
      timerState.remainingSeconds--;
      updateTimerDisplay();
    } else {
      // TIMER MENCAPAI NOL (00:00) -> SESI RESMI SELESAI
      handleTimerCompletion();
    }
  }, 1000);
}

function pauseTimer() {
  sounds.playPop();
  timerState.isPaused = true;
  clearInterval(timerState.intervalId);

  document.getElementById('btn-timer-pause').classList.add('hidden');
  document.getElementById('btn-timer-resume').classList.remove('hidden');

  const statusText = document.getElementById('timer-status-text');
  const encouragement = document.getElementById('timer-encouragement-text');
  if (statusText) statusText.textContent = 'Timer Dijeda Sebentar ⏸️';
  if (encouragement) encouragement.textContent = 'Tarik napas sebentar, lalu klik "Lanjutkan" untuk menyelesaikan misimu!';
}

function resumeTimer() {
  sounds.playPop();
  timerState.isPaused = false;

  document.getElementById('btn-timer-pause').classList.remove('hidden');
  document.getElementById('btn-timer-resume').classList.add('hidden');

  const statusText = document.getElementById('timer-status-text');
  if (statusText) statusText.textContent = 'Melanjutkan Fokus Belajar... 🌿';

  clearInterval(timerState.intervalId);
  timerState.intervalId = setInterval(() => {
    if (timerState.remainingSeconds > 0) {
      timerState.remainingSeconds--;
      updateTimerDisplay();
    } else {
      handleTimerCompletion();
    }
  }, 1000);
}

function resetTimer(showAlert = true) {
  sounds.playPop();
  clearInterval(timerState.intervalId);

  // Jika ada sesi berjalan di MySQL, batalkan sesi
  if (authState.isLoggedIn && timerState.sessionId) {
    apiFetch('/api/focus/cancel', {
      method: 'POST',
      body: JSON.stringify({ session_id: timerState.sessionId })
    });
    timerState.sessionId = null;
  }

  timerState.isRunning = false;
  timerState.isPaused = false;
  timerState.remainingSeconds = timerState.durationSeconds;

  document.getElementById('btn-timer-start').classList.remove('hidden');
  document.getElementById('btn-timer-pause').classList.add('hidden');
  document.getElementById('btn-timer-resume').classList.add('hidden');

  const statusText = document.getElementById('timer-status-text');
  const encouragement = document.getElementById('timer-encouragement-text');
  if (statusText) statusText.textContent = 'Siap untuk mulai?';
  if (encouragement) encouragement.textContent = '✨ Klik "Mulai Belajar" dan biarkan pikiranmu fokus sepenuhnya!';

  updateTimerDisplay();
  updateFloatingTimerBar();

  if (showAlert) {
    showToast('Timer telah diulang!', '🔄');
  }
}

// Menangani penyelesaian sesi sukses saat waktu tepat 00:00
function handleTimerCompletion() {
  clearInterval(timerState.intervalId);
  timerState.isRunning = false;
  timerState.isPaused = false;

  // Hentikan musik pengiring agar suara perayaan terdengar megah
  if (music.isPlaying) {
    music.stop();
  }

  // 1. Suara perayaan & Konfeti
  sounds.playSuccessChime();
  launchConfetti();

  // 2. Kirim validasi penyelesaian sesi ke MySQL jika user login
  if (authState.isLoggedIn && timerState.sessionId) {
    apiFetch('/api/focus/complete', {
      method: 'POST',
      body: JSON.stringify({ session_id: timerState.sessionId })
    }).then(res => {
      if (res.ok) {
        timerState.lastCompletedSessionId = timerState.sessionId;
        timerState.sessionId = null;
        if (res.data.plant_progress) {
          appState.stats.completedSessions = res.data.plant_progress.total_sesi;
          appState.stats.totalMinutes = res.data.plant_progress.total_durasi;
          saveToStorage();
          renderHomeView();
          renderGardenView();
        }
        showToast('Sesi terverifikasi & disimpan ke MySQL! 🌿', '✨');
      } else {
        console.warn('Validasi server sesi fokus:', res.data.message);
        // Fallback simpan lokal jika ada respon gagal
        appState.stats.completedSessions += 1;
        appState.stats.totalMinutes += timerState.selectedMinutes;
        saveToStorage();
        renderHomeView();
        renderGardenView();
      }
    });
  } else {
    // Mode tamu offline
    appState.stats.completedSessions += 1;
    appState.stats.totalMinutes += timerState.selectedMinutes;
    saveToStorage();
    renderHomeView();
    renderGardenView();
  }

  // 3. Reset tombol UI timer
  document.getElementById('btn-timer-start').classList.remove('hidden');
  document.getElementById('btn-timer-pause').classList.add('hidden');
  document.getElementById('btn-timer-resume').classList.add('hidden');

  const statusText = document.getElementById('timer-status-text');
  if (statusText) statusText.textContent = '🎉 Sesi Berhasil Diselesaikan!';

  timerState.remainingSeconds = timerState.durationSeconds;
  updateTimerDisplay();
  updateFloatingTimerBar();

  // 4. Update modal perayaan
  const currentStage = getCurrentPlantStage();
  const rewardDetail = document.getElementById('modal-reward-details');
  if (rewardDetail) {
    rewardDetail.textContent = `Kamu telah menyelesaikan total ${appState.stats.completedSessions} sesi belajar. Tanamanmu saat ini: ${currentStage.name}!`;
  }

  // Buka Modal Perayaan
  const modalCelebration = document.getElementById('modal-celebration');
  if (modalCelebration) {
    modalCelebration.classList.remove('hidden');
  }

  // Auto-fill target di halaman refleksi
  const reflTarget = document.getElementById('refl-target');
  if (reflTarget && timerState.currentTarget) {
    reflTarget.value = timerState.currentTarget;
  }

  // Refresh data kebun & beranda
  renderHomeView();
  renderGardenView();
}

// ==========================================
// 7. EFEK KONFETI CANVAS
// Animasi konfeti warna-warni ceria tanpa library eksternal
// ==========================================
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const confettiPieces = [];
  const colors = ['#477B62', '#68B684', '#F6AD55', '#E53E3E', '#4299E1', '#FAF089', '#F687B3'];

  for (let i = 0; i < 90; i++) {
    confettiPieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: Math.random() * 4 + 3,
      speedX: Math.random() * 3 - 1.5,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 6 - 3
    });
  }

  let animationFrameId;
  const startTime = Date.now();

  function animateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elapsed = Date.now() - startTime;

    confettiPieces.forEach(p => {
      p.y += p.speedY;
      p.x += p.speedX;
      p.rotation += p.rotationSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    });

    if (elapsed < 3500) {
      animationFrameId = requestAnimationFrame(animateConfetti);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animationFrameId);
    }
  }

  animateConfetti();
}

// ==========================================
// 8. RENDER HALAMAN BERANDA (HOME VIEW)
// ==========================================
function renderHomeView() {
  const currentStage = getCurrentPlantStage();

  // 1. Sapaan nama anak
  const greetingEl = document.getElementById('home-greeting-text');
  if (greetingEl) {
    greetingEl.textContent = `Halo, ${appState.user.name}! 🌱`;
  }

  // 2. Metrik kartu
  const sessionsEl = document.getElementById('home-stat-sessions');
  const minutesEl = document.getElementById('home-stat-minutes');
  const levelEl = document.getElementById('home-stat-level');
  const plantNameEl = document.getElementById('home-stat-plant-name');
  const reflectionsEl = document.getElementById('home-stat-reflections');

  if (sessionsEl) sessionsEl.textContent = appState.stats.completedSessions;
  if (minutesEl) minutesEl.textContent = appState.stats.totalMinutes;
  if (levelEl) levelEl.textContent = `Level ${currentStage.level}`;
  if (plantNameEl) plantNameEl.textContent = currentStage.name;
  if (reflectionsEl) reflectionsEl.textContent = appState.reflections.length;

  // 3. Hero Card Tanaman
  const heroBadge = document.getElementById('home-hero-badge');
  const heroTitle = document.getElementById('home-hero-plant-title');
  const heroDesc = document.getElementById('home-hero-plant-desc');
  const svgContainer = document.getElementById('home-svg-container');

  if (heroBadge) heroBadge.textContent = currentStage.badge;
  if (heroTitle) heroTitle.textContent = currentStage.title;
  if (heroDesc) heroDesc.textContent = currentStage.story;
  if (svgContainer) svgContainer.innerHTML = getPlantSvgMarkup(currentStage.level);

  // 4. Progress bar level berikutnya
  const progressFill = document.getElementById('home-hero-progress-fill');
  const progressText = document.getElementById('home-hero-progress-text');
  let pct = 0;

  if (currentStage.level < 5) {
    const nextStage = PLANT_STAGES[currentStage.level];
    const sessionsNeeded = nextStage.minSessions;
    const currentSessions = appState.stats.completedSessions;
    pct = Math.min(100, Math.round((currentSessions / sessionsNeeded) * 100));
    if (progressText) progressText.textContent = `${currentSessions} / ${sessionsNeeded} Sesi`;
  } else {
    pct = 100;
    if (progressText) progressText.textContent = 'Level Maksimal! 👑';
  }

  if (progressFill) progressFill.style.width = `${pct}%`;

  // 5. Update komponen sidebar
  updateSidebarProfile();
}

// Update Profil & Level di Sidebar & Topbar Mobile
function updateSidebarProfile() {
  const currentStage = getCurrentPlantStage();

  // Sidebar info
  const nameEl = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-avatar');
  const levelTag = document.getElementById('sidebar-level-tag');
  const levelProgress = document.getElementById('sidebar-level-progress');
  const levelHint = document.getElementById('sidebar-level-hint');

  if (nameEl) nameEl.textContent = appState.user.name;
  if (avatarEl) avatarEl.textContent = appState.user.avatar;
  if (levelTag) levelTag.textContent = `Level ${currentStage.level}`;

  if (currentStage.level < 5) {
    const nextStage = PLANT_STAGES[currentStage.level];
    const diff = nextStage.minSessions - appState.stats.completedSessions;
    const pct = Math.min(100, Math.round((appState.stats.completedSessions / nextStage.minSessions) * 100));
    if (levelProgress) levelProgress.style.width = `${pct}%`;
    if (levelHint) levelHint.textContent = `${diff} sesi lagi untuk ${nextStage.name}!`;
  } else {
    if (levelProgress) levelProgress.style.width = '100%';
    if (levelHint) levelHint.textContent = 'Tanamanmu sudah mekar sempurna! 🌳';
  }

  // Mobile Topbar
  const mobileAvatar = document.getElementById('mobile-avatar');
  const mobileLevel = document.getElementById('mobile-level-pill');
  if (mobileAvatar) mobileAvatar.textContent = appState.user.avatar;
  if (mobileLevel) mobileLevel.textContent = `Lv. ${currentStage.level}`;
}

// ==========================================
// 9. RENDER HALAMAN KEBUN PERTUMBUHAN
// ==========================================
function renderGardenView() {
  const currentStage = getCurrentPlantStage();

  // 1. Tampilkan Tanaman SVG Dinamis
  const gardenSvgContainer = document.getElementById('garden-dynamic-svg');
  if (gardenSvgContainer) {
    gardenSvgContainer.innerHTML = getPlantSvgMarkup(currentStage.level);
  }

  // 2. Info Tanaman
  const levelTag = document.getElementById('garden-current-level-tag');
  const plantTitle = document.getElementById('garden-current-plant-title');
  const plantStory = document.getElementById('garden-current-plant-story');

  if (levelTag) levelTag.textContent = `Level ${currentStage.level}: ${currentStage.name}`;
  if (plantTitle) plantTitle.textContent = currentStage.title;
  if (plantStory) plantStory.textContent = currentStage.story;

  // 3. Progres Tetesan Air
  const waterCount = document.getElementById('garden-water-count');
  const waterFill = document.getElementById('garden-water-bar-fill');
  const waterHint = document.getElementById('garden-water-hint');

  if (currentStage.level < 5) {
    const nextStage = PLANT_STAGES[currentStage.level];
    const needed = nextStage.minSessions;
    const current = appState.stats.completedSessions;
    const diff = Math.max(0, needed - current);
    const pct = Math.min(100, Math.round((current / needed) * 100));

    if (waterCount) waterCount.textContent = `${current} / ${needed} Sesi Selesai`;
    if (waterFill) waterFill.style.width = `${pct}%`;
    if (waterHint) waterHint.textContent = `Butuh ${diff} sesi lagi untuk berevolusi ke ${nextStage.name}!`;
  } else {
    if (waterCount) waterCount.textContent = `${appState.stats.completedSessions} Sesi Selesai`;
    if (waterFill) waterFill.style.width = '100%';
    if (waterHint) waterHint.textContent = 'Pohonmu sudah mencapai puncak evolusi terindah!';
  }

  // 4. Update status kartu evolusi (1 - 5)
  for (let i = 1; i <= 5; i++) {
    const card = document.getElementById(`evo-card-${i}`);
    if (card) {
      if (currentStage.level === i) {
        card.className = 'evolution-card active';
      } else if (currentStage.level > i) {
        card.className = 'evolution-card unlocked';
      } else {
        card.className = 'evolution-card';
      }
    }
  }

  // 5. Render Daftar Badges / Lencana
  renderBadges();
}

function renderBadges() {
  const container = document.getElementById('badges-container');
  if (!container) return;

  container.innerHTML = '';
  BADGES_LIST.forEach(b => {
    const isUnlocked = b.req(appState.stats, appState.reflections);
    const badgeEl = document.createElement('div');
    badgeEl.className = `badge-card ${isUnlocked ? 'unlocked' : 'locked'}`;
    badgeEl.innerHTML = `
      <div class="badge-icon">${b.icon}</div>
      <div class="badge-info">
        <h4>${b.name} ${isUnlocked ? '✅' : '🔒'}</h4>
        <p>${b.desc}</p>
      </div>
    `;
    container.appendChild(badgeEl);
  });
}

// Interaksi Kebun Ceria
function waterPlantAnimation() {
  sounds.playWaterDrop();
  const plantContainer = document.getElementById('garden-dynamic-svg');
  if (plantContainer) {
    plantContainer.style.transform = 'scale(1.1) translateY(-6px)';
    setTimeout(() => {
      plantContainer.style.transform = 'scale(1) translateY(0)';
    }, 350);
  }

  const bubble = document.getElementById('plant-speech-bubble');
  if (bubble) {
    const waterResponses = [
      'Slurpp! Segar sekali airnya! Terima kasih sudah merawatku! 💧🌱',
      'Wah, daun-daunku jadi berkilau kena air sejuk! ✨',
      'Aku makin berenergi! Jangan lupa kamu juga minum air ya! 🥤'
    ];
    bubble.textContent = waterResponses[Math.floor(Math.random() * waterResponses.length)];
    bubble.classList.remove('hidden');
    setTimeout(() => bubble.classList.add('hidden'), 3500);
  }
}

function plantCheerDialogue() {
  sounds.playPop();
  const bubble = document.getElementById('plant-speech-bubble');
  if (bubble) {
    const cheers = [
      'Kamu adalah sahabat belajar terbaikku di dunia! 🌿',
      'Belajar 15-25 menit sehari bikin kita makin pintar bersama! 💡',
      'Jangan takut salah saat belajar ya, pohon juga tumbuh lewat hujan dan angin! 🌈',
      'Setiap helai daunku adalah bukti kerja kerasmu hari ini! 🌻'
    ];
    bubble.textContent = cheers[Math.floor(Math.random() * cheers.length)];
    bubble.classList.remove('hidden');
    setTimeout(() => bubble.classList.add('hidden'), 4000);
  }
}

// ==========================================
// 10. FORMULIR JURNAL REFLEKSI & VALIDASI
// ==========================================
function initReflectionForm() {
  const form = document.getElementById('reflection-form');
  const moodPicker = document.getElementById('mood-picker');
  const moodInput = document.getElementById('refl-mood');
  const distractionTags = document.getElementById('distraction-tags');

  // Pemilihan Mood (Single Select)
  if (moodPicker) {
    moodPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.mood-btn');
      if (!btn) return;
      sounds.playPop();

      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      moodInput.value = btn.getAttribute('data-mood');

      // Hilangkan pesan error jika ada
      const group = btn.closest('.form-group');
      if (group) group.classList.remove('has-error');
    });
  }

  // Pemilihan Gangguan / Distraksi (Multi Select)
  if (distractionTags) {
    distractionTags.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-btn');
      if (!btn) return;
      sounds.playPop();

      // Jika memilih "Tidak Ada", unselect yang lain
      const tagVal = btn.getAttribute('data-distraction');
      if (tagVal.includes('Tidak Ada')) {
        document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      } else {
        // Unselect "Tidak Ada" jika memilih distraksi tertentu
        const noneBtn = distractionTags.querySelector('[data-distraction*="Tidak Ada"]');
        if (noneBtn) noneBtn.classList.remove('selected');
        btn.classList.toggle('selected');
      }
    });
  }

  // Submit Formulir dengan Validasi
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const targetInput = document.getElementById('refl-target');
      const strategyInput = document.getElementById('refl-strategy');
      const insightInput = document.getElementById('refl-insight');

      let isValid = true;

      // 1. Validasi Target
      if (!targetInput.value.trim()) {
        targetInput.closest('.form-group').classList.add('has-error');
        isValid = false;
      } else {
        targetInput.closest('.form-group').classList.remove('has-error');
      }

      // 2. Validasi Mood
      if (!moodInput.value) {
        moodInput.closest('.form-group').classList.add('has-error');
        isValid = false;
      } else {
        moodInput.closest('.form-group').classList.remove('has-error');
      }

      // 3. Validasi Strategi
      if (!strategyInput.value.trim()) {
        strategyInput.closest('.form-group').classList.add('has-error');
        isValid = false;
      } else {
        strategyInput.closest('.form-group').classList.remove('has-error');
      }

      if (!isValid) {
        showToast('Mohon lengkapi bagian yang bertanda bintang ya!', '⚠️');
        return;
      }

      // Kumpulkan distraksi yang dipilih
      const selectedDistractions = [];
      document.querySelectorAll('.tag-btn.selected').forEach(btn => {
        selectedDistractions.push(btn.getAttribute('data-distraction'));
      });
      if (selectedDistractions.length === 0) {
        selectedDistractions.push('Tidak Ada (Fokus Penuh!)');
      }

      // Buat objek catatan refleksi baru
      const newEntry = {
        id: Date.now(),
        date: new Date().toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        target: targetInput.value.trim(),
        mood: moodInput.value,
        distractions: selectedDistractions,
        insight: insightInput.value.trim(),
        strategy: strategyInput.value.trim()
      };

      // Simpan ke array state lokal
      appState.reflections.unshift(newEntry);
      saveToStorage();

      // Jika user terotentikasi, simpan juga ke database MySQL
      if (authState.isLoggedIn) {
        apiFetch('/api/reflections', {
          method: 'POST',
          body: JSON.stringify({
            focus_session_id: timerState.lastCompletedSessionId,
            target_belajar: newEntry.target,
            perasaan: newEntry.mood,
            pemicu_distraksi: newEntry.distractions,
            hal_baru: newEntry.insight,
            strategi: newEntry.strategy
          })
        }).then(res => {
          if (res.ok) {
            timerState.lastCompletedSessionId = null;
            fetchServerReflections();
          }
        });
      }

      // Reset Form & Tombol
      form.reset();
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
      moodInput.value = '';

      sounds.playSuccessChime();
      showToast('Jurnal refleksi berhasil disimpan ke Evaluasi!', '🌟');

      // Buka otomatis halaman Evaluasi agar anak melihat hasilnya
      setTimeout(() => {
        switchPage('evaluasi');
      }, 1000);
    });

    // Reset Form Listener
    form.addEventListener('reset', () => {
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
      document.querySelectorAll('.form-group').forEach(g => g.classList.remove('has-error'));
      moodInput.value = '';
    });
  }
}

// ==========================================
// 11. JEDA AKTIF: LATIHAN NAPAS & SENAM MATA
// ==========================================
function initActiveBreaks() {
  // Switcher Tab Jeda Aktif
  const tabButtons = document.querySelectorAll('.jeda-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sounds.playPop();
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.jeda-tab-content').forEach(content => {
        if (content.id === `tab-${targetTab}`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });

  // Latihan Napas Interaktif
  const btnToggleBreathing = document.getElementById('btn-toggle-breathing');
  const btnResetBreathing = document.getElementById('btn-reset-breathing');
  const circleEl = document.getElementById('breathing-circle');
  const outerCircle = circleEl ? circleEl.closest('.breathing-circle-outer') : null;
  const instructionText = document.getElementById('breathing-text');
  const secondsText = document.getElementById('breathing-seconds');

  const breathingPhases = [
    { text: 'Tarik Napas... 🌸', duration: 4, cls: 'inhale' },
    { text: 'Tahan Sebentar... ✨', duration: 2, cls: 'hold' },
    { text: 'Hembuskan Perlahan... 🍃', duration: 4, cls: 'exhale' }
  ];

  function runBreathingStep() {
    const phase = breathingPhases[breathingState.stepIndex];
    if (outerCircle) {
      outerCircle.className = `breathing-circle-outer ${phase.cls}`;
    }
    if (instructionText) instructionText.textContent = phase.text;
    breathingState.secondsRemaining = phase.duration;
    if (secondsText) secondsText.textContent = `${breathingState.secondsRemaining}s`;

    sounds.playPop();

    clearInterval(breathingState.intervalId);
    breathingState.intervalId = setInterval(() => {
      breathingState.secondsRemaining--;
      if (secondsText) secondsText.textContent = `${breathingState.secondsRemaining}s`;

      if (breathingState.secondsRemaining <= 0) {
        breathingState.stepIndex = (breathingState.stepIndex + 1) % breathingPhases.length;
        runBreathingStep();
      }
    }, 1000);
  }

  if (btnToggleBreathing) {
    btnToggleBreathing.addEventListener('click', () => {
      if (!breathingState.isActive) {
        breathingState.isActive = true;
        btnToggleBreathing.innerHTML = '<span>⏸️ Jeda Latihan Napas</span>';
        runBreathingStep();
      } else {
        breathingState.isActive = false;
        clearInterval(breathingState.intervalId);
        btnToggleBreathing.innerHTML = '<span>▶️ Lanjutkan Latihan Napas</span>';
        if (instructionText) instructionText.textContent = 'Dijeda Sebentar';
      }
    });
  }

  if (btnResetBreathing) {
    btnResetBreathing.addEventListener('click', () => {
      breathingState.isActive = false;
      clearInterval(breathingState.intervalId);
      breathingState.stepIndex = 0;
      if (btnToggleBreathing) btnToggleBreathing.innerHTML = '<span>▶️ Mulai Latihan Napas (1 Menit)</span>';
      if (outerCircle) outerCircle.className = 'breathing-circle-outer';
      if (instructionText) instructionText.textContent = 'Siap Bernapas?';
      if (secondsText) secondsText.textContent = '4s';
    });
  }

  // Mini Timer Istirahat Mata 20 Detik
  const btnStartEyeTimer = document.getElementById('btn-start-eye-timer');
  const eyeDisplay = document.getElementById('eye-timer-display');

  if (btnStartEyeTimer) {
    btnStartEyeTimer.addEventListener('click', () => {
      sounds.playPop();
      btnStartEyeTimer.disabled = true;
      eyeTimerState.seconds = 20;
      if (eyeDisplay) eyeDisplay.textContent = '20 Detik';

      clearInterval(eyeTimerState.intervalId);
      eyeTimerState.intervalId = setInterval(() => {
        eyeTimerState.seconds--;
        if (eyeDisplay) eyeDisplay.textContent = `${eyeTimerState.seconds} Detik`;

        if (eyeTimerState.seconds <= 0) {
          clearInterval(eyeTimerState.intervalId);
          sounds.playSuccessChime();
          if (eyeDisplay) eyeDisplay.textContent = 'Mata Segar Kembali! 👀✨';
          btnStartEyeTimer.disabled = false;
          showToast('Keren! Matamu sudah istirahat 20 detik!', '👀');
        }
      }, 1000);
    });
  }
}

// ==========================================
// 12. RENDER EVALUASI PERKEMBANGAN
// ==========================================
function renderEvaluationView() {
  const currentStage = getCurrentPlantStage();

  // 1. Ringkasan Total
  const totalSessionsEl = document.getElementById('eval-total-sessions');
  const totalMinutesEl = document.getElementById('eval-total-minutes');
  const plantStageEl = document.getElementById('eval-plant-stage');
  const totalReflectionsEl = document.getElementById('eval-total-reflections');

  if (totalSessionsEl) totalSessionsEl.textContent = appState.stats.completedSessions;
  if (totalMinutesEl) totalMinutesEl.textContent = `${appState.stats.totalMinutes} menit`;
  if (plantStageEl) plantStageEl.textContent = currentStage.name;
  if (totalReflectionsEl) totalReflectionsEl.textContent = appState.reflections.length;

  // 2. Analisis Gangguan / Distraksi Terbanyak
  renderDistractionSummary();

  // 3. Analisis Persebaran Perasaan (Mood)
  renderMoodSummary();

  // 4. Daftar Riwayat Refleksi
  renderReflectionsHistory();
}

function renderDistractionSummary() {
  const container = document.getElementById('distraction-summary-container');
  if (!container) return;

  if (appState.reflections.length === 0) {
    container.innerHTML = '<p class="empty-state-text">Belum ada data refleksi. Isi formulir refleksi setelah fokus belajar ya! 🌱</p>';
    return;
  }

  // Hitung frekuensi tiap distraksi
  const counts = {};
  let totalTags = 0;
  appState.reflections.forEach(entry => {
    if (Array.isArray(entry.distractions)) {
      entry.distractions.forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
        totalTags++;
      });
    }
  });

  const sortedKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  let html = '';
  sortedKeys.forEach(tag => {
    const count = counts[tag];
    const pct = Math.round((count / appState.reflections.length) * 100);
    html += `
      <div class="distraction-bar-item">
        <div class="d-bar-info">
          <span>${tag}</span>
          <span>${count} kali (${pct}%)</span>
        </div>
        <div class="d-bar-track">
          <div class="d-bar-fill" style="width: ${Math.min(100, pct)}%;"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderMoodSummary() {
  const container = document.getElementById('mood-summary-container');
  if (!container) return;

  if (appState.reflections.length === 0) {
    container.innerHTML = '<p class="empty-state-text">Belum ada data perasaan yang tersimpan.</p>';
    return;
  }

  const moodMap = {
    senang: { emoji: '😃', label: 'Senang & Berenergi' },
    tenang: { emoji: '😊', label: 'Tenang & Damai' },
    biasa: { emoji: '😐', label: 'Biasa Saja' },
    lelah: { emoji: '🥱', label: 'Agak Bosan / Lelah' },
    sulit: { emoji: '🤯', label: 'Materinya Sulit' }
  };

  const moodCounts = { senang: 0, tenang: 0, biasa: 0, lelah: 0, sulit: 0 };
  appState.reflections.forEach(entry => {
    if (moodCounts[entry.mood] !== undefined) {
      moodCounts[entry.mood]++;
    }
  });

  let html = '';
  Object.keys(moodCounts).forEach(mKey => {
    const count = moodCounts[mKey];
    if (count > 0) {
      const meta = moodMap[mKey] || { emoji: '🌱', label: mKey };
      html += `
        <div class="mood-stat-row">
          <div class="mood-stat-left">
            <span>${meta.emoji}</span>
            <span>${meta.label}</span>
          </div>
          <span><strong>${count}</strong> sesi</span>
        </div>
      `;
    }
  });

  container.innerHTML = html || '<p class="empty-state-text">Belum ada mood tersimpan.</p>';
}

function renderReflectionsHistory() {
  const listContainer = document.getElementById('reflections-history-list');
  if (!listContainer) return;

  if (appState.reflections.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-history-box">
        <span class="empty-icon">🌱</span>
        <h4>Belum Ada Catatan Refleksi</h4>
        <p>Selesaikan sesi fokus di menu Fokus, lalu simpan refleksimu di menu Refleksi. Catatanmu akan tersusun rapi di sini!</p>
        <button class="empty-cta-btn" data-goto="fokus">Mulai Belajar Sekarang ⏱️</button>
      </div>
    `;
    return;
  }

  const moodEmojis = {
    senang: '😃 Senang',
    tenang: '😊 Tenang',
    biasa: '😐 Biasa',
    lelah: '🥱 Lelah',
    sulit: '🤯 Sulit'
  };

  listContainer.innerHTML = '';
  appState.reflections.forEach(item => {
    const card = document.createElement('div');
    card.className = 'reflection-entry-card';

    const tagsHtml = (item.distractions || [])
      .map(t => `<span class="entry-tag">${t}</span>`)
      .join('');

    card.innerHTML = `
      <button class="entry-delete-btn" data-delete-id="${item.id}" title="Hapus catatan ini">✕</button>
      <div class="entry-header">
        <span class="entry-date">📅 ${item.date}</span>
        <span class="entry-mood-pill">${moodEmojis[item.mood] || '🌱'}</span>
      </div>
      <h4 class="entry-target">🎯 ${escapeHtml(item.target)}</h4>
      <div class="entry-tags-row">${tagsHtml}</div>
      ${item.insight ? `<div class="entry-notes"><strong>Pelajaran Baru:</strong> ${escapeHtml(item.insight)}</div>` : ''}
      <div class="entry-notes"><strong>Strategi Berikutnya:</strong> ${escapeHtml(item.strategy)}</div>
    `;

    listContainer.appendChild(card);
  });
}

function deleteReflection(id) {
  sounds.playPop();
  const confirmDelete = confirm('Apakah kamu yakin ingin menghapus catatan refleksi ini?');
  if (confirmDelete) {
    appState.reflections = appState.reflections.filter(r => r.id !== id);
    saveToStorage();
    renderEvaluationView();
    showToast('Catatan refleksi dihapus', '🗑️');
  }
}

// Reset Semua Data Aplikasi
function resetAllData() {
  const confirmFirst = confirm('PERHATIAN: Apakah kamu yakin ingin mereset seluruh progres belajar, level kebun, dan catatan refleksi?');
  if (!confirmFirst) return;

  const confirmSecond = confirm('Data yang dihapus tidak bisa dikembalikan. Tetap reset?');
  if (!confirmSecond) return;

  localStorage.removeItem(STORAGE_KEYS.STATS);
  localStorage.removeItem(STORAGE_KEYS.REFLECTIONS);

  appState.stats = { completedSessions: 0, totalMinutes: 0 };
  appState.reflections = [];
  saveToStorage();

  renderHomeView();
  renderGardenView();
  renderEvaluationView();

  showToast('Semua data berhasil direset. Mari mulai dengan semangat baru! 🌱', '✨');
}

// ==========================================
// 13. MODAL PROFIL & CUSTOMIZATION NAMA
// ==========================================
function initProfileModal() {
  const modal = document.getElementById('modal-profile');
  const openBtn = document.getElementById('btn-open-profile-modal');
  const mobileProfileBtn = document.getElementById('mobile-profile-btn');
  const closeBtn = document.getElementById('btn-close-profile');
  const saveBtn = document.getElementById('btn-save-profile');
  const nameInput = document.getElementById('input-child-name');
  const avatarButtons = document.querySelectorAll('.avatar-select-btn');

  let selectedAvatar = appState.user.avatar;

  function openProfile() {
    sounds.playPop();
    if (nameInput) nameInput.value = appState.user.name;
    selectedAvatar = appState.user.avatar;
    avatarButtons.forEach(btn => {
      if (btn.getAttribute('data-avatar') === selectedAvatar) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    modal.classList.remove('hidden');
  }

  function closeProfile() {
    sounds.playPop();
    modal.classList.add('hidden');
  }

  if (openBtn) openBtn.addEventListener('click', openProfile);
  if (mobileProfileBtn) mobileProfileBtn.addEventListener('click', openProfile);
  if (closeBtn) closeBtn.addEventListener('click', closeProfile);

  avatarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sounds.playPop();
      avatarButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAvatar = btn.getAttribute('data-avatar');
    });
  });

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const newName = nameInput.value.trim() || 'Pembelajar Cilik';
      appState.user.name = newName;
      appState.user.avatar = selectedAvatar;
      saveToStorage();

      // Jika terotentikasi, perbarui nama & avatar di MySQL
      if (authState.isLoggedIn) {
        await apiFetch('/api/auth/profile', {
          method: 'PATCH',
          body: JSON.stringify({ nama: newName, avatar: selectedAvatar })
        });
      }

      updateSidebarProfile();
      renderHomeView();
      closeProfile();
      showToast(`Profil diperbarui! Halo ${newName}!`, selectedAvatar);
    });
  }
}

// ==========================================
// 13B. MODAL AUTENTIKASI (LOGIN & REGISTER MYSQL)
// ==========================================
function initAuthModal() {
  const modalAuth = document.getElementById('modal-auth');
  const btnShowAuth = document.getElementById('btn-show-auth-modal');
  const btnAuthCancel = document.getElementById('btn-auth-cancel');
  const tabLogin = document.getElementById('tab-btn-login');
  const tabRegister = document.getElementById('tab-btn-register');
  const nameGroup = document.getElementById('auth-name-group');
  const submitLabel = document.getElementById('auth-submit-label');
  const alertBox = document.getElementById('auth-alert-box');
  const formAuth = document.getElementById('form-auth-user');
  const btnDemoChild = document.getElementById('btn-demo-child');
  const btnDemoAdmin = document.getElementById('btn-demo-admin');
  const btnLogout = document.getElementById('btn-user-logout');

  let mode = 'login'; // 'login' | 'register'

  function openAuth(m = 'login') {
    sounds.playPop();
    mode = m;
    setAuthMode(mode);
    if (alertBox) alertBox.classList.add('hidden');
    if (modalAuth) modalAuth.classList.remove('hidden');
  }

  function closeAuth() {
    sounds.playPop();
    if (modalAuth) modalAuth.classList.add('hidden');
  }

  function setAuthMode(m) {
    mode = m;
    if (mode === 'login') {
      if (tabLogin) tabLogin.classList.add('active');
      if (tabRegister) tabRegister.classList.remove('active');
      if (nameGroup) nameGroup.classList.add('hidden');
      if (submitLabel) submitLabel.textContent = 'Masuk Sekarang';
      const titleEl = document.getElementById('auth-modal-title');
      if (titleEl) titleEl.textContent = 'Masuk ke TUMBUH';
    } else {
      if (tabRegister) tabRegister.classList.add('active');
      if (tabLogin) tabLogin.classList.remove('active');
      if (nameGroup) nameGroup.classList.remove('hidden');
      if (submitLabel) submitLabel.textContent = 'Daftar Akun Baru';
      const titleEl = document.getElementById('auth-modal-title');
      if (titleEl) titleEl.textContent = 'Daftar Akun Belajar';
    }
    if (alertBox) alertBox.classList.add('hidden');
  }

  if (btnShowAuth) btnShowAuth.addEventListener('click', () => openAuth('login'));
  if (btnAuthCancel) btnAuthCancel.addEventListener('click', closeAuth);
  if (tabLogin) tabLogin.addEventListener('click', () => setAuthMode('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => setAuthMode('register'));

  // Tombol Demo Cepat
  if (btnDemoChild) {
    btnDemoChild.addEventListener('click', () => {
      sounds.playPop();
      setAuthMode('login');
      document.getElementById('auth-input-email').value = 'anak@tumbuh.id';
      document.getElementById('auth-input-password').value = 'Tumbuh123!';
    });
  }
  if (btnDemoAdmin) {
    btnDemoAdmin.addEventListener('click', () => {
      sounds.playPop();
      setAuthMode('login');
      document.getElementById('auth-input-email').value = 'admin@tumbuh.id';
      document.getElementById('auth-input-password').value = 'Admin123!';
    });
  }

  // Submit Login / Register
  if (formAuth) {
    formAuth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-input-email').value.trim();
      const password = document.getElementById('auth-input-password').value;
      const name = document.getElementById('auth-input-name').value.trim();

      alertBox.className = 'auth-alert-message hidden';

      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = { email, password };
      if (mode === 'register') {
        payload.nama = name || 'Pembelajar Cilik';
        payload.avatar = appState.user.avatar || '🌱';
      }

      submitLabel.textContent = 'Memproses...';

      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      submitLabel.textContent = mode === 'login' ? 'Masuk Sekarang' : 'Daftar Akun Baru';

      if (res.ok && res.data.token) {
        localStorage.setItem('tumbuh_token', res.data.token);
        alertBox.textContent = res.data.message || 'Berhasil masuk!';
        alertBox.className = 'auth-alert-message success';
        alertBox.classList.remove('hidden');

        sounds.playSuccessChime();
        setTimeout(() => {
          closeAuth();
          syncWithServer();
          showToast(`Halo ${res.data.user.nama}! Data tersambung ke MySQL! 🌱`, '✨');
        }, 800);
      } else {
        alertBox.textContent = res.data.message || 'Terjadi kesalahan saat masuk.';
        alertBox.className = 'auth-alert-message error';
        alertBox.classList.remove('hidden');
      }
    });
  }

  // Tombol Logout Pengguna
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      localStorage.removeItem('tumbuh_token');
      sounds.playPop();
      showToast('Anda telah keluar dari akun.', '👋');
      setTimeout(() => {
        window.location.reload();
      }, 350);
    });
  }
}

// ==========================================
// 14. TOAST NOTIFIKASI
// ==========================================
let toastTimeout;
function showToast(message, icon = '✨') {
  const toast = document.getElementById('toast-notification');
  const msgEl = document.getElementById('toast-msg');
  const iconEl = document.getElementById('toast-icon');

  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  if (iconEl) iconEl.textContent = icon;

  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

// Helper XSS Escape
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==========================================
// 15. EVENT LISTENERS UTAMA & INISIALISASI
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Muat data dari localStorage
  loadFromStorage();

  // 2. Setup Navigasi Sidebar Desktop
  const desktopNavBtns = document.querySelectorAll('.sidebar-nav .nav-btn');
  desktopNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const pageId = btn.getAttribute('data-page');
      switchPage(pageId);
    });
  });

  // 3. Setup Navigasi Bawah Mobile
  const mobileNavBtns = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn');
  mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const pageId = btn.getAttribute('data-page');
      switchPage(pageId);
    });
  });

  // 4. Delegasi link "data-goto" (di kartu beranda, tombol kosong, dll)
  document.body.addEventListener('click', (e) => {
    const gotoEl = e.target.closest('[data-goto]');
    if (gotoEl) {
      const page = gotoEl.getAttribute('data-goto');
      switchPage(page);
    }

    // Delegasi hapus catatan refleksi
    const deleteBtn = e.target.closest('[data-delete-id]');
    if (deleteBtn) {
      const id = parseInt(deleteBtn.getAttribute('data-delete-id'), 10);
      deleteReflection(id);
    }
  });

  // 5. Tombol Floating Timer
  const gotoTimerBtn = document.getElementById('btn-goto-timer');
  if (gotoTimerBtn) {
    gotoTimerBtn.addEventListener('click', () => switchPage('fokus'));
  }

  // 6. Setup Preset Durasi Timer
  const durBtns = document.querySelectorAll('.duration-btn');
  durBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sounds.playPop();
      const mins = parseInt(btn.getAttribute('data-minutes'), 10);
      setTimerDuration(mins);
    });
  });

  // Quick Preset Target Belajar
  const targetInput = document.getElementById('fokus-target-input');
  document.querySelectorAll('.target-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sounds.playPop();
      if (targetInput) {
        targetInput.value = btn.textContent.replace(/[📖✏️🎨]/g, '').trim();
      }
    });
  });

  // 7. Tombol Kontrol Timer (Start, Pause, Resume, Reset)
  const btnStart = document.getElementById('btn-timer-start');
  const btnPause = document.getElementById('btn-timer-pause');
  const btnResume = document.getElementById('btn-timer-resume');
  const btnReset = document.getElementById('btn-timer-reset');

  if (btnStart) btnStart.addEventListener('click', startTimer);
  if (btnPause) btnPause.addEventListener('click', pauseTimer);
  if (btnResume) btnResume.addEventListener('click', resumeTimer);
  if (btnReset) btnReset.addEventListener('click', () => resetTimer(true));

  // 8. Interaksi Kebun
  const btnWater = document.getElementById('btn-water-plant');
  const btnCheer = document.getElementById('btn-plant-cheer');
  if (btnWater) btnWater.addEventListener('click', waterPlantAnimation);
  if (btnCheer) btnCheer.addEventListener('click', plantCheerDialogue);

  // 9. Tombol Modal Perayaan
  const modalClose = document.getElementById('btn-modal-close');
  const modalToRefleksi = document.getElementById('btn-modal-to-refleksi');
  const modalToKebun = document.getElementById('btn-modal-to-kebun');
  const modalCelebration = document.getElementById('modal-celebration');

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      modalCelebration.classList.add('hidden');
    });
  }
  if (modalToRefleksi) {
    modalToRefleksi.addEventListener('click', () => {
      modalCelebration.classList.add('hidden');
      switchPage('refleksi');
    });
  }
  if (modalToKebun) {
    modalToKebun.addEventListener('click', () => {
      modalCelebration.classList.add('hidden');
      switchPage('kebun');
    });
  }

  // 10. Kontrol Toggle Suara
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const soundIcon = document.getElementById('sound-icon');
  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      appState.settings.soundEnabled = !appState.settings.soundEnabled;
      saveToStorage();
      if (appState.settings.soundEnabled) {
        soundToggleBtn.innerHTML = '<span id="sound-icon">🔊</span> <span class="action-btn-text">Suara: Nyala</span>';
        sounds.playPop();
        showToast('Efek suara diaktifkan', '🔊');
      } else {
        soundToggleBtn.innerHTML = '<span id="sound-icon">🔇</span> <span class="action-btn-text">Suara: Mati</span>';
        showToast('Efek suara dimatikan', '🔇');
      }
    });
  }

  // 11. Tombol Evaluasi: Cetak & Reset
  const btnPrint = document.getElementById('btn-print-eval');
  const btnClear = document.getElementById('btn-clear-data');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      sounds.playPop();
      window.print();
    });
  }
  if (btnClear) {
    btnClear.addEventListener('click', resetAllData);
  }

  // 12. Kontrol Pemutar Musik (Sidebar, Mobile Topbar, & Halaman Fokus)
  const btnToggleMusic = document.getElementById('btn-toggle-music');
  const btnMobileMusic = document.getElementById('btn-mobile-music');
  const btnFocusPlayMusic = document.getElementById('btn-focus-play-music');
  const sidebarVolSlider = document.getElementById('music-volume-slider');
  const focusVolSlider = document.getElementById('focus-music-volume');
  const autoMusicCheck = document.getElementById('check-auto-music');

  if (btnToggleMusic) {
    btnToggleMusic.addEventListener('click', () => {
      sounds.playPop();
      music.toggle();
    });
  }

  if (btnMobileMusic) {
    btnMobileMusic.addEventListener('click', () => {
      sounds.playPop();
      music.toggle();
    });
  }

  if (btnFocusPlayMusic) {
    btnFocusPlayMusic.addEventListener('click', () => {
      sounds.playPop();
      music.toggle();
    });
  }

  if (sidebarVolSlider) {
    sidebarVolSlider.addEventListener('input', (e) => {
      music.setVolume(parseInt(e.target.value, 10));
    });
  }

  if (focusVolSlider) {
    focusVolSlider.addEventListener('input', (e) => {
      music.setVolume(parseInt(e.target.value, 10));
    });
  }

  // Pemilihan Track Musik / Suara Alam
  const trackBtns = document.querySelectorAll('#music-tracks-selector .track-btn');
  trackBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sounds.playPop();
      const trackKey = btn.getAttribute('data-track');
      music.setTrack(trackKey);
    });
  });

  // Checkbox Putar Otomatis saat Timer Mulai
  if (autoMusicCheck) {
    autoMusicCheck.checked = appState.settings.autoPlayOnStart;
    autoMusicCheck.addEventListener('change', (e) => {
      appState.settings.autoPlayOnStart = e.target.checked;
      saveToStorage();
    });
  }

  // 13. Inisialisasi Modul Lainnya
  initReflectionForm();
  initActiveBreaks();
  initProfileModal();
  initAuthModal();

  // 14. Render Awal & Sinkronisasi Server MySQL
  if (appState.settings.musicTrack) {
    music.currentTrack = appState.settings.musicTrack;
  }
  if (appState.settings.musicVolume !== undefined) {
    music.setVolume(appState.settings.musicVolume);
  }
  updateMusicUI();
  updateTimerDisplay();

  // 15. Login Wall: Wajib login sebelum akses app sama sekali
  initLoginWall();
});

// ==========================================
// 15. LOGIN WALL - WAJIB LOGIN SEBELUM AKSES
// ==========================================
function initLoginWall() {
  const loginWall = document.getElementById('login-wall');
  const appContainer = document.getElementById('app-container');
  const lwForm = document.getElementById('lw-form');
  const lwAlert = document.getElementById('lw-alert');
  const lwTabLogin = document.getElementById('lw-tab-login');
  const lwTabRegister = document.getElementById('lw-tab-register');
  const lwNameGroup = document.getElementById('lw-name-group');
  const lwSubmitLabel = document.getElementById('lw-submit-label');
  const lwDemoChild = document.getElementById('lw-demo-child');
  const lwDemoAdmin = document.getElementById('lw-demo-admin');

  let lwMode = 'login';

  if (!loginWall) return;

  // Cek apakah sudah punya token yang valid
  async function checkExistingAuth() {
    const token = localStorage.getItem('tumbuh_token');
    if (token) {
      // Verifikasi token masih valid di server
      const res = await apiFetch('/api/auth/me');
      if (res.ok && res.data.user) {
        // Token valid — langsung masuk app
        hideLoginWall();
        syncWithServer();
        return;
      } else {
        // Token expired/invalid — hapus dan tampilkan login wall
        localStorage.removeItem('tumbuh_token');
      }
    }
    // Tampilkan login wall, sembunyikan app
    showLoginWall();
  }

  function showLoginWall() {
    loginWall.classList.remove('hidden');
    if (appContainer) appContainer.style.display = 'none';
  }

  function hideLoginWall() {
    loginWall.classList.add('hidden');
    if (appContainer) appContainer.style.display = '';
    // Re-render setelah login
    setTimeout(() => {
      renderHomeView();
      renderGardenView();
      updateSidebarProfile();
      renderEvaluationView();
    }, 100);
  }

  function setLwMode(mode) {
    lwMode = mode;
    if (mode === 'login') {
      if (lwTabLogin) lwTabLogin.classList.add('active');
      if (lwTabRegister) lwTabRegister.classList.remove('active');
      if (lwNameGroup) lwNameGroup.classList.add('hidden');
      if (lwSubmitLabel) lwSubmitLabel.textContent = 'Masuk Sekarang';
    } else {
      if (lwTabRegister) lwTabRegister.classList.add('active');
      if (lwTabLogin) lwTabLogin.classList.remove('active');
      if (lwNameGroup) lwNameGroup.classList.remove('hidden');
      if (lwSubmitLabel) lwSubmitLabel.textContent = 'Daftar Akun Baru';
    }
    if (lwAlert) { lwAlert.classList.add('hidden'); lwAlert.className = 'lw-alert hidden'; }
  }

  // Tab events
  if (lwTabLogin) lwTabLogin.addEventListener('click', () => setLwMode('login'));
  if (lwTabRegister) lwTabRegister.addEventListener('click', () => setLwMode('register'));

  // Demo buttons
  if (lwDemoChild) {
    lwDemoChild.addEventListener('click', () => {
      setLwMode('login');
      document.getElementById('lw-input-email').value = 'anak@tumbuh.id';
      document.getElementById('lw-input-password').value = 'Tumbuh123!';
    });
  }
  if (lwDemoAdmin) {
    lwDemoAdmin.addEventListener('click', () => {
      setLwMode('login');
      document.getElementById('lw-input-email').value = 'admin@tumbuh.id';
      document.getElementById('lw-input-password').value = 'Admin123!';
    });
  }

  // Form submit
  if (lwForm) {
    lwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('lw-input-email').value.trim();
      const password = document.getElementById('lw-input-password').value;
      const name = document.getElementById('lw-input-name').value.trim();

      if (lwAlert) { lwAlert.classList.add('hidden'); lwAlert.className = 'lw-alert hidden'; }

      const endpoint = lwMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = { email, password };
      if (lwMode === 'register') {
        payload.nama = name || 'Pembelajar Cilik';
        payload.avatar = '🌱';
      }

      if (lwSubmitLabel) lwSubmitLabel.textContent = 'Memproses...';

      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (lwSubmitLabel) lwSubmitLabel.textContent = lwMode === 'login' ? 'Masuk Sekarang' : 'Daftar Akun Baru';

      if (res.ok && res.data.token) {
        localStorage.setItem('tumbuh_token', res.data.token);

        if (lwAlert) {
          lwAlert.textContent = res.data.message || 'Berhasil masuk! 🌱';
          lwAlert.className = 'lw-alert success';
        }

        sounds.playSuccessChime();

        setTimeout(() => {
          hideLoginWall();
          syncWithServer();
          showToast(`Halo ${res.data.user.nama}! Selamat datang di TUMBUH! 🌱`, '✨');
        }, 600);
      } else {
        if (lwAlert) {
          lwAlert.textContent = res.data.message || 'Terjadi kesalahan. Coba lagi.';
          lwAlert.className = 'lw-alert error';
        }
      }
    });
  }

  // Mulai pengecekan
  checkExistingAuth();
}
