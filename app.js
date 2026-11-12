(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const KEY_PREF = 'hcga_pref';
  const KEY_TOKEN = 'hcga_token';
  const $ = (sel) => document.querySelector(sel);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Background bawaan. Foto unggahan pengguna ditambahkan setelahnya (kunci "u:<id>").
  const SCENES = [
    { id: 'daun',  nama: 'Daun & Tetes Air' },
    { id: 'hutan', nama: 'Hutan' },
    { id: 'air',   nama: 'Air' }
  ];
  const MAKS_FOTO = 8;

  let pref = Object.assign({ tema: 'gelap', bg: 'daun', suara: true }, muatPref());
  let semuaMenu = [];
  let bulanAktif = new Date();
  bulanAktif.setDate(1);

  let fotoList = [];     // { id, nama, blob, url }
  let fotoSiap = false;
  let pesanBg = '';
  let toastTimer = null;

  /* ===================== PENYIMPANAN LOKAL ===================== */

  function muatPref() {
    try { return JSON.parse(localStorage.getItem(KEY_PREF)) || {}; } catch (e) { return {}; }
  }
  function simpanPref() {
    try { localStorage.setItem(KEY_PREF, JSON.stringify(pref)); } catch (e) { /* abaikan */ }
  }

  // Foto unggahan disimpan di IndexedDB (muat lebih besar daripada localStorage)
  const DB = (() => {
    let dbp = null;
    function buka() {
      if (!dbp) {
        dbp = new Promise((res, rej) => {
          const r = indexedDB.open('hcga_bg', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('foto', { keyPath: 'id' });
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      }
      return dbp;
    }
    async function tx(mode, fn) {
      const db = await buka();
      return new Promise((res, rej) => {
        const t = db.transaction('foto', mode);
        const rq = fn(t.objectStore('foto'));
        t.oncomplete = () => res(rq ? rq.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    }
    return {
      semua: () => tx('readonly', (s) => s.getAll()),
      simpan: (o) => tx('readwrite', (s) => s.put(o)),
      hapus: (id) => tx('readwrite', (s) => s.delete(id))
    };
  })();

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

  function toast(teks) {
    const t = $('#toast');
    t.textContent = teks;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
  }

  /* ===================== TEMA ===================== */

  function terapkanTema() { document.body.dataset.theme = pref.tema; }

  /* ===================== ANIMASI TEKS HERO ===================== */

  // Memecah judul menjadi kata-kata agar bisa muncul satu per satu
  function pecahKata(el) {
    const teks = el.textContent.trim();
    let i = 0;
    const walk = (sumber, tujuan) => {
      sumber.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((t) => {
            if (!t) return;
            if (/^\s+$/.test(t)) {
              tujuan.appendChild(document.createTextNode(' '));
            } else {
              const s = document.createElement('span');
              s.className = 'kata';
              s.style.setProperty('--i', String(i++));
              s.setAttribute('aria-hidden', 'true');
              s.textContent = t;
              tujuan.appendChild(s);
            }
          });
        } else if (n.nodeType === 1) {
          const c = n.cloneNode(false);
          tujuan.appendChild(c);
          walk(n, c);
        }
      });
    };
    const baru = el.cloneNode(false);
    walk(el, baru);
    el.replaceChildren(...baru.childNodes);
    el.setAttribute('aria-label', teks);

    // Elemen lain muncul setelah kata terakhir
    const jeda = i * 0.13 + 0.9;
    const urut = [['.eyebrow', 0.1], ['.lead', jeda], ['.cta-row', jeda + 0.3]];
    urut.forEach(([sel, d]) => {
      const x = document.querySelector('#hero ' + sel);
      if (x) x.style.setProperty('--delay', d.toFixed(2) + 's');
    });
    $('#hero').classList.add('animasi');
  }

  function mainkanTeks() {
    const hero = $('#hero');
    hero.classList.remove('tampil');
    const fontSiap = (document.fonts && document.fonts.ready)
      ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))])
      : Promise.resolve();
    fontSiap.then(() => {
      void hero.offsetWidth;
      requestAnimationFrame(() => hero.classList.add('tampil'));
    });
  }

  /* ===================== TETESAN AIR PADA DAUN (SVG) ===================== */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buatTetes() {
    const g = $('#tetes');
    const daun = $('#leaf1Path');
    if (!g || !daun) return;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attr) => {
      const e = document.createElementNS(NS, tag);
      Object.keys(attr).forEach((k) => e.setAttribute(k, attr[k]));
      return e;
    };

    const satuTetes = (x, y, r, i) => {
      const t = el('g', { transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' });
      t.appendChild(el('ellipse', { cx: r * 0.22, cy: r * 0.92, rx: r * 0.9, ry: r * 0.32, fill: '#000', 'fill-opacity': 0.32 }));
      t.appendChild(el('circle', { r: r, fill: 'url(#gTetes)', stroke: '#e9ffe0', 'stroke-opacity': 0.38, 'stroke-width': Math.max(0.8, r * 0.06) }));
      t.appendChild(el('ellipse', { cx: 0, cy: r * 0.45, rx: r * 0.6, ry: r * 0.28, fill: '#e6ffc4', 'fill-opacity': 0.28 }));
      const k = el('g', { class: i % 4 === 0 ? 'kilau' : '' });
      k.style.setProperty('--d', ((i * 0.37) % 4).toFixed(2) + 's');
      k.appendChild(el('circle', { cx: -r * 0.33, cy: -r * 0.36, r: Math.max(1.2, r * 0.2), fill: '#fff', 'fill-opacity': 0.92 }));
      k.appendChild(el('circle', { cx: r * 0.34, cy: r * 0.3, r: Math.max(0.8, r * 0.09), fill: '#fff', 'fill-opacity': 0.55 }));
      t.appendChild(k);
      return t;
    };

    const rnd = mulberry32(7);
    const bisaCek = typeof daun.isPointInFill === 'function' && typeof DOMPoint === 'function';
    let n = 0;
    let coba = 0;
    while (n < 38 && coba < 2000) {
      coba++;
      const x = 60 + rnd() * 800;
      const y = 110 + rnd() * 900;
      if (bisaCek && !daun.isPointInFill(new DOMPoint(x, y))) continue;
      const besar = rnd() < 0.18;
      const r = besar ? 14 + rnd() * 14 : 4 + rnd() * 8;
      g.appendChild(satuTetes(x, y, r, n));
      n++;
    }

    // Beberapa tetesan yang perlahan meluncur turun
    [[430, 520, 16, 0], [560, 330, 13, 2.6], [300, 760, 18, 5]].forEach((p, idx) => {
      const w = el('g', { class: 'meluncur' });
      w.style.setProperty('--dx', '-8px');
      w.style.setProperty('--dy', '70px');
      w.style.setProperty('--d', p[3] + 's');
      w.appendChild(satuTetes(p[0], p[1], p[2], 100 + idx));
      g.appendChild(w);
    });
  }

  // Di ponsel, area pandang dipersempit agar daun utama tetap terlihat utuh
  function setupViewBox() {
    const svg = $('#daunSvg');
    if (!svg || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 860px)');
    const atur = () => {
      svg.setAttribute('viewBox', mq.matches ? '640 0 720 900' : '0 0 1600 900');
      svg.setAttribute('preserveAspectRatio', mq.matches ? 'xMidYMid slice' : 'xMaxYMid slice');
    };
    atur();
    if (mq.addEventListener) mq.addEventListener('change', atur); else mq.addListener(atur);
  }

  /* ===================== BACKGROUND (BAWAAN + FOTO SENDIRI) ===================== */

  function daftarSlide() {
    return SCENES
      .map((s) => ({ kunci: s.id, nama: s.nama, tipe: 'bawaan', scene: s.id }))
      .concat(fotoList.map((f) => ({ kunci: 'u:' + f.id, nama: f.nama, tipe: 'foto', url: f.url, id: f.id })));
  }

  function slideAktif() {
    return daftarSlide().find((s) => s.kunci === pref.bg) || null;
  }

  function terapkanBg() {
    const scene = $('#scene');
    const bg = $('#bg');
    const foto = $('#sceneFoto');
    let s = slideAktif();

    if (!s) {
      if (/^u:/.test(pref.bg) && !fotoSiap) {   // foto masih dimuat dari penyimpanan
        scene.dataset.scene = 'muat';
        return;
      }
      pref.bg = 'daun';
      simpanPref();
      s = slideAktif();
    }

    const sc = s.tipe === 'foto' ? 'foto' : s.scene;
    scene.dataset.scene = sc;
    bg.dataset.scene = sc;
    if (s.tipe === 'foto') {
      const u = 'url("' + s.url + '")';
      foto.style.backgroundImage = u;
      bg.style.backgroundImage = u;
    } else {
      foto.style.backgroundImage = '';
      bg.style.backgroundImage = '';
    }
    renderDots();
    renderPanelBg();
  }

  function pilihSlide(kunci) {
    if (pref.bg === kunci) return;
    pref.bg = kunci;
    simpanPref();
    terapkanBg();
    if (!reduceMotion) {
      $('#scene').animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
    }
    if ($('#loginOverlay').hidden) mainkanTeks();
  }

  function geser(arah) {
    const l = daftarSlide();
    let i = l.findIndex((s) => s.kunci === pref.bg);
    if (i < 0) i = 0;
    pilihSlide(l[(i + arah + l.length) % l.length].kunci);
  }

  function renderDots() {
    const d = $('#dots');
    d.textContent = '';
    daftarSlide().forEach((s) => {
      const b = buatEl('button', 'dot');
      b.type = 'button';
      b.setAttribute('aria-label', 'Background: ' + s.nama);
      if (s.kunci === pref.bg) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => pilihSlide(s.kunci));
      d.appendChild(b);
    });
  }

  /* ---------- Panel pilihan background ---------- */

  function bukaPanel(buka) {
    $('#panelBg').hidden = !buka;
    ['#btnBg', '#btnBgHero'].forEach((sel) => $(sel).setAttribute('aria-expanded', String(buka)));
    if (buka) pesanBg = '';
    if (buka) renderPanelBg();
  }
  function tutupPanel() { bukaPanel(false); }

  function renderPanelBg() {
    const p = $('#panelBg');
    p.textContent = '';
    p.appendChild(buatEl('p', 'pb-judul', 'Pilih background'));

    const grid = buatEl('div', 'pb-grid');
    daftarSlide().forEach((s) => {
      const w = buatEl('div', 'pb-item');
      const b = buatEl('button', 'pb-thumb');
      b.type = 'button';
      b.setAttribute('aria-label', s.nama);
      b.setAttribute('aria-pressed', String(s.kunci === pref.bg));
      if (s.tipe === 'foto') b.style.backgroundImage = 'url("' + s.url + '")';
      else b.dataset.scene = s.scene;
      b.addEventListener('click', () => { pilihSlide(s.kunci); tutupPanel(); });
      w.append(b, buatEl('span', 'pb-nama', s.nama));
      if (s.tipe === 'foto') {
        const x = buatEl('button', 'pb-hapus', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Hapus foto ' + s.nama);
        x.addEventListener('click', () => hapusFoto(s.id));
        w.appendChild(x);
      }
      grid.appendChild(w);
    });

    const unggah = buatEl('button', 'pb-unggah', '＋ Unggah foto sendiri');
    unggah.type = 'button';
    unggah.addEventListener('click', () => $('#fileBg').click());

    const info = buatEl('p', 'pb-info', 'Foto dari Pinterest atau galeri disimpan di browser ini saja dan tidak dikirim ke server.');
    const pesan = buatEl('p', 'pb-pesan', pesanBg);
    pesan.setAttribute('role', 'status');
    p.append(grid, unggah, info, pesan);
  }

  /* ---------- Unggah foto ---------- */

  async function kompres(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Gambar tidak bisa dibaca. Gunakan JPG, PNG, atau WebP.'));
        i.src = url;
      });
      const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((res, rej) =>
        c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal memproses gambar.'))), 'image/jpeg', 0.84));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function namaBersih(n) {
    const x = String(n || '').replace(/\.[^.]+$/, '').trim().slice(0, 24);
    return x || 'Foto saya';
  }

  async function tambahFoto(file) {
    if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 20 MB.');
    if (fotoList.length >= MAKS_FOTO) throw new Error('Maksimal ' + MAKS_FOTO + ' foto. Hapus salah satu dulu.');
    const blob = await kompres(file);
    const rec = { id: 'f' + Date.now().toString(36), nama: namaBersih(file.name), blob: blob, dibuat: Date.now() };
    let tersimpan = true;
    try {
      if (!window.indexedDB) throw new Error('tanpa penyimpanan');
      await DB.simpan(rec);
    } catch (e) {
      tersimpan = false;
    }
    fotoList.push({ id: rec.id, nama: rec.nama, blob: blob, url: URL.createObjectURL(blob) });
    return { kunci: 'u:' + rec.id, tersimpan: tersimpan };
  }

  async function hapusFoto(id) {
    const i = fotoList.findIndex((f) => f.id === id);
    if (i < 0) return;
    try { await DB.hapus(id); } catch (e) { /* abaikan */ }
    URL.revokeObjectURL(fotoList[i].url);
    fotoList.splice(i, 1);
    if (pref.bg === 'u:' + id) { pref.bg = 'daun'; simpanPref(); }
    terapkanBg();
    toast('Foto dihapus.');
  }

  async function muatFoto() {
    try {
      const rows = window.indexedDB ? await DB.semua() : [];
      fotoList = rows
        .sort((a, b) => a.dibuat - b.dibuat)
        .map((r) => ({ id: r.id, nama: r.nama, blob: r.blob, url: URL.createObjectURL(r.blob) }));
    } catch (e) {
      fotoList = [];
    }
    fotoSiap = true;
  }

  function setupTampilan() {
    $('#btnTema').addEventListener('click', () => {
      pref.tema = pref.tema === 'gelap' ? 'terang' : 'gelap';
      simpanPref();
      terapkanTema();
    });

    const toggle = () => bukaPanel($('#panelBg').hidden);
    $('#btnBg').addEventListener('click', toggle);
    $('#btnBgHero').addEventListener('click', toggle);

    // Panel menutup saat klik di luar atau menekan Esc
    document.addEventListener('pointerdown', (e) => {
      const p = $('#panelBg');
      if (p.hidden) return;
      if (p.contains(e.target) || e.target.closest('#btnBg, #btnBgHero')) return;
      tutupPanel();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupPanel(); });

    $('#slidePrev').addEventListener('click', () => geser(-1));
    $('#slideNext').addEventListener('click', () => geser(1));

    $('#fileBg').addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      pesanBg = 'Memproses foto...';
      renderPanelBg();
      try {
        const r = await tambahFoto(file);
        pesanBg = '';
        pilihSlide(r.kunci);
        tutupPanel();
        toast(r.tersimpan
          ? 'Background diganti dengan foto Anda.'
          : 'Background diganti, tetapi browser tidak mengizinkan penyimpanan. Foto hilang saat halaman ditutup.');
      } catch (e) {
        pesanBg = e.message;
        renderPanelBg();
      }
    });

    renderDots();
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
        ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
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
    $('#hero').classList.remove('tampil');
  }

  function sembunyikanLogin() {
    $('#loginOverlay').hidden = true;
    $('#loginMsg').textContent = '';
    $('#btnLogout').hidden = false;
    document.body.classList.remove('terkunci');
    mainkanTeks();   // judul muncul setelah pengguna masuk
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
    const hasil = semuaMenu.filter((m) =>
      !q || (m.nama + ' ' + m.deskripsi + ' ' + m.unit).toLowerCase().includes(q));

    const wadah = $('#daftarUnit');
    wadah.textContent = '';
    $('#kosong').hidden = hasil.length > 0;

    const grup = new Map();
    hasil.forEach((m) => {
      if (!grup.has(m.unit)) grup.set(m.unit, []);
      grup.get(m.unit).push(m);
    });
    grup.forEach((items, unit) => wadah.appendChild(buatGrup(unit, items)));

    observeReveal();
  }

  function buatGrup(unit, items) {
    const sec = buatEl('section', 'unit reveal');
    const grid = buatEl('div', 'grid');
    items.forEach((m) => grid.appendChild(buatKartu(m)));
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
    ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].forEach((h) => grid.appendChild(buatEl('div', 'kal-head', h)));

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

  /* ===================== ANIMASI SKROL & POINTER ===================== */

  const io = ('IntersectionObserver' in window)
    ? new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('show');
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.12 })
    : null;

  function observeReveal() {
    document.querySelectorAll('.reveal:not(.show)').forEach((el) => {
      if (io) io.observe(el); else el.classList.add('show');
    });
  }

  // Hero memudar dan bergeser halus mengikuti arah skrol
  function setupGulir() {
    if (reduceMotion) return;
    const hero = $('#hero');
    const scene = $('#scene');
    const isi = $('#heroIsi');
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const h = hero.offsetHeight || window.innerHeight;
        const p = Math.min(1, y / (h * 0.7));
        const geserScene = Math.min(y * 0.25, h * 0.09);
        isi.style.opacity = (1 - p).toFixed(3);
        isi.style.transform = 'translate3d(0,' + (y * 0.16).toFixed(1) + 'px,0)';
        scene.style.transform = 'translate3d(0,' + geserScene.toFixed(1) + 'px,0) scale(' + (1 + p * 0.05).toFixed(3) + ')';
        ticking = false;
      });
    }, { passive: true });
  }

  // Daun bergeser tipis mengikuti gerakan kursor (hanya perangkat dengan mouse)
  function setupPointer() {
    if (reduceMotion || !window.matchMedia('(hover: hover)').matches) return;
    const hero = $('#hero');
    const scene = $('#scene');
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      scene.style.setProperty('--px', (((e.clientX - r.left) / r.width) - 0.5).toFixed(3));
      scene.style.setProperty('--py', (((e.clientY - r.top) / r.height) - 0.5).toFixed(3));
    });
  }

  /* ===================== INISIALISASI ===================== */

  function init() {
    terapkanTema();
    pecahKata($('#judul'));
    buatTetes();
    setupViewBox();
    setupTampilan();
    setupSuara();
    setupKalender();
    setupLogin();
    setupGulir();
    setupPointer();
    $('#cari').addEventListener('input', render);
    observeReveal();

    terapkanBg();
    muatFoto().then(terapkanBg);

    if (sessionStorage.getItem(KEY_TOKEN)) {
      sembunyikanLogin();
      muatMenu();
    } else {
      tampilLogin('');
    }
  }

  init();
})();
