/**
 * PLN PUSHARLIS - Face ID Admin Controller
 * Mengelola Database Pegawai, Perekaman Wajah Baru, & Rekapitulasi Presensi
 */

const AdminApp = {
  activeTab: 'employees',
  employees: [],
  records: [],
  regStream: null,
  tempDescriptor: null,
  tempPhoto: null,

  getTodayString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  init() {
    this.checkAuth();
    this.loadStorage();
    this.initClock();
    this.renderStats();
    this.renderEmployeesTable();
    this.renderRecordsTable();

    if (window.faceEngine) {
      window.faceEngine.init().then(() => {
        console.log('⚡ PLN Admin: Face Engine Siap.');
      });
    }
  },

  // ── AUTENTIKASI ADMIN (user: admin, psswrd: admin123) ──
  checkAuth() {
    const isAuth = sessionStorage.getItem('pln_admin_auth') === 'true';
    const overlay = document.getElementById('adminAuthOverlay');
    if (!isAuth) {
      if (overlay) {
        overlay.classList.remove('hidden');
        const uInput = document.getElementById('directUserInput');
        if (uInput) setTimeout(() => uInput.focus(), 150);
      }
    } else {
      if (overlay) overlay.classList.add('hidden');
    }
  },

  submitDirectLogin(e) {
    e.preventDefault();
    const user = document.getElementById('directUserInput').value.trim();
    const pass = document.getElementById('directPassInput').value.trim();
    const errEl = document.getElementById('directLoginError');

    // Validasi akun admin: user: admin, psswrd: admin123
    if (user === 'admin' && pass === 'admin123') {
      sessionStorage.setItem('pln_admin_auth', 'true');
      const overlay = document.getElementById('adminAuthOverlay');
      if (overlay) overlay.classList.add('hidden');
    } else {
      if (errEl) errEl.classList.remove('hidden');
    }
  },

  logout() {
    sessionStorage.removeItem('pln_admin_auth');
    window.location.href = 'index.html';
  },

  loadStorage() {
    const savedEmp = localStorage.getItem('pln_pusharlis_employees');
    if (savedEmp) {
      try {
        this.employees = JSON.parse(savedEmp);
      } catch (e) {
        this.employees = [];
      }
    }

    const savedRec = localStorage.getItem('pln_pusharlis_records');
    if (savedRec) {
      try {
        this.records = JSON.parse(savedRec);
      } catch (e) {
        this.records = [];
      }
    }
  },

  saveEmployees() {
    localStorage.setItem('pln_pusharlis_employees', JSON.stringify(this.employees));
  },

  saveRecords() {
    localStorage.setItem('pln_pusharlis_records', JSON.stringify(this.records));
  },

  initClock() {
    const clockEl = document.getElementById('adminClock');
    const dateEl = document.getElementById('adminDate');
    const update = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
      }
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      }
    };
    update();
    setInterval(update, 1000);
  },

  renderStats() {
    const today = this.getTodayString();
    const todayRecs = this.records.filter((r) => r.date === today);
    const totalIn = todayRecs.filter((r) => r.mode === 'IN').length;
    const totalOut = todayRecs.filter((r) => r.mode === 'OUT').length;

    const elTotal = document.getElementById('admStatTotal');
    const elIn = document.getElementById('admStatIn');
    const elOut = document.getElementById('admStatOut');
    const elRecs = document.getElementById('admStatRecords');
    const badgeEmp = document.getElementById('badgeEmpCount');
    const badgeRec = document.getElementById('badgeRecCount');

    if (elTotal) elTotal.textContent = this.employees.length;
    if (elIn) elIn.textContent = totalIn;
    if (elOut) elOut.textContent = totalOut;
    if (elRecs) elRecs.textContent = this.records.length;
    if (badgeEmp) badgeEmp.textContent = this.employees.length;
    if (badgeRec) badgeRec.textContent = this.records.length;
  },

  switchTab(tab) {
    this.activeTab = tab;
    const tabEmp = document.getElementById('tabEmployees');
    const tabRec = document.getElementById('tabRecords');
    const btnEmp = document.getElementById('tabBtnEmployees');
    const btnRec = document.getElementById('tabBtnRecords');

    if (tab === 'employees') {
      tabEmp.classList.remove('hidden');
      tabRec.classList.add('hidden');
      btnEmp.className = 'py-3 px-5 font-black text-sm border-b-2 border-pln-cyan text-pln-cyan flex items-center space-x-2 transition-all';
      btnRec.className = 'py-3 px-5 font-bold text-sm border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center space-x-2 transition-all';
    } else {
      tabEmp.classList.add('hidden');
      tabRec.classList.remove('hidden');
      btnRec.className = 'py-3 px-5 font-black text-sm border-b-2 border-pln-cyan text-pln-cyan flex items-center space-x-2 transition-all';
      btnEmp.className = 'py-3 px-5 font-bold text-sm border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center space-x-2 transition-all';
    }
  },

  // ── MANAJEMEN PEGAWAI ──
  renderEmployeesTable() {
    const tbody = document.getElementById('adminEmployeesTable');
    if (!tbody) return;

    if (this.employees.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-xs font-semibold">Belum ada pegawai yang terdaftar. Klik "+ Daftar Pegawai & Rekam Wajah Baru" di atas.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.employees.map((emp, index) => {
      const hasBio = emp.faceDescriptor && emp.faceDescriptor.length === 128;
      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-3 px-4">
            <img src="${emp.photo}" class="w-11 h-11 rounded-xl object-cover border border-slate-700 shadow-sm" />
          </td>
          <td class="py-3 px-4 font-bold text-white text-sm">
            ${emp.name}
          </td>
          <td class="py-3 px-4 font-mono text-xs text-slate-300">
            ${emp.nip}
          </td>
          <td class="py-3 px-4 text-xs text-slate-400">
            ${emp.department || 'PLN PUSHARLIS'}
          </td>
          <td class="py-3 px-4 text-xs">
            ${hasBio ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Biometrik 128D</span>' : '<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">Belum Ada Biometrik</span>'}
          </td>
          <td class="py-3 px-4 text-right">
            <button onclick="AdminApp.deleteEmployee(${index})" class="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition-all border border-rose-500/30">
              🗑️ Hapus
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  deleteEmployee(index) {
    const emp = this.employees[index];
    if (!emp) return;

    if (confirm(`Yakin ingin menghapus pegawai "${emp.name}" (NIP: ${emp.nip}) dari database?`)) {
      this.employees.splice(index, 1);
      this.saveEmployees();
      this.renderEmployeesTable();
      this.renderStats();
    }
  },

  // ── MODAL REGISTRASI WEBCAM ──
  openRegisterModal() {
    document.getElementById('modalRegister').classList.remove('hidden');
    this.startRegCamera();
  },

  closeRegisterModal() {
    document.getElementById('modalRegister').classList.add('hidden');
    if (this.regStream) {
      this.regStream.getTracks().forEach((t) => t.stop());
      this.regStream = null;
    }
    const regVideo = document.getElementById('regVideo');
    if (regVideo) regVideo.srcObject = null;
    this.retakeRegFace();
    document.getElementById('formRegister').reset();
  },

  async startRegCamera() {
    const video = document.getElementById('regVideo');
    if (!video) return;

    try {
      this.regStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
      video.srcObject = this.regStream;
      video.onloadedmetadata = () => {
        video.play().catch(() => {});
      };
    } catch (e) {
      console.warn('Gagal membuka webcam registrasi:', e);
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

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, vw, vh);

    const photoUrl = canvas.toDataURL('image/jpeg', 0.9);
    preview.src = photoUrl;
    preview.classList.remove('hidden');
    video.classList.add('hidden');

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
      badge.textContent = 'Arahkan wajah pas di dalam kotak kamera';
      badge.className = 'text-xs text-slate-400 mt-2';
    }

    const btnCap = document.getElementById('btnRegCapture');
    const btnRet = document.getElementById('btnRegRetake');
    if (btnCap) btnCap.classList.remove('hidden');
    if (btnRet) btnRet.classList.add('hidden');
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

    this.employees.unshift(newEmp);
    this.saveEmployees();
    this.renderStats();
    this.renderEmployeesTable();

    alert(`Pegawai "${name}" berhasil didaftarkan ke sistem Face ID!`);
    this.closeRegisterModal();
  },

  // ── MANAJEMEN LOG PRESENSI DENGAN FILTER TANGGAL ──
  setDatePreset(type) {
    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    const now = new Date();
    const todayStr = this.getTodayString(now);

    if (type === 'today') {
      if (startInput) startInput.value = todayStr;
      if (endInput) endInput.value = todayStr;
    } else if (type === '7days') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      if (startInput) startInput.value = this.getTodayString(past);
      if (endInput) endInput.value = todayStr;
    } else if (type === 'month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      if (startInput) startInput.value = `${year}-${month}-01`;
      if (endInput) endInput.value = todayStr;
    } else if (type === 'all') {
      if (startInput) startInput.value = '';
      if (endInput) endInput.value = '';
    }
    this.renderRecordsTable();
  },

  getFilteredRecords() {
    const filterMode = document.getElementById('filterMode')?.value || 'ALL';
    const startDate = document.getElementById('filterStartDate')?.value || '';
    const endDate = document.getElementById('filterEndDate')?.value || '';

    return this.records.filter((r) => {
      // 1. Filter Mode (IN / OUT / ALL)
      if (filterMode !== 'ALL' && r.mode !== filterMode) return false;

      // 2. Filter Rentang Tanggal (YYYY-MM-DD)
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;

      return true;
    });
  },

  renderRecordsTable() {
    const tbody = document.getElementById('adminRecordsTable');
    if (!tbody) return;

    const filtered = this.getFilteredRecords();
    const labelResult = document.getElementById('filterResultLabel');
    if (labelResult) {
      labelResult.textContent = `Menampilkan ${filtered.length} dari ${this.records.length} data`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 text-xs font-semibold">Tidak ada riwayat presensi yang sesuai dengan rentang tanggal dan filter ini.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((rec, index) => {
      const isLate = rec.status === 'Terlambat';
      const isOut = rec.mode === 'OUT';

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-2.5 px-4">
            <img src="${rec.snapshot}" class="w-10 h-10 rounded-xl object-cover border border-slate-700 shadow-sm" />
          </td>
          <td class="py-2.5 px-4 font-bold text-white text-xs sm:text-sm">
            <div>${rec.name}</div>
            <div class="text-[10px] font-mono text-slate-400">${rec.nip}</div>
          </td>
          <td class="py-2.5 px-4 text-xs font-black">
            ${isOut ? '<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">🚪 PULANG</span>' : '<span class="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">⚡ MASUK</span>'}
          </td>
          <td class="py-2.5 px-4 font-mono text-xs text-white">
            ${rec.time} WIB
          </td>
          <td class="py-2.5 px-4 text-xs text-slate-400 font-mono">
            ${rec.date}
          </td>
          <td class="py-2.5 px-4 text-xs">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isLate ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}">
              ${rec.status}
            </span>
          </td>
          <td class="py-2.5 px-4 text-xs text-slate-400 font-mono">
            ${rec.confidence}%
          </td>
          <td class="py-2.5 px-4 text-right">
            <button onclick="AdminApp.deleteRecord(${index})" class="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition-all border border-rose-500/30">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterRecords() {
    this.renderRecordsTable();
  },

  deleteRecord(index) {
    if (confirm('Hapus baris catatan presensi ini?')) {
      this.records.splice(index, 1);
      this.saveRecords();
      this.renderRecordsTable();
      this.renderStats();
    }
  },

  clearRecords() {
    if (confirm('Peringatan: Yakin ingin menghapus SELURUH riwayat presensi yang tersimpan?')) {
      this.records = [];
      this.saveRecords();
      this.renderRecordsTable();
      this.renderStats();
    }
  },

  // Export CSV sesuai rentang tanggal & mode yang sedang difilter
  exportCSV() {
    const targetRecords = this.getFilteredRecords();

    if (targetRecords.length === 0) {
      alert('Tidak ada data riwayat presensi yang sesuai dengan filter tanggal yang dipilih untuk diekspor!');
      return;
    }

    const startDate = document.getElementById('filterStartDate')?.value || 'awal';
    const endDate = document.getElementById('filterEndDate')?.value || 'akhir';
    const filterMode = document.getElementById('filterMode')?.value || 'ALL';

    const headers = ['ID,Nama Pegawai,NIP,Unit/Bidang,Mode,Jam,Tanggal,Status,Akurasi Biometrik'];
    const rows = targetRecords.map((r) =>
      `"${r.id}","${r.name}","${r.nip}","${r.department}","${r.mode}","${r.time}","${r.date}","${r.status}","${r.confidence}%"`
    );

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);

    const filename = `rekap_presensi_pusharlis_${filterMode}_${startDate}_sd_${endDate}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

window.AdminApp = AdminApp;
document.addEventListener('DOMContentLoaded', () => AdminApp.init());
