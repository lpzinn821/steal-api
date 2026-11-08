// Roda no postinstall do npm (antes do servidor iniciar no Railway)
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const dir  = path.join(__dirname, 'fonts');
const dest = path.join(dir, 'Nunito-Bold.ttf');

if (fs.existsSync(dest)) { console.log('[font] já existe'); process.exit(0); }

if (!fs.existsSync(dir)) fs.mkdirSync(dir);

// jsDelivr CDN — sem redirect, sem auth
const url = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/static/Nunito-Bold.ttf';

console.log('[font] baixando Nunito-Bold.ttf...');
const file = fs.createWriteStream(dest);
https.get(url, res => {
  res.pipe(file);
  file.on('finish', () => { file.close(); console.log('[font] ok'); });
}).on('error', err => {
  fs.unlink(dest, () => {});
  console.error('[font] erro:', err.message);
  process.exit(0); // não quebra o build
});
