(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const KEY_PREF = 'hcga_pref';
  const KEY_TOKEN = 'hcga_token';
  const $ = (sel) => document.querySelector(sel);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let pref = Object.assign({ tema: 'gelap', bg: CFG.BG_DEFAULT, suara: true }, muatPref());
  let semuaMenu = [];
  let bulanAktif = new Date();
  bulanAktif.setDate(1);

  /* ===================== PENYIMPANAN LOKAL ===================== */

  function muatPref() {
    try { return JSON.parse(localStorage.getItem(KEY_PREF)) || {}; } catch (e) { return {}; }
  }
  function simpanPref() {
    try { localStorage.setItem(KEY_PREF, JSON.stringify(pref)); } catch (e) { /* abaikan */ }
  }

  /* ===================== API (ADAPTER KE GAS) ===================== */

  async function api(action, params = {}) {
    const token = sessionStorage.getItem(KEY_TOKEN) || '';
    let res;
    try {
      res = await fetch(CFG.GAS_URL, {
        method: 'POST',
        // text/plain menghindari preflight CORS yang tidak bisa dijawab GAS
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token, ...params })
      });
    } catch (e) {
      throw new Error('Tidak bisa terhubung ke server. Periksa GAS_URL di config.js.');
    }
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'Terjadi kesalahan');
    return out.data;
  }

  /* ===================== HELPER DOM ===================== */

  function buatEl(tag, cls, teks) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (teks != null) el.textContent = teks;
    return el;
  }

  /* ===================== TEMA & BACKGROUND ===================== */

  function terapkanTema() { document.body.dataset.theme = pref.tema; }
  function terapkanBg() {
    $('#bg').dataset.bg = pref.bg;
    document.querySelectorAll('.bg-pilihan').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.bg === pref.bg)));
  }

  function setupTampilan() {
    $('#btnTema').addEventListener('click', () => {
      pref.tema = pref.tema === 'gelap' ? 'terang' : 'gelap';
      simpanPref();
      terapkanTema();
    });

    const panel = $('#panelBg');
    CFG.BACKGROUNDS.forEach(b => {
      const btn = buatEl('button', 'bg-pilihan', b.nama);
      btn.dataset.bg = b.id;
      btn.addEventListener('click', () => {
        pref.bg = b.id;
        simpanPref();
        terapkanBg();
      });
      panel.appendChild(btn);
    });
    $('#btnBg').addEventListener('click', () => { panel.hidden = !panel.hidden; });
    terapkanBg();
  }

  /* ===================== SUARA GEMERCIK AIR (WEB AUDIO, TANPA FILE) ===================== */

  const Air = (() => {
    let ctx = null, sumber = null, gain = null, timer = null, jalan = false;

    function buatNoise(c) {
      const len = c.sampleRate * 3;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise halus
        d[i] = last * 3.5;
      }
      return buf;
    }

    function tetes() {
      if (!jalan) return;
      const c = ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      const f = 600 + Math.random() * 1400;
      o.type = 'sine';
      o.frequency.setValueAtTime(f, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, c.currentTime + 0.08);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12);
      o.connect(g);
      g.connect(gain);
      o.start();
      o.stop(c.currentTime + 0.14);
      timer = setTimeout(tetes, 150 + Math.random() * 450);
    }

    function mulai() {
      if (jalan) return true;
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return false;
        ctx = new C();
      }
      // Browser memblokir audio sebelum ada sentuhan/klik; bangunkan saat interaksi pertama
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
        ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
          document.addEventListener(ev, () => ctx.resume().catch(() => {}), { once: true }));
      }
      gain = ctx.createGain();
      gain.gain.value = 0.18;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1200;
      sumber = ctx.createBufferSource();
      sumber.buffer = buatNoise(ctx);
      sumber.loop = true;
      sumber.connect(filt);
      filt.connect(gain);
      gain.connect(ctx.destination);
      sumber.start();
      jalan = true;
      tetes();
      return true;
    }

    function henti() {
      jalan = false;
      clearTimeout(timer);
      try { if (sumber) sumber.stop(); } catch (e) { /* sudah berhenti */ }
      sumber = null;
    }

    return { mulai, henti };
  })();

  function setupSuara() {
    const btn = $('#btnSuara');
    const sinkron = () => {
      btn.textContent = pref.suara ? '🔊' : '🔇';
      btn.setAttribute('aria-pressed', String(pref.suara));
    };
    sinkron();

    btn.addEventListener('click', () => {
      pref.suara = !pref.suara;
      simpanPref();
      sinkron();
      if (pref.suara) Air.mulai(); else Air.henti();
    });

    if (pref.suara) Air.mulai();
  }

  /* ===================== LOGIN & MENU ===================== */

  function tampilLogin(pesan) {
    $('#loginOverlay').hidden = false;
    $('#loginMsg').textContent = pesan || '';
    $('#btnLogout').hidden = true;
    document.body.classList.add('terkunci');
  }

  function sembunyikanLogin() {
    $('#loginOverlay').hidden = true;
    $('#loginMsg').textContent = '';
    $('#btnLogout').hidden = false;
    document.body.classList.remove('terkunci');
  }

  async function muatMenu() {
    $('#status').textContent = 'Memuat aplikasi...';
    try {
      const d = await api('menu');
      semuaMenu = d.menu;
      $('#status').textContent = semuaMenu.length ? '' : 'Belum ada aplikasi yang terdaftar.';
      render();
    } catch (e) {
      if (/login|Sesi/i.test(e.message)) {
        sessionStorage.removeItem(KEY_TOKEN);
        tampilLogin(e.message);
      } else {
        $('#status').textContent = e.message;
      }
    }
  }

  function setupLogin() {
    $('#formLogin').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $('#loginMsg').textContent = 'Memeriksa...';
      try {
        const d = await api('login', { email: $('#email').value, password: $('#password').value });
        sessionStorage.setItem(KEY_TOKEN, d.token);
        $('#password').value = '';
        sembunyikanLogin();
        await muatMenu();
      } catch (e) {
        $('#loginMsg').textContent = e.message;
      }
    });

    $('#btnLogout').addEventListener('click', async () => {
      try { await api('logout'); } catch (e) { /* abaikan */ }
      sessionStorage.removeItem(KEY_TOKEN);
      semuaMenu = [];
      $('#daftarUnit').textContent = '';
      tampilLogin('Anda sudah keluar.');
    });
  }

  /* ===================== RENDER MENU ===================== */

  function render() {
    const q = $('#cari').value.trim().toLowerCase();
    const hasil = semuaMenu.filter(m =>
      !q || (m.nama + ' ' + m.deskripsi + ' ' + m.unit).toLowerCase().includes(q));

    const wadah = $('#daftarUnit');
    wadah.textContent = '';
    $('#kosong').hidden = hasil.length > 0;

    const grup = new Map();
    hasil.forEach(m => {
      if (!grup.has(m.unit)) grup.set(m.unit, []);
      grup.get(m.unit).push(m);
    });
    grup.forEach((items, unit) => wadah.appendChild(buatGrup(unit, items)));

    observeReveal();
  }

  function buatGrup(unit, items) {
    const sec = buatEl('section', 'unit reveal');
    const grid = buatEl('div', 'grid');
    items.forEach(m => grid.appendChild(buatKartu(m)));
    sec.append(buatEl('h2', 'unit-judul', unit), grid);
    return sec;
  }

  function buatKartu(m) {
    const a = buatEl('a', 'card');
    a.href = m.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.append(
      buatEl('div', 'card-ikon', m.ikon || '▣'),
      buatEl('h3', 'card-nama', m.nama),
      buatEl('p', 'card-desk', m.deskripsi || 'Klik untuk membuka aplikasi.')
    );
    if (!reduceMotion) {
      a.addEventListener('pointermove', tilt);
      a.addEventListener('pointerleave', () => {
        a.style.setProperty('--rx', '0deg');
        a.style.setProperty('--ry', '0deg');
      });
    }
    return a;
  }

  function tilt(ev) {
    const r = this.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width - 0.5;
    const y = (ev.clientY - r.top) / r.height - 0.5;
    this.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
    this.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
  }

  /* ===================== KALENDER (TAMPILAN SAJA) ===================== */

  function renderKalender() {
    const y = bulanAktif.getFullYear();
    const m = bulanAktif.getMonth();
    $('#kalJudul').textContent = bulanAktif.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    const grid = $('#kalGrid');
    grid.textContent = '';
    ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].forEach(h => grid.appendChild(buatEl('div', 'kal-head', h)));

    const awal = (new Date(y, m, 1).getDay() + 6) % 7; // minggu mulai Senin
    const jumlah = new Date(y, m + 1, 0).getDate();
    const hariIni = new Date();

    for (let i = 0; i < awal; i++) grid.appendChild(buatEl('div', 'kal-kosong'));
    for (let d = 1; d <= jumlah; d++) {
      const wd = new Date(y, m, d).getDay();
      const cell = buatEl('div', 'kal-hari', String(d));
      if (wd === 0 || wd === 6) cell.classList.add('akhir-pekan');
      if (d === hariIni.getDate() && m === hariIni.getMonth() && y === hariIni.getFullYear()) {
        cell.classList.add('hari-ini');
      }
      grid.appendChild(cell);
    }
  }

  function setupKalender() {
    $('#kalPrev').addEventListener('click', () => { bulanAktif.setMonth(bulanAktif.getMonth() - 1); renderKalender(); });
    $('#kalNext').addEventListener('click', () => { bulanAktif.setMonth(bulanAktif.getMonth() + 1); renderKalender(); });
    renderKalender();
  }

  /* ===================== ANIMASI SKROL ===================== */

  const io = ('IntersectionObserver' in window)
    ? new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            en.target.classList.add('show');
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.12 })
    : null;

  function observeReveal() {
    document.querySelectorAll('.reveal:not(.show)').forEach(el => {
      if (io) io.observe(el); else el.classList.add('show');
    });
  }

  function setupParallax() {
    if (reduceMotion) return;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        $('#bg').style.transform = 'translate3d(0,' + (-window.scrollY * 0.12).toFixed(1) + 'px,0)';
        ticking = false;
      });
    }, { passive: true });
  }

  /* ===================== INISIALISASI ===================== */

  function init() {
    terapkanTema();
    setupTampilan();
    setupSuara();
    setupKalender();
    setupLogin();
    setupParallax();
    $('#cari').addEventListener('input', render);
    observeReveal();

    if (sessionStorage.getItem(KEY_TOKEN)) {
      sembunyikanLogin();
      muatMenu();
    } else {
      tampilLogin('');
    }
  }

  init();
})();
