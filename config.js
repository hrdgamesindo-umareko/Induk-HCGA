// Pengaturan utama Web Induk HCGA.
// Hanya file ini yang perlu diubah saat URL backend (GAS) berganti.
window.APP_CONFIG = {
  APP_NAME: 'Web Induk HCGA',

  // Tempel URL deployment Apps Script yang berakhiran /exec
  GAS_URL: 'https://script.google.com/macros/https://script.google.com/macros/s/AKfycbwiqKiRh62OHIBFxzVI_oZ8KujYpo2SyDgsQIdV-4UTfuFwjypC0lEz4rnCAcxvIJ_4/exec',

  // Pilihan background landing page (lihat style.css, kelas .bg[data-bg="..."])
  BACKGROUNDS: [
    { id: 'hutan', nama: 'Hutan' },
    { id: 'air',   nama: 'Air' },
    { id: 'bukit', nama: 'Bukit' }
  ],
  BG_DEFAULT: 'hutan'
};
