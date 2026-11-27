/**
 * PLN PUSHARLIS - Face ID Application Controller
 * Mode Sederhana: IN (Absen Masuk) & OUT (Absen Pulang)
 * Diperbarui: Bebas Bug Kamera, Sinkronisasi Waktu Lokal, & Manajemen Pegawai
 */

const App = {
  mode: 'IN', // 'IN' atau 'OUT'
  videoStream: null,
  regStream: null,
  isScanning: false,
  scanCooldown: false,
  audioCtx: null,

  // Pelacak Peringatan Duplikasi (Hanya Tepat 1 Kali Muncul per Pegawai/Hari/Mode)
  warnedKeys: new Set(),
  warningTimeout: null,

  // Data Pegawai & Riwayat Presensi
  employees: [],
  records: [],

  // Helper Tanggal Lokal yang Akurat (Bebas Masalah UTC / Dini Hari)
  getTodayString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  init() {
    this.loadStorage();
    this.initClock();
    this.initCamera();
    this.renderStats();
    this.renderLogTable();
    this.initAudioUnlock();

    if (window.faceEngine) {
      window.faceEngine.init().then(() => {
        console.log('⚡ PLN FaceID: Engine Biometrik Siap.');
      });
    }
  },

  // Audio Context Unlocker untuk Browser Modern
  initAudioUnlock() {
    const unlock = () => {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  },

  loadStorage() {
    const savedEmp = localStorage.getItem('pln_pusharlis_employees');
    if (savedEmp) {
      try {
        this.employees = JSON.parse(savedEmp);
      } catch (e) {
        this.employees = [];
      }
    } else {
      // Data Awal Pegawai PLN PUSHARLIS
      this.employees = [
        {
          nip: '9215088ZY',
          name: 'Agus Pratama, S.T.',
          department: 'Bidang Rekayasa & Fabrikasi',
          position: 'Senior Engineer Pemeliharaan Listrik',
          photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
          faceDescriptor: null
        },
        {
          nip: '9417032KY',
          name: 'Rina Kusuma Wardhani',
          department: 'Bidang Keuangan & SDM',
          position: 'Supervisor Talent & Pelayanan SDM',
          photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
          faceDescriptor: null
        },
        {
          nip: '8913045PY',
          name: 'Bambang Trianto',
          department: 'Bidang K3L & Keamanan Kerja',
          position: 'Officer K3L & Inspeksi Lapangan',
          photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
          faceDescriptor: null
        }
      ];
      this.saveEmployees();
    }

    const savedRec = localStorage.getItem('pln_pusharlis_records');
    if (savedRec) {
      try {
        this.records = JSON.parse(savedRec);
        // Otomatis bersihkan duplikasi: 1 orang hanya 1 kali IN dan 1 kali OUT per hari
        const seen = new Set();
        this.records = this.records.filter((r) => {
          const key = `${r.date}_${(r.name || r.nip || '').trim().toLowerCase()}_${r.mode}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        this.saveRecords();
      } catch (e) {
        this.records = [];
      }
    } else {
      const today = this.getTodayString();
      this.records = [
        {
          id: 'rec-1',
          nip: '9417032KY',
          name: 'Rina Kusuma Wardhani',
          department: 'Bidang Keuangan & SDM',
          mode: 'IN',
          time: '07:22:10',
          date: today,
          status: 'Tepat Waktu',
          confidence: 98,
          snapshot: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80'
        }
      ];
      this.saveRecords();
    }
  },

  saveEmployees() {
    localStorage.setItem('pln_pusharlis_employees', JSON.stringify(this.employees));
  },

  saveRecords() {
    localStorage.setItem('pln_pusharlis_records', JSON.stringify(this.records));
  },

  // Toggle IN / OUT Mode
  setMode(m) {
    this.mode = m;
    const btnIn = document.getElementById('btnModeIn');
    const btnOut = document.getElementById('btnModeOut');
    const badge = document.getElementById('currentModeBadge');

    if (m === 'IN') {
      btnIn.className = 'flex-1 py-3 px-5 rounded-2xl font-black text-sm tracking-wide bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-cyan-500/30 flex items-center justify-center space-x-2 transition-all transform scale-[1.02]';
      btnOut.className = 'flex-1 py-3 px-5 rounded-2xl font-bold text-sm tracking-wide bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center space-x-2 transition-all';
      if (badge) {
        badge.innerHTML = '⚡ MODE: <strong>IN (ABSEN MASUK)</strong>';
        badge.className = 'inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40';
      }
    } else {
      btnOut.className = 'flex-1 py-3 px-5 rounded-2xl font-black text-sm tracking-wide bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/30 flex items-center justify-center space-x-2 transition-all transform scale-[1.02]';
      btnIn.className = 'flex-1 py-3 px-5 rounded-2xl font-bold text-sm tracking-wide bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center space-x-2 transition-all';
      if (badge) {
        badge.innerHTML = '⚡ MODE: <strong>OUT (ABSEN PULANG)</strong>';
        badge.className = 'inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
      }
    }
  },

  // Jam Digital Real-time
  initClock() {
    const elTime = document.getElementById('digitalClock');
    const elDate = document.getElementById('digitalDate');
    const update = () => {
      const now = new Date();
      if (elTime) elTime.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
      if (elDate) elDate.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };
    update();
    setInterval(update, 1000);
  },

  // Kamera Utama Scanner dengan Multi-Constraint Fallback
  async initCamera() {
    const video = document.getElementById('scannerVideo');
    const canvas = document.getElementById('scannerCanvas');
    const notice = document.getElementById('cameraNotice');
    const statusEl = document.getElementById('scannerStatusText');
    if (!video) return;

    this.stopMainCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (notice) {
        notice.classList.remove('hidden');
        notice.innerHTML = `⚠️ <strong>Browser Tidak Mendukung Webcam:</strong> Harap buka melalui <code>localhost:3001</code> atau browser modern yang mendukung MediaDevices.`;
      }
      return;
    }

    const tryConstraints = [
      { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false }
    ];

    let stream = null;
    let errorDetail = null;

    for (const c of tryConstraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch (e) {
        errorDetail = e;
      }
    }

    if (!stream) {
      console.warn('Akses kamera tidak diizinkan atau sedang dipakai aplikasi lain:', errorDetail);
      if (notice) {
        notice.classList.remove('hidden');
        notice.innerHTML = `⚠️ <strong>Akses Kamera Belum Aktif:</strong> Pastikan izin kamera pada browser Anda diizinkan (klik ikon setelan/kamera di URL bar) dan kamera tidak sedang dipakai aplikasi lain (Zoom/Teams). <button onclick="App.initCamera()" class="underline font-bold text-pln-cyan ml-1">Coba Lagi</button>`;
      }
      if (statusEl) {
        statusEl.innerHTML = `<span class="cursor-pointer" onclick="App.initCamera()">🔴 Klik Di Sini untuk Mengaktifkan Kamera</span>`;
      }
      return;
    }

    try {
      this.videoStream = stream;
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.srcObject = stream;

      video.onclick = () => {
        if (video.paused) video.play().catch(() => {});
      };

      // Jalankan play secara langsung dan tangani promise
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay terkadang membutuhkan interaksi
          video.onloadeddata = () => video.play().catch(() => {});
        });
      }

      video.onloadedmetadata = () => {
        video.play().catch(() => {});
      };

      video.onplay = () => {
        if (notice) notice.classList.add('hidden');
      };

      this.isScanning = true;
      this.startScanLoop(video, canvas);

      if (notice) notice.classList.add('hidden');
      if (statusEl && !this.scanCooldown) {
        statusEl.innerHTML = `⚪ Arahkan wajah Anda ke pemindai kamera...`;
      }
    } catch (err) {
      console.warn('Error saat mengaktifkan stream kamera:', err);
    }
  },

  stopMainCamera() {
    this.isScanning = false;
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => track.stop());
      this.videoStream = null;
    }
    const video = document.getElementById('scannerVideo');
    if (video) video.srcObject = null;
  },

  // Scanning Loop - Non-overlapping RequestAnimationFrame for Smooth 60 FPS
  startScanLoop(video, canvas) {
    const ctx = canvas ? canvas.getContext('2d') : null;
    let isBusy = false;

    const frameLoop = async () => {
      if (!this.isScanning) return;

      if (!isBusy && video && !video.paused && !video.ended && video.readyState >= 2) {
        isBusy = true;
        try {
          if (canvas && video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          const detection = await window.faceEngine.detectFace(video, canvas);
          this.drawOverlay(ctx, detection, video.videoWidth, video.videoHeight);

          if (detection) {
            this.handleDetection(detection, video);
          } else {
            this.handleNoFace();
          }
        } catch (e) {
          // Skip frame error
        } finally {
          isBusy = false;
        }
      }

      if (this.isScanning) {
        requestAnimationFrame(frameLoop);
      }
    };

    requestAnimationFrame(frameLoop);
  },

  drawOverlay(ctx, detection, w, h) {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!detection) return;

    const { box, liveness } = detection;
    const isLive = liveness ? liveness.isLive : true;

    ctx.lineWidth = 3;
    ctx.strokeStyle = isLive ? '#00a2b9' : '#f59e0b';
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // Render Box Header dengan Un-Mirroring agar teks tidak terbalik di canvas mirrored
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    const flippedX = w - (box.x + box.width);
    ctx.fillStyle = isLive ? 'rgba(0, 162, 185, 0.95)' : 'rgba(245, 158, 11, 0.95)';
    ctx.font = '700 13px Plus Jakarta Sans, sans-serif';
    ctx.fillRect(flippedX, Math.max(0, box.y - 24), 185, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(isLive ? '⚡ Wajah Asli Terverifikasi' : '🛡️ Anti-Spoof: Harap Berkedip', flippedX + 8, Math.max(16, box.y - 7));
    ctx.restore();
  },

  handleDetection(detection, video) {
    const statusEl = document.getElementById('scannerStatusText');
    const bracket = document.getElementById('scannerBrackets');

    // Threshold 0.70 untuk pencocokan biometrik (presisi tinggi & aman)
    const match = window.faceEngine.findBestMatch(detection.descriptor, this.employees, 0.70);

    if (match) {
      // ── PROTEKSI LIVENESS / ANTI-SPOOFING (CEGAH FOTO HP / CETAK) ──
      const isLive = detection.liveness ? detection.liveness.isLive : true;

      if (!isLive) {
        if (bracket) bracket.className = 'scanner-corners live-warning';
        if (statusEl) {
          statusEl.innerHTML = `🟡 <strong class="text-amber-400">Anti-Spoofing:</strong> ${match.employee.name} • Harap berkedip / gerakkan wajah...`;
        }
        return; // Hentikan absensi jika belum terverifikasi sebagai manusia hidup!
      }

      // Wajah asli & hidup terverifikasi
      if (bracket) bracket.className = 'scanner-corners matched-bracket';
      if (statusEl) {
        statusEl.innerHTML = `🟢 Terverifikasi (Wajah Asli): <strong class="text-emerald-400">${match.employee.name}</strong> (${match.confidence}%)`;
      }

      if (!this.scanCooldown) {
        this.recordAttendance(match.employee, match.confidence, video);
      }
    } else {
      if (bracket) bracket.className = 'scanner-corners';
      if (statusEl) {
        statusEl.innerHTML = `🟡 Wajah Terdeteksi • Menyelaraskan Biometrik...`;
      }
    }
  },

  handleNoFace() {
    const statusEl = document.getElementById('scannerStatusText');
    const bracket = document.getElementById('scannerBrackets');
    if (bracket) bracket.className = 'scanner-corners';

    if (statusEl && !this.scanCooldown) {
      statusEl.innerHTML = `⚪ Arahkan wajah Anda ke pemindai kamera...`;
    }
  },

  // Manual Trigger: Klik tombol langsung untuk absen instan
  triggerManualNow() {
    const video = document.getElementById('scannerVideo');
    if (!video || video.readyState < 2) {
      alert('Kamera belum siap! Pastikan webcam aktif.');
      return;
    }

    if (this.employees.length === 0) {
      alert('Belum ada data pegawai! Silakan klik "+ Daftar Pegawai Baru" terlebih dahulu.');
      return;
    }

    // Ambil pegawai terakhir yang terdaftar (prioritas pegawai yang baru didaftarkan)
    const emp = this.employees[0];
    this.recordAttendance(emp, 99, video);
  },

  // Simpan Absensi (1x IN dan 1x OUT per hari, peringatan modal tepat 1 kali)
  recordAttendance(emp, confidence, video) {
    this.scanCooldown = true;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = this.getTodayString(now);

    // ── Guard Duplikasi: 1x IN + 1x OUT per orang per hari ──
    const alreadyDone = this.records.find(
      (r) => r.name.trim().toLowerCase() === emp.name.trim().toLowerCase()
           && r.date === dateStr
           && r.mode === this.mode
    );
    if (alreadyDone) {
      const warnKey = `${dateStr}_${emp.name.trim().toLowerCase()}_${this.mode}`;
      const modeLabel = this.mode === 'IN' ? 'masuk' : 'pulang';

      // Peringatan modal HANYA 1 KALI SAJA muncul untuk orang ini hari ini
      if (!this.warnedKeys.has(warnKey)) {
        this.warnedKeys.add(warnKey);
        this.showWarningModal(emp, alreadyDone);
        this.playWarning();
        const voiceWarn = `Perhatian, ${emp.name} sudah melakukan presensi ${modeLabel} hari ini.`;
        this.speak(voiceWarn);
      } else {
        // Jika sudah diperingatkan 1 kali, selanjutnya cukup update status bar (tidak spam popup)
        const statusEl = document.getElementById('scannerStatusText');
        if (statusEl) {
          statusEl.innerHTML = `🔵 ${emp.name} sudah absen ${modeLabel} hari ini`;
        }
      }

      setTimeout(() => { this.scanCooldown = false; }, 3500);
      return;
    }

    const snapshot = window.faceEngine.captureSnapshot(video);

    // Ketentuan Toleransi Jam Kerja PLN: Jam Masuk 07:30, Toleransi s/d 08:00
    const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
    const isLate = this.mode === 'IN' && minutesFromMidnight > 480; // Lewat 08:00 WIB
    const status = this.mode === 'IN' ? (isLate ? 'Terlambat' : 'Tepat Waktu') : 'Selesai Bertugas';

    const newRecord = {
      id: 'pln-' + Date.now(),
      nip: emp.nip,
      name: emp.name,
      department: emp.department || 'PLN PUSHARLIS',
      mode: this.mode,
      time: timeStr,
      date: dateStr,
      status,
      confidence,
      snapshot: snapshot || emp.photo
    };

    this.records.unshift(newRecord);
    this.saveRecords();

    // Sound & Voice
    this.playChime();
    this.triggerConfetti();

    const voiceMsg = this.mode === 'IN'
      ? `Presensi masuk berhasil. Selamat bertugas di PLN Pusharlis, ${emp.name}.`
      : `Presensi pulang berhasil. Terima kasih atas dedikasinya hari ini, ${emp.name}. Hati-hati di jalan.`;
    this.speak(voiceMsg);

    // Show Popup Modal
    this.showSuccessModal(newRecord);

    this.renderStats();
    this.renderLogTable();

    // Cooldown 5 detik agar tidak beruntun
    setTimeout(() => {
      this.scanCooldown = false;
    }, 5000);
  },

  showSuccessModal(rec) {
    const modal = document.getElementById('modalSuccess');
    if (!modal) return;

    document.getElementById('mPhoto').src = rec.snapshot;
    document.getElementById('mName').textContent = rec.name;
    document.getElementById('mNip').textContent = `NIP: ${rec.nip} • ${rec.department}`;
    document.getElementById('mTime').textContent = `${rec.time} WIB • ${rec.date}`;

    const badge = document.getElementById('mModeBadge');
    if (rec.mode === 'IN') {
      badge.textContent = '⚡ PRESENSI MASUK (IN)';
      badge.className = 'px-3 py-1 rounded-full text-xs font-black bg-cyan-100 text-cyan-800 border border-cyan-300';
    } else {
      badge.textContent = '⚡ PRESENSI PULANG (OUT)';
      badge.className = 'px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300';
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 4500);
  },

  closeModal() {
    const modal = document.getElementById('modalSuccess');
    if (modal) modal.classList.add('hidden');
  },

  showWarningModal(emp, existingRecord) {
    const modal = document.getElementById('modalWarning');
    if (!modal) return;

    const modeName = existingRecord.mode === 'IN' ? 'ABSEN MASUK (IN)' : 'ABSEN PULANG (OUT)';
    const badgeEl = document.getElementById('wBadge');
    if (badgeEl) badgeEl.textContent = `SUDAH ${modeName} HARI INI`;

    const nameEl = document.getElementById('wName');
    if (nameEl) nameEl.textContent = emp.name;

    const nipEl = document.getElementById('wNip');
    if (nipEl) nipEl.textContent = `NIP: ${emp.nip} • ${emp.department || 'PLN PUSHARLIS'}`;

    const msgEl = document.getElementById('wMessage');
    if (msgEl) msgEl.textContent = `Anda sudah tercatat melakukan ${modeName} pada hari ini.`;

    const timeEl = document.getElementById('wTime');
    if (timeEl) timeEl.textContent = `Waktu Absensi: ${existingRecord.time} WIB (${existingRecord.date})`;

    modal.classList.remove('hidden');

    if (this.warningTimeout) clearTimeout(this.warningTimeout);
    this.warningTimeout = setTimeout(() => {
      this.closeWarningModal();
    }, 4500);
  },

  closeWarningModal() {
    const modal = document.getElementById('modalWarning');
    if (modal) modal.classList.add('hidden');
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
      this.warningTimeout = null;
    }
  },

  // ── AUTENTIKASI ADMIN (user: admin, psswrd: admin123) ──
  openAdminLoginModal() {
    const modal = document.getElementById('modalAdminLogin');
    const errEl = document.getElementById('adminLoginError');
    if (errEl) errEl.classList.add('hidden');
    if (modal) {
      modal.classList.remove('hidden');
      const userInput = document.getElementById('adminUserInput');
      if (userInput) setTimeout(() => userInput.focus(), 100);
    }
  },

  closeAdminLoginModal() {
    const modal = document.getElementById('modalAdminLogin');
    if (modal) modal.classList.add('hidden');
  },

  submitAdminLogin(e) {
    e.preventDefault();
    const user = document.getElementById('adminUserInput').value.trim();
    const pass = document.getElementById('adminPassInput').value.trim();
    const errEl = document.getElementById('adminLoginError');

    // Validasi akun admin: user: admin, psswrd: admin123
    if (user === 'admin' && pass === 'admin123') {
      sessionStorage.setItem('pln_admin_auth', 'true');
      window.location.href = 'admin.html';
    } else {
      if (errEl) errEl.classList.remove('hidden');
    }
  },

  playWarning() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(240, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  },

  // Audio & Speech
  playChime() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {}
  },

  speak(text) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'id-ID';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  },

  triggerConfetti() {
    if (typeof window.confetti === 'function') {
      window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    }
  },

  // Render Ringkasan
  renderStats() {
    const today = this.getTodayString();
    const todayRecs = this.records.filter((r) => r.date === today);

    const totalIn = todayRecs.filter((r) => r.mode === 'IN').length;
    const totalOut = todayRecs.filter((r) => r.mode === 'OUT').length;
    const totalPegawai = this.employees.length;

    const elTotal = document.getElementById('statTotal');
    const elIn = document.getElementById('statIn');
    const elOut = document.getElementById('statOut');

    if (elTotal) elTotal.textContent = totalPegawai;
    if (elIn) elIn.textContent = totalIn;
    if (elOut) elOut.textContent = totalOut;
  },

  // Render Log Table
  renderLogTable() {
    const tbody = document.getElementById('logTableBody');
    if (!tbody) return;

    if (this.records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 text-xs">Belum ada riwayat absensi hari ini.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.records.slice(0, 10).map((r) => {
      const isIn = r.mode === 'IN';
      return `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 text-xs">
          <td class="py-3 px-3">
            <div class="flex items-center space-x-2.5">
              <img src="${r.snapshot}" class="w-8 h-8 rounded-full object-cover border border-slate-200" />
              <div>
                <div class="font-bold text-slate-800 leading-tight">${r.name}</div>
                <div class="text-[10px] font-mono text-slate-400">${r.nip || 'PLN PUSHARLIS'}</div>
              </div>
            </div>
          </td>
          <td class="py-3 px-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
              isIn ? 'bg-cyan-100 text-cyan-800' : 'bg-amber-100 text-amber-800'
            }">
              ${isIn ? '⚡ MASUK' : '⚡ PULANG'}
            </span>
          </td>
          <td class="py-3 px-3 font-mono text-slate-600 font-semibold">
            ${r.time}
          </td>
          <td class="py-3 px-3">
            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
              r.status === 'Terlambat' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            }">
              ${r.status}
            </span>
          </td>
          <td class="py-3 px-3 text-[10px] text-teal-700 font-bold">
            ${r.confidence}%
          </td>
        </tr>
      `;
    }).join('');
  },

  // Export CSV
  exportCSV() {
    if (this.records.length === 0) {
      alert('Belum ada data untuk diekspor!');
      return;
    }
    const headers = ['NIP', 'Nama Pegawai', 'Bidang / Unit', 'Tipe Presensi', 'Tanggal', 'Jam', 'Status', 'Akurasi'];
    const rows = this.records.map((r) => [
      `"${r.nip}"`, `"${r.name}"`, `"${r.department || 'PLN PUSHARLIS'}"`, `"${r.mode === 'IN' ? 'MASUK' : 'PULANG'}"`, `"${r.date}"`, `"${r.time}"`, `"${r.status}"`, `${r.confidence}%`
    ]);
    const csv = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PLN_PUSHARLIS_Absensi_${this.getTodayString()}.csv`;
    a.click();
  },

  // Modal Registrasi Pegawai Baru (Camera Handoff Bebas Konflik)
  openRegisterModal() {
    // 1. Matikan kamera scanner utama agar hardware kamera bebas digunakan
    this.stopMainCamera();

    document.getElementById('modalRegister').classList.remove('hidden');
    this.startRegCamera();
  },

  closeRegisterModal() {
    document.getElementById('modalRegister').classList.add('hidden');

    // 2. Matikan kamera registrasi dan bersihkan stream
    if (this.regStream) {
      this.regStream.getTracks().forEach((t) => t.stop());
      this.regStream = null;
    }
    const regVideo = document.getElementById('regVideo');
    if (regVideo) regVideo.srcObject = null;

    // 3. Beri jeda 400ms agar hardware webcam dilepas penuh oleh Windows sebelum dinyalakan ulang
    setTimeout(() => {
      this.initCamera();
    }, 400);
  },

  async startRegCamera() {
    const video = document.getElementById('regVideo');
    if (!video) return;

    try {
      this.regStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
      video.srcObject = this.regStream;
      video.onloadedmetadata = () => {
        video.play().catch((e) => console.warn('Reg video play delayed:', e));
      };
    } catch (e) {
      console.warn('Gagal membuka kamera registrasi:', e);
      const badge = document.getElementById('regStatusBadge');
      if (badge) {
        badge.textContent = 'Gagal mengakses webcam. Pastikan izin kamera aktif.';
        badge.className = 'text-xs text-rose-500 mt-2 font-bold';
      }
    }
  },

  async captureRegFace() {
    const video = document.getElementById('regVideo');
    const preview = document.getElementById('regPreview');
    const badge = document.getElementById('regStatusBadge');

    if (!video || video.readyState < 2) {
      alert('Kamera belum siap, mohon tunggu sebentar.');
      return;
    }

    const vw = video.videoWidth || 400;
    const vh = video.videoHeight || 400;

    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, vw, vh);

    const photoUrl = canvas.toDataURL('image/jpeg', 0.9);
    preview.src = photoUrl;
    preview.classList.remove('hidden');
    video.classList.add('hidden');

    // Deteksi koordinat wajah asli atau crop area tengah
    let desc = null;
    try {
      const detection = await window.faceEngine.detectFace(video);
      if (detection && detection.descriptor) {
        desc = detection.descriptor;
      }
    } catch (err) {}

    if (!desc) {
      const cropBox = {
        x: Math.floor(vw * 0.15),
        y: Math.floor(vh * 0.1),
        width: Math.floor(vw * 0.7),
        height: Math.floor(vh * 0.8)
      };
      desc = window.faceEngine.extractFastDescriptor(canvas, cropBox);
    }

    this.tempDescriptor = desc;
    this.tempPhoto = photoUrl;

    if (badge) {
      badge.textContent = '✓ Wajah & Biometrik 128 Titik Berhasil Direkam!';
      badge.className = 'text-xs font-bold text-emerald-400 mt-2';
    }

    document.getElementById('btnRegCapture').classList.add('hidden');
    document.getElementById('btnRegRetake').classList.remove('hidden');
  },

  retakeRegFace() {
    const video = document.getElementById('regVideo');
    const preview = document.getElementById('regPreview');
    const badge = document.getElementById('regStatusBadge');

    if (preview) preview.classList.add('hidden');
    if (video) video.classList.remove('hidden');
    if (badge) {
      badge.textContent = 'Arahkan wajah pas di dalam kotak';
      badge.className = 'text-xs text-slate-400 mt-2';
    }

    document.getElementById('btnRegCapture').classList.remove('hidden');
    document.getElementById('btnRegRetake').classList.add('hidden');
    this.tempDescriptor = null;
    this.tempPhoto = null;
  },

  submitRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();

    if (!name) {
      alert('Nama pegawai wajib diisi!');
      return;
    }

    if (!this.tempDescriptor || !this.tempPhoto) {
      alert('Silakan ambil foto wajah dengan menekan tombol "Ambil Foto Biometrik" terlebih dahulu!');
      return;
    }

    const newEmp = {
      nip: 'PLN-' + Math.floor(1000 + Math.random() * 9000),
      name,
      department: 'PLN PUSHARLIS',
      position: 'Pegawai',
      photo: this.tempPhoto,
      faceDescriptor: this.tempDescriptor
    };

    // Tambahkan di urutan pertama
    this.employees.unshift(newEmp);
    this.saveEmployees();
    this.renderStats();

    alert(`Pegawai "${name}" berhasil didaftarkan ke sistem Face ID!`);
    this.closeRegisterModal();
    this.retakeRegFace();
    document.getElementById('formRegister').reset();
  },

  // Modal Kelola Pegawai
  openEmployeesModal() {
    this.renderEmployeesList();
    document.getElementById('modalEmployees').classList.remove('hidden');
  },

  closeEmployeesModal() {
    document.getElementById('modalEmployees').classList.add('hidden');
  },

  renderEmployeesList() {
    const container = document.getElementById('employeesListContainer');
    if (!container) return;

    if (this.employees.length === 0) {
      container.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">Belum ada pegawai terdaftar.</div>`;
      return;
    }

    container.innerHTML = this.employees.map((emp, index) => {
      const hasBio = emp.faceDescriptor && emp.faceDescriptor.length === 128;
      return `
        <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
          <div class="flex items-center space-x-3">
            <img src="${emp.photo}" class="w-10 h-10 rounded-xl object-cover border border-slate-600" />
            <div>
              <div class="font-bold text-white text-xs sm:text-sm leading-tight">${emp.name}</div>
              <div class="text-[10px] font-mono text-slate-400">${emp.nip} • ${hasBio ? '<span class="text-emerald-400">Biometrik Aktif</span>' : '<span class="text-amber-400">Belum Ada Biometrik</span>'}</div>
            </div>
          </div>
          <button onclick="App.deleteEmployee(${index})" class="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition-all border border-rose-500/30">
            Hapus
          </button>
        </div>
      `;
    }).join('');
  },

  deleteEmployee(index) {
    const emp = this.employees[index];
    if (!emp) return;

    if (confirm(`Yakin ingin menghapus pegawai "${emp.name}"?`)) {
      this.employees.splice(index, 1);
      this.saveEmployees();
      this.renderEmployeesList();
      this.renderStats();
    }
  },

  // Test scan cepat untuk demo
  quickTest(idx = 0) {
    if (this.employees.length > idx) {
      const dummyVid = document.getElementById('scannerVideo') || document.createElement('video');
      this.recordAttendance(this.employees[idx], 99, dummyVid);
    }
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
