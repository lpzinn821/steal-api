require('dotenv').config();
const express  = require('express');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const axios    = require('axios');
const FormData = require('form-data');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const path     = require('path');
const fs       = require('fs');

// ── Fonte ────────────────────────────────────────────────────────────────────
const FONT_PATH = path.join(__dirname, 'fonts', 'Nunito.ttf');
let FONT = 'sans-serif';
if (fs.existsSync(FONT_PATH)) {
  GlobalFonts.registerFromPath(FONT_PATH, 'AppFont');
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Nunito-ExtraBold.ttf'), 'AppFont');
  FONT = 'AppFont';
} else {
  try { GlobalFonts.loadSystemFonts(); } catch(e) {}
  FONT = GlobalFonts.has('DejaVu Sans') ? 'DejaVu Sans' : 'sans-serif';
}

const app = express();
app.use(express.json());

const PORT        = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const STEAL_KEY   = process.env.STEAL_KEY;

function validKey(given) {
  if (!STEAL_KEY || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(STEAL_KEY);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

// ── Imagens ──────────────────────────────────────────────────────────────────
const imgCache = new Map();
const UA = 'steal-api/1.0 (Discord steal log card generator)';
let logoImg = null;
loadImage(path.join(__dirname, 'assets', 'logo.webp')).then(i => { logoImg = i; }).catch(() => {});

async function fetchBrainrotImage(name) {
  if (imgCache.has(name)) return imgCache.get(name);
  try {
    const r = await axios.get(
      `https://stealabrainrot.fandom.com/api.php?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&pithumbsize=300&format=json`,
      { headers: { 'User-Agent': UA }, timeout: 5000 }
    );
    const page = Object.values(r.data?.query?.pages || {})[0];
    const thumb = page?.thumbnail?.source;
    if (!thumb) { imgCache.set(name, null); return null; }
    const imgR = await axios.get(thumb, { responseType: 'arraybuffer', headers: { 'User-Agent': UA }, timeout: 5000 });
    const img = await loadImage(Buffer.from(imgR.data));
    imgCache.set(name, img);
    return img;
  } catch(e) {
    imgCache.set(name, null); return null;
  }
}

const avatarCache = new Map();

async function fetchAvatar(userId, username) {
  const key = userId || username;
  if (!key) return null;
  if (avatarCache.has(key)) return avatarCache.get(key);
  try {
    let id = userId;
    if (!id) {
      const u = await axios.post('https://users.roblox.com/v1/usernames/users',
        { usernames: [username], excludeBannedUsers: false }, { timeout: 5000 });
      id = u.data?.data?.[0]?.id;
    }
    if (!id) return null;
    let url = null;
    for (let i = 0; i < 3 && !url; i++) {
      const t = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=420x420&format=Png&isCircular=false`, { timeout: 5000 });
      const d = t.data?.data?.[0];
      if (d?.state === 'Completed') url = d.imageUrl;
      else await new Promise(r => setTimeout(r, 1000));
    }
    if (!url) return null;
    const imgR = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    const img = await loadImage(Buffer.from(imgR.data));
    avatarCache.set(key, img);
    return img;
  } catch(e) {
    return null;
  }
}

const MUTATION_COLORS = {
  Bloodrot:'#FF3B6B', Candy:'#FF6AF8', Crystal:'#D2A4F0', Cursed:'#FF5A5A',
  Cyber:'#6FD8FF',   Diamond:'#4FD2FF', Divine:'#FFD84F', Eclipse:'#FFE08A',
  Galaxy:'#C07BFF',  Gold:'#FFD24A',   Lava:'#FF8A2A',   Phantom:'#D0D0D0',
  Radioactive:'#86FF3A', Rainbow:'#FF5AF5', Yinyang:'#E6E6E6', Normal:'#F7D2BD',
};

// ── Paleta Luxar ─────────────────────────────────────────────────────────────
const C = {
  bg0:'#16060D', bg1:'#2A0B18', bg2:'#4A1628',
  rose0:'#FBDDCB', rose1:'#E2A88F', rose2:'#A8695A',
  panel:'rgba(38,10,22,0.88)', pill:'rgba(10,2,6,0.38)',
  label:'#C9A0A4', text:'#FDEFE7', dark:'#2A0C18',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}
function ns(ctx) { ctx.shadowBlur=0; ctx.shadowColor='transparent'; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; }
function roseGrad(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x+w, y+h);
  g.addColorStop(0, C.rose0); g.addColorStop(0.5, C.rose1); g.addColorStop(1, C.rose2);
  return g;
}
function rng(seed) { let s = seed; return () => (s = (s*16807) % 2147483647) / 2147483647; }

function snowflake(ctx, x, y, r, a) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle=`rgba(255,255,255,${a})`; ctx.lineWidth=1.4; ctx.lineCap='round';
  for (let i=0; i<6; i++) {
    ctx.rotate(Math.PI/3);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-r);
    ctx.moveTo(0,-r*0.55); ctx.lineTo(-r*0.25,-r*0.8);
    ctx.moveTo(0,-r*0.55); ctx.lineTo(r*0.25,-r*0.8);
    ctx.stroke();
  }
  ctx.restore();
}

// Neve escorrendo na borda de cima de um painel (igual à logo IX)
function snowCap(ctx, x, y, w, h, r, depth) {
  ctx.save(); rrect(ctx, x, y, w, h, r); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y+depth+8);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#DCE6F2');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x+w, y); ctx.lineTo(x+w, y+depth);
  const step = 22;
  for (let px = x+w; px > x; px -= step) {
    const dip = (Math.floor(px/step) % 3 === 0) ? 9 : 4;
    ctx.quadraticCurveTo(px-step/2, y+depth+dip, px-step, y+depth);
  }
  ctx.closePath();
  ctx.shadowBlur=6; ctx.shadowColor='rgba(0,0,0,0.35)'; ctx.shadowOffsetY=2;
  ctx.fill(); ns(ctx);
  ctx.restore();
}

function glassPanel(ctx, x, y, w, h, r, border) {
  ctx.shadowBlur=26; ctx.shadowColor='rgba(0,0,0,0.55)'; ctx.shadowOffsetY=8;
  const g = ctx.createLinearGradient(x, y, x, y+h);
  g.addColorStop(0, 'rgba(70,20,38,0.92)'); g.addColorStop(1, 'rgba(30,8,17,0.94)');
  ctx.fillStyle = g; rrect(ctx, x, y, w, h, r); ctx.fill(); ns(ctx);
  ctx.strokeStyle = border || roseGrad(ctx, x, y, w, h); ctx.lineWidth = 3;
  rrect(ctx, x, y, w, h, r); ctx.stroke();
  ctx.strokeStyle='rgba(251,221,203,0.12)'; ctx.lineWidth=1;
  rrect(ctx, x+5, y+5, w-10, h-10, Math.max(r-4, 2)); ctx.stroke();
}

function fieldIcon(ctx, x, y, s, type) {
  ctx.shadowBlur=10; ctx.shadowColor='rgba(226,168,143,0.35)'; ctx.shadowOffsetY=3;
  ctx.fillStyle = roseGrad(ctx, x, y, s, s); rrect(ctx, x, y, s, s, s*0.28); ctx.fill(); ns(ctx);
  const cx = x+s/2, cy = y+s/2;
  ctx.fillStyle = C.dark; ctx.strokeStyle = C.dark; ctx.lineCap='round';
  if (type === 'pet') {
    ctx.beginPath(); ctx.arc(cx, cy+s*0.08, s*0.17, 0, Math.PI*2); ctx.fill();
    for (const [dx, dy] of [[-0.2,-0.08],[-0.08,-0.22],[0.08,-0.22],[0.2,-0.08]]) {
      ctx.beginPath(); ctx.arc(cx+dx*s, cy+dy*s, s*0.075, 0, Math.PI*2); ctx.fill();
    }
  } else if (type === 'mutation') {
    ctx.lineWidth = s*0.08;
    for (const sgn of [1,-1]) {
      ctx.beginPath(); ctx.moveTo(cx-sgn*s*0.16, cy-s*0.28);
      ctx.bezierCurveTo(cx+sgn*s*0.22, cy-s*0.06, cx-sgn*s*0.22, cy+s*0.06, cx+sgn*s*0.16, cy+s*0.28);
      ctx.stroke();
    }
    ctx.lineWidth = s*0.05;
    for (const dy of [-0.12, 0, 0.12]) { ctx.beginPath(); ctx.moveTo(cx-s*0.1, cy+dy*s); ctx.lineTo(cx+s*0.1, cy+dy*s); ctx.stroke(); }
  } else if (type === 'gen') {
    ctx.beginPath();
    for (let i=0; i<10; i++) {
      const r = i%2 ? s*0.13 : s*0.3, a = i*Math.PI/5 - Math.PI/2;
      i ? ctx.lineTo(cx+r*Math.cos(a), cy+r*Math.sin(a)) : ctx.moveTo(cx+r*Math.cos(a), cy+r*Math.sin(a));
    }
    ctx.closePath(); ctx.fill();
  } else if (type === 'traits') {
    ctx.beginPath();
    ctx.moveTo(cx-s*0.26, cy-s*0.2); ctx.lineTo(cx+s*0.06, cy-s*0.2); ctx.lineTo(cx+s*0.28, cy);
    ctx.lineTo(cx+s*0.06, cy+s*0.2); ctx.lineTo(cx-s*0.26, cy+s*0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.rose0; ctx.beginPath(); ctx.arc(cx-s*0.12, cy, s*0.06, 0, Math.PI*2); ctx.fill();
  } else if (type === 'clock') {
    ctx.lineWidth = s*0.08;
    ctx.beginPath(); ctx.arc(cx, cy, s*0.26, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy-s*0.15); ctx.moveTo(cx, cy); ctx.lineTo(cx+s*0.12, cy+s*0.05); ctx.stroke();
  } else if (type === 'date') {
    ctx.lineWidth = s*0.07;
    rrect(ctx, cx-s*0.25, cy-s*0.2, s*0.5, s*0.45, s*0.06); ctx.stroke();
    ctx.fillRect(cx-s*0.25, cy-s*0.2, s*0.5, s*0.12);
  } else if (type === 'user') {
    ctx.beginPath(); ctx.arc(cx, cy-s*0.1, s*0.15, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy+s*0.26, s*0.26, s*0.2, 0, Math.PI, 0); ctx.fill();
  }
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function drawContain(ctx, img, x, y, w, h) {
  const sc = Math.min(w/img.width, h/img.height);
  const dw = img.width*sc, dh = img.height*sc;
  ctx.drawImage(img, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
}

// ── Card ─────────────────────────────────────────────────────────────────────
async function generateCard(data) {
  const W=860, H=420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const mutKey   = data.mutation ? (data.mutation[0].toUpperCase()+data.mutation.slice(1).toLowerCase()) : 'Normal';
  const mutColor = MUTATION_COLORS[mutKey] || MUTATION_COLORS.Normal;
  const traits   = Array.isArray(data.traits) ? data.traits : [];
  const stealer  = data.stealer || 'Unknown';
  const name     = data.name    || 'Unknown';
  const genText  = data.genText || data.value || 'N/A';
  const [brainrotImg, avatarImg] = await Promise.all([
    fetchBrainrotImage(name),
    fetchAvatar(data.stealerId, data.stealer),
  ]);
  const leftImg = avatarImg || brainrotImg;
  const rand = rng(1337);

  // Fundo bordô
  ctx.save(); rrect(ctx, 0, 0, W, H, 24); ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, C.bg1); bg.addColorStop(1, C.bg0);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of [[150,70,180,0.55],[700,360,200,0.35],[480,40,140,0.25],[80,380,120,0.3]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(120,30,60,${a})`); g.addColorStop(1, 'rgba(120,30,60,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.strokeStyle='rgba(255,255,255,0.025)'; ctx.lineWidth=1;
  for (let i=-H; i<W; i+=7) { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i+H, 0); ctx.stroke(); }
  for (let i=0; i<30; i++) {
    const r = rand()*2.2 + 0.6;
    ctx.fillStyle=`rgba(255,255,255,${0.25 + rand()*0.6})`;
    ctx.beginPath(); ctx.arc(rand()*W, rand()*H, r, 0, Math.PI*2); ctx.fill();
  }
  for (const [x, y, r] of [[40,250,7],[195,28,6],[838,150,7],[205,395,6],[620,14,5]]) snowflake(ctx, x, y, r, 0.7);
  ctx.restore();

  // Moldura externa rosé
  ctx.strokeStyle = roseGrad(ctx, 0, 0, W, H); ctx.lineWidth = 3;
  rrect(ctx, 1.5, 1.5, W-3, H-3, 23); ctx.stroke();

  // Coluna esquerda: logo + brainrot
  const lx=16, lw=184;
  glassPanel(ctx, lx, 16, lw, 128, 18);
  if (logoImg) {
    ctx.save(); rrect(ctx, lx+3, 19, lw-6, 122, 15); ctx.clip();
    ctx.drawImage(logoImg, lx+3, 19 - (lw-6-122)/2, lw-6, lw-6);
    ctx.restore();
  }
  snowCap(ctx, lx, 16, lw, 128, 18, 9);

  const by = 154, bh = H-16-by;
  glassPanel(ctx, lx, by, lw, bh, 18);
  if (leftImg) {
    const glow = avatarImg ? C.rose1 : mutColor;
    ctx.save(); rrect(ctx, lx+6, by+16, lw-12, bh-22, 14); ctx.clip();
    const g = ctx.createRadialGradient(lx+lw/2, by+bh/2, 10, lx+lw/2, by+bh/2, lw*0.7);
    g.addColorStop(0, glow+'55'); g.addColorStop(1, glow+'00');
    ctx.fillStyle = g; ctx.fillRect(lx, by, lw, bh);
    ctx.shadowBlur=18; ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowOffsetY=6;
    if (avatarImg) drawContain(ctx, leftImg, lx-40, by-10, lw+80, bh+30);
    else drawContain(ctx, leftImg, lx+8, by+16, lw-16, bh-26);
    ctx.restore(); ns(ctx);
  } else {
    ctx.fillStyle = mutColor; ctx.font = `800 80px "${FONT}"`; ctx.textAlign='center';
    ctx.fillText(mutKey[0], lx+lw/2, by+bh/2+28);
  }
  snowCap(ctx, lx, by, lw, bh, 18, 9);

  // Card principal
  const cx=214, cy=16, cw=W-cx-16, ch=H-32;
  glassPanel(ctx, cx, cy, cw, ch, 20);
  snowCap(ctx, cx, cy, cw, ch, 20, 10);

  // Header
  const hy = cy+26;
  fieldIcon(ctx, cx+18, hy, 46, 'user');
  ctx.textAlign='left';
  ctx.fillStyle=C.label; ctx.font=`600 13px "${FONT}"`; ctx.fillText('Stealer', cx+76, hy+15);
  ctx.fillStyle=C.text;  ctx.font=`800 22px "${FONT}"`; ctx.fillText(fitText(ctx, stealer, 330), cx+76, hy+40);

  const bw=140, bh2=42, bx=cx+cw-bw-20, byy=hy+2;
  ctx.shadowBlur=16; ctx.shadowColor='rgba(220,30,70,0.55)'; ctx.shadowOffsetY=3;
  const sg = ctx.createLinearGradient(0, byy, 0, byy+bh2);
  sg.addColorStop(0, '#F0325A'); sg.addColorStop(1, '#8E0E2E');
  ctx.fillStyle = sg; rrect(ctx, bx, byy, bw, bh2, 21); ctx.fill(); ns(ctx);
  ctx.strokeStyle = roseGrad(ctx, bx, byy, bw, bh2); ctx.lineWidth = 2; rrect(ctx, bx, byy, bw, bh2, 21); ctx.stroke();
  ctx.fillStyle='#FFFFFF'; ctx.font=`800 19px "${FONT}"`; ctx.textAlign='center';
  ctx.fillText('STOLEN', bx+bw/2, byy+28);

  const sep1 = cy+88;
  const sl = ctx.createLinearGradient(cx+16, 0, cx+cw-16, 0);
  sl.addColorStop(0, 'rgba(226,168,143,0)'); sl.addColorStop(0.5, 'rgba(226,168,143,0.6)'); sl.addColorStop(1, 'rgba(226,168,143,0)');
  ctx.strokeStyle = sl; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx+16, sep1); ctx.lineTo(cx+cw-16, sep1); ctx.stroke();

  // Campos
  const iconS=40, fx=cx+18, rowsW=cw-36-180, rowH=56;
  const rows = [
    { label:'Brainrot',   value:name,    color:C.text,   type:'pet' },
    { label:'Mutation',   value:mutKey,  color:mutColor, type:'mutation' },
    { label:'Generation', value:genText, color:C.text,   type:'gen' },
    { label:'Traits',     value:traits.length ? traits.join('  •  ') : 'None', color:C.text, type:'traits' },
  ];
  rows.forEach((row, i) => {
    const y = sep1 + 10 + i*rowH;
    fieldIcon(ctx, fx, y+4, iconS, row.type);
    ctx.textAlign='left'; ctx.fillStyle=C.label; ctx.font=`600 12px "${FONT}"`;
    ctx.fillText(row.label, fx+iconS+14, y+14);
    ctx.fillStyle=C.pill; rrect(ctx, fx+iconS+10, y+19, rowsW-iconS-10, 28, 9); ctx.fill();
    ctx.strokeStyle='rgba(251,221,203,0.14)'; ctx.lineWidth=1; rrect(ctx, fx+iconS+10, y+19, rowsW-iconS-10, 28, 9); ctx.stroke();
    ctx.fillStyle=row.color; ctx.font=`800 16px "${FONT}"`;
    if (row.color !== C.text) { ctx.shadowBlur=10; ctx.shadowColor=row.color+'99'; }
    ctx.fillText(fitText(ctx, row.value, rowsW-iconS-34), fx+iconS+22, y+39); ns(ctx);
  });

  // Caixa da imagem dentro do card
  const px = cx+cw-18-166, py = sep1+12, pw = 166, ph = rowH*4-10;
  ctx.shadowBlur=18; ctx.shadowColor=mutColor+'66';
  ctx.fillStyle='rgba(10,2,6,0.45)'; rrect(ctx, px, py, pw, ph, 16); ctx.fill(); ns(ctx);
  ctx.strokeStyle=mutColor; ctx.lineWidth=2.5; rrect(ctx, px, py, pw, ph, 16); ctx.stroke();
  if (brainrotImg) {
    ctx.save(); rrect(ctx, px+4, py+4, pw-8, ph-8, 12); ctx.clip();
    drawContain(ctx, brainrotImg, px+10, py+10, pw-20, ph-38);
    ctx.restore();
  } else {
    ctx.fillStyle=mutColor; ctx.font=`800 70px "${FONT}"`; ctx.textAlign='center';
    ctx.fillText(mutKey[0], px+pw/2, py+ph/2+20);
  }
  ctx.fillStyle=mutColor; ctx.font=`800 12px "${FONT}"`; ctx.textAlign='center';
  ctx.shadowBlur=8; ctx.shadowColor=mutColor+'AA';
  ctx.fillText(mutKey.toUpperCase(), px+pw/2, py+ph-11); ns(ctx);

  // Rodapé em blocos (igual ao MEOWL)
  const now = new Date();
  const tiles = [
    { icon:'clock', label:'Time', value: now.toLocaleTimeString('pt-BR', { timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', second:'2-digit' }) },
    { icon:'date',  label:'Date', value: now.toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo' }) },
    { icon:'gen',   label:'Luxar Scripts', value:'Steal Log' },
  ];
  const ty = cy+ch-58, th = 46, gap = 10, tw = (cw-36-gap*2)/3;
  tiles.forEach((t, i) => {
    const tx = cx+18 + i*(tw+gap);
    ctx.fillStyle=C.pill; rrect(ctx, tx, ty, tw, th, 12); ctx.fill();
    ctx.strokeStyle='rgba(251,221,203,0.2)'; ctx.lineWidth=1; rrect(ctx, tx, ty, tw, th, 12); ctx.stroke();
    fieldIcon(ctx, tx+8, ty+8, 30, t.icon);
    ctx.textAlign='left';
    ctx.fillStyle=C.label; ctx.font=`600 11px "${FONT}"`; ctx.fillText(t.label, tx+48, ty+18);
    ctx.fillStyle=C.text;  ctx.font=`800 15px "${FONT}"`; ctx.fillText(t.value, tx+48, ty+37);
  });

  return canvas;
}

// Neve caindo: cada floco desce a altura inteira em FRAMES quadros, então o loop fecha sem pulo
const FRAMES = 30, FRAME_MS = 70;
async function generateGif(data) {
  const base = await generateCard(data);
  const W = base.width, H = base.height;
  const rand = rng(4242);
  const flakes = Array.from({ length: 70 }, () => ({
    x: rand()*W, y: rand()*H, r: 0.8 + rand()*2.4,
    a: 0.35 + rand()*0.55, sway: 4 + rand()*10, phase: rand()*Math.PI*2,
    big: rand() < 0.12,
  }));

  const frame = createCanvas(W, H);
  const ctx = frame.getContext('2d');
  const gif = GIFEncoder();
  let palette = null;

  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0);
    ctx.save(); rrect(ctx, 0, 0, W, H, 24); ctx.clip();
    for (const s of flakes) {
      const y = (s.y + t*H) % H;
      const x = s.x + Math.sin(t*Math.PI*2 + s.phase) * s.sway;
      if (s.big) snowflake(ctx, x, y, s.r*2.6, s.a);
      else { ctx.fillStyle = `rgba(255,255,255,${s.a})`; ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI*2); ctx.fill(); }
    }
    ctx.restore();
    const { data: rgba } = ctx.getImageData(0, 0, W, H);
    if (!palette) palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), W, H, { palette, delay: FRAME_MS });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

// ── Rotas ────────────────────────────────────────────────────────────────────
app.post('/steal', async (req, res) => {
  if (!validKey(req.get('X-Steal-Key'))) return res.status(401).json({ error: 'unauthorized' });
  const { name, mutation, traits, genText, value, stealer, stealerId } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!WEBHOOK_URL) return res.status(400).json({ error: 'WEBHOOK_URL not set' });

  try {
    console.log(`[steal-api] ${stealer} roubou ${name} (${mutation})`);
    const img = await generateGif({ name, mutation, traits, genText, value, stealer, stealerId });
    const form = new FormData();
    form.append('file', img, { filename: 'steal.gif', contentType: 'image/gif' });
    form.append('payload_json', JSON.stringify({ username: 'Luxar Steal Log', content: '' }));
    await axios.post(WEBHOOK_URL, form, { headers: form.getHeaders(), timeout: 15000 });
    res.json({ ok: true });
  } catch (err) {
    console.error('[steal-api] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (_req, res) => res.json({ status: 'steal-api online', font: FONT }));

module.exports = { generateCard, generateGif };
if (!process.env.NO_LISTEN) app.listen(PORT, () => console.log(`[steal-api] Porta ${PORT} | Fonte: ${FONT}`));
