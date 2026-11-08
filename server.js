require('dotenv').config();
const express  = require('express');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const axios    = require('axios');
const FormData = require('form-data');
const path     = require('path');
const fs       = require('fs');

// ── Fonte ────────────────────────────────────────────────────────────────────
const FONT_PATH = path.join(__dirname, 'fonts', 'Nunito-Bold.ttf');
let FONT = 'sans-serif';
if (fs.existsSync(FONT_PATH)) {
  GlobalFonts.registerFromPath(FONT_PATH, 'AppFont');
  FONT = 'AppFont';
  console.log('[steal-api] Fonte: AppFont (Nunito)');
} else {
  try { GlobalFonts.loadSystemFonts(); } catch(e) {}
  FONT = GlobalFonts.has('Liberation Sans') ? 'Liberation Sans'
       : GlobalFonts.has('DejaVu Sans')     ? 'DejaVu Sans'
       : 'sans-serif';
  console.log('[steal-api] Fonte fallback:', FONT);
}

const app = express();
app.use(express.json());

const PORT        = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// ── Cache de imagens ──────────────────────────────────────────────────────────
const imgCache = new Map();

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchBrainrotImage(name) {
  if (imgCache.has(name)) return imgCache.get(name);
  try {
    const r = await axios.get(
      `https://stealabrainrot.fandom.com/api.php?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&pithumbsize=250&format=json`,
      { headers: { 'User-Agent': BROWSER_UA }, timeout: 5000 }
    );
    const page = Object.values(r.data?.query?.pages || {})[0];
    const thumb = page?.thumbnail?.source;
    if (!thumb) { imgCache.set(name, null); return null; }
    const imgR = await axios.get(thumb, { responseType: 'arraybuffer', headers: { 'User-Agent': BROWSER_UA }, timeout: 5000 });
    const img = await loadImage(Buffer.from(imgR.data));
    imgCache.set(name, img);
    return img;
  } catch(e) {
    imgCache.set(name, null); return null;
  }
}

// ── Cores de mutação ──────────────────────────────────────────────────────────
const MUTATION_COLORS = {
  Bloodrot:'#C0003A', Candy:'#FF46F6', Crystal:'#C389E5', Cursed:'#F53838',
  Cyber:'#5DCFFF',   Diamond:'#25C4FE', Divine:'#FFD13B', Eclipse:'#FFDB6F',
  Galaxy:'#AA3CFF',  Gold:'#FFD700',   Lava:'#FF7A00',   Phantom:'#BBBBBB',
  Radioactive:'#68F500', Rainbow:'#FF00FB', Yinyang:'#CCCCCC', Normal:'#FF4444',
};

// ── Helpers de canvas ─────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function ns(ctx) { ctx.shadowBlur=0; ctx.shadowColor='transparent'; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; }

function star(ctx, cx, cy, pts, ro, ri) {
  ctx.beginPath();
  for (let i = 0; i < pts*2; i++) {
    const r = i%2===0 ? ro : ri;
    const a = (i * Math.PI / pts) - Math.PI/2;
    i===0 ? ctx.moveTo(cx+r*Math.cos(a), cy+r*Math.sin(a))
           : ctx.lineTo(cx+r*Math.cos(a), cy+r*Math.sin(a));
  }
  ctx.closePath();
}

// Desenha estrelinhas decorativas espalhadas no fundo
function drawSparkles(ctx, W, H) {
  const positions = [
    [55,30],[140,15],[700,25],[780,50],[820,20],[840,320],
    [810,380],[30,350],[160,390],[60,200],[750,200],[820,250],
  ];
  for (const [x,y] of positions) {
    const sz = 6 + Math.random()*6;
    ctx.fillStyle = `rgba(255,210,0,${0.4+Math.random()*0.4})`;
    star(ctx, x, y, 4, sz, sz*0.4);
    ctx.fill();
    // pequeno círculo brilhante
    ctx.beginPath(); ctx.arc(x, y, sz*0.2, 0, Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.fill();
  }
}

// Ícone de campo — quadrado laranja arredondado com símbolo branco
function drawFieldIcon(ctx, x, y, size, type) {
  const r = size * 0.28;
  ctx.fillStyle = '#F5820D';
  ctx.shadowBlur=8; ctx.shadowColor='rgba(200,80,0,0.3)'; ctx.shadowOffsetX=2; ctx.shadowOffsetY=3;
  rrect(ctx, x, y, size, size, r); ctx.fill(); ns(ctx);

  const cx = x+size/2, cy = y+size/2;
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#FFFFFF';

  if (type === 'pet') {
    // Pata: círculo central + 3 tocos
    ctx.beginPath(); ctx.arc(cx, cy+size*0.06, size*0.19, 0, Math.PI*2); ctx.fill();
    for (let i=-1; i<=1; i++) {
      ctx.beginPath(); ctx.arc(cx+i*size*0.17, cy-size*0.17, size*0.1, 0, Math.PI*2); ctx.fill();
    }
  } else if (type === 'mutation') {
    // Dupla hélice simplificada
    ctx.lineWidth = size*0.1; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(cx-size*0.14, cy-size*0.3);
    ctx.bezierCurveTo(cx+size*0.18, cy-size*0.08, cx-size*0.18, cy+size*0.08, cx+size*0.14, cy+size*0.3);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+size*0.14, cy-size*0.3);
    ctx.bezierCurveTo(cx-size*0.18, cy-size*0.08, cx+size*0.18, cy+size*0.08, cx-size*0.14, cy+size*0.3);
    ctx.stroke();
  } else if (type === 'gen') {
    // Estrela
    star(ctx, cx, cy, 5, size*0.3, size*0.13); ctx.fill();
  } else if (type === 'traits') {
    // 3 linhas horizontais (hamburger)
    ctx.lineWidth = size*0.1; ctx.lineCap='round';
    for (let i = -1; i<=1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx-size*0.26, cy+i*size*0.14);
      ctx.lineTo(cx+size*0.26, cy+i*size*0.14);
      ctx.stroke();
    }
  }
}

// ── Geração do card ──────────────────────────────────────────────────────────
async function generateCard(data) {
  const W=860, H=420;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const mutKey   = data.mutation ? (data.mutation[0].toUpperCase()+data.mutation.slice(1).toLowerCase()) : 'Normal';
  const mutColor = MUTATION_COLORS[mutKey] || MUTATION_COLORS.Normal;
  const traits   = Array.isArray(data.traits) ? data.traits : [];
  const stealer  = data.stealer  || 'Unknown';
  const name     = data.name     || 'Unknown';
  const genText  = data.genText  || data.value || 'N/A';
  const brainrotImg = await fetchBrainrotImage(name);

  // ── 1. Fundo quente ──────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#FFF6DC');
  bg.addColorStop(0.5, '#FFE9B0');
  bg.addColorStop(1, '#FFD880');
  ctx.fillStyle = bg;
  rrect(ctx, 0, 0, W, H, 24); ctx.fill();

  // Vinheta suave nas bordas
  const vign = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.8);
  vign.addColorStop(0, 'rgba(255,200,80,0)');
  vign.addColorStop(1, 'rgba(220,140,0,0.18)');
  ctx.fillStyle = vign; rrect(ctx,0,0,W,H,24); ctx.fill();

  // Estrelinhas decorativas
  drawSparkles(ctx, W, H);

  // ── 2. Imagem do brainrot (esquerda, como o gato do MEOWL) ───────────────
  const imgW=190, imgH=300, imgX=15, imgY=(H-imgH)/2;
  if (brainrotImg) {
    // sombra suave
    ctx.shadowBlur=20; ctx.shadowColor='rgba(180,100,0,0.25)'; ctx.shadowOffsetX=4; ctx.shadowOffsetY=6;
    ctx.fillStyle='rgba(255,255,255,0.1)'; rrect(ctx,imgX,imgY,imgW,imgH,18); ctx.fill(); ns(ctx);
    // clip e desenho
    ctx.save();
    rrect(ctx,imgX,imgY,imgW,imgH,18); ctx.clip();
    const sc = Math.min(imgW/brainrotImg.width, imgH/brainrotImg.height);
    const dw=brainrotImg.width*sc, dh=brainrotImg.height*sc;
    ctx.drawImage(brainrotImg, imgX+(imgW-dw)/2, imgY+(imgH-dh)/2, dw, dh);
    ctx.restore();
  }

  // ── 3. Card principal ─────────────────────────────────────────────────────
  const cx=215, cy=16, cw=W-cx-16, ch=H-32;

  // Sombra do card
  ctx.shadowBlur=24; ctx.shadowColor='rgba(180,100,0,0.2)'; ctx.shadowOffsetX=4; ctx.shadowOffsetY=8;
  ctx.fillStyle='#FFFEF5'; rrect(ctx,cx,cy,cw,ch,20); ctx.fill(); ns(ctx);

  // Borda dourada dupla
  const gbord = ctx.createLinearGradient(cx,cy,cx+cw,cy+ch);
  gbord.addColorStop(0,'#FFDC00'); gbord.addColorStop(0.4,'#FFB800');
  gbord.addColorStop(0.7,'#FFE066'); gbord.addColorStop(1,'#FFC200');
  ctx.strokeStyle=gbord; ctx.lineWidth=4;
  ctx.shadowBlur=8; ctx.shadowColor='rgba(255,180,0,0.5)';
  rrect(ctx,cx,cy,cw,ch,20); ctx.stroke(); ns(ctx);
  ctx.strokeStyle='rgba(255,230,80,0.5)'; ctx.lineWidth=1.5;
  rrect(ctx,cx+5,cy+5,cw-10,ch-10,16); ctx.stroke();

  // ── 4. Header: Stealer ───────────────────────────────────────────────────
  const hx=cx+14, hy=cy+14;

  // Avatar círculo laranja
  ctx.shadowBlur=6; ctx.shadowColor='rgba(200,80,0,0.3)'; ctx.shadowOffsetX=2; ctx.shadowOffsetY=3;
  ctx.fillStyle='#F5820D';
  ctx.beginPath(); ctx.arc(hx+22, hy+22, 22, 0, Math.PI*2); ctx.fill(); ns(ctx);
  // Silhueta de pessoa em branco
  ctx.fillStyle='#FFFFFF';
  ctx.beginPath(); ctx.arc(hx+22, hy+16, 9, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx+22, hy+33, 13, 10, 0, Math.PI, 0); ctx.fill();

  // "Stealer" label pequeno
  ctx.fillStyle='#999999'; ctx.font=`13px "${FONT}"`; ctx.textAlign='left';
  ctx.fillText('Stealer', hx+52, hy+14);
  // Nome do stealer em destaque
  ctx.fillStyle='#1A0A00'; ctx.font=`bold 20px "${FONT}"`;
  ctx.fillText(stealer, hx+52, hy+36);

  // Badge STOLEN
  const bw=130, bh=38, bx=cx+cw-bw-14, by=hy+5;
  ctx.shadowBlur=8; ctx.shadowColor='rgba(180,0,0,0.4)'; ctx.shadowOffsetX=2; ctx.shadowOffsetY=3;
  const gr = ctx.createLinearGradient(bx,by,bx,by+bh);
  gr.addColorStop(0,'#EE0000'); gr.addColorStop(1,'#AA0000');
  ctx.fillStyle=gr; rrect(ctx,bx,by,bw,bh,19); ctx.fill(); ns(ctx);
  ctx.fillStyle='#FFFFFF'; ctx.font=`bold 18px "${FONT}"`; ctx.textAlign='center';
  ctx.fillText('STOLEN', bx+bw/2, by+25);

  // Separador
  const sepY = cy+72;
  ctx.strokeStyle='rgba(230,160,0,0.4)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(cx+12,sepY); ctx.lineTo(cx+cw-12,sepY); ctx.stroke();

  // ── 5. Campos de info ────────────────────────────────────────────────────
  const iconSz=42, fieldX=cx+14, petImgX=cx+cw-170, petImgY=cy+80, petImgW=152, petImgH=200;
  const rows = [
    { label:'Brainrot',   value: name,    color:'#1A0A00', type:'pet'      },
    { label:'Mutation',   value: mutKey,  color: mutColor, type:'mutation'  },
    { label:'Generation', value: genText, color:'#1A0A00', type:'gen'       },
    { label:'Traits',     value: traits.length>0 ? traits.join(' · ') : 'None', color:'#1A0A00', type:'traits' },
  ];
  const fieldAreaW = petImgX - fieldX - 12;

  rows.forEach((row, i) => {
    const fy = sepY+10 + i*68;
    drawFieldIcon(ctx, fieldX, fy, iconSz, row.type);

    // Label pequeno
    ctx.fillStyle='#999999'; ctx.font=`12px "${FONT}"`; ctx.textAlign='left';
    ctx.fillText(row.label, fieldX+iconSz+12, fy+14);

    // Fundo do campo (pill branca)
    ctx.shadowBlur=3; ctx.shadowColor='rgba(0,0,0,0.06)'; ctx.shadowOffsetY=2;
    ctx.fillStyle='#FFFFFF'; rrect(ctx, fieldX+iconSz+8, fy+18, fieldAreaW-iconSz-8, 28, 8); ctx.fill(); ns(ctx);

    // Valor
    const maxChars = row.type==='traits' ? 55 : 40;
    const val = row.value.length>maxChars ? row.value.slice(0,maxChars)+'...' : row.value;
    ctx.fillStyle=row.color; ctx.font=`bold 15px "${FONT}"`;
    ctx.fillText(val, fieldX+iconSz+18, fy+36);
  });

  // ── 6. Imagem do brainrot dentro do card (direita) ───────────────────────
  if (brainrotImg) {
    ctx.shadowBlur=12; ctx.shadowColor=mutColor+'66'; ctx.shadowOffsetX=2; ctx.shadowOffsetY=4;
    ctx.fillStyle='#FFFDF8'; rrect(ctx,petImgX,petImgY,petImgW,petImgH,14); ctx.fill(); ns(ctx);
    ctx.strokeStyle=mutColor; ctx.lineWidth=2.5;
    ctx.shadowBlur=8; ctx.shadowColor=mutColor+'88';
    rrect(ctx,petImgX,petImgY,petImgW,petImgH,14); ctx.stroke(); ns(ctx);
    // imagem
    const sc2 = Math.min((petImgW-16)/brainrotImg.width, (petImgH-16)/brainrotImg.height);
    const dw2=brainrotImg.width*sc2, dh2=brainrotImg.height*sc2;
    ctx.save(); rrect(ctx,petImgX+4,petImgY+4,petImgW-8,petImgH-8,11); ctx.clip();
    ctx.drawImage(brainrotImg, petImgX+(petImgW-dw2)/2, petImgY+(petImgH-dh2)/2, dw2, dh2);
    ctx.restore();
    // label de mutação
    ctx.fillStyle=mutColor; ctx.font=`bold 11px "${FONT}"`; ctx.textAlign='center';
    ctx.fillText(mutKey.toUpperCase(), petImgX+petImgW/2, petImgY+petImgH-6);
  } else {
    // Placeholder colorido com inicial
    ctx.shadowBlur=12; ctx.shadowColor=mutColor+'66';
    ctx.fillStyle=mutColor+'22'; rrect(ctx,petImgX,petImgY,petImgW,petImgH,14); ctx.fill(); ns(ctx);
    ctx.strokeStyle=mutColor; ctx.lineWidth=2.5; rrect(ctx,petImgX,petImgY,petImgW,petImgH,14); ctx.stroke();
    ctx.fillStyle=mutColor; ctx.font=`bold 70px "${FONT}"`; ctx.textAlign='center';
    ctx.fillText(mutKey[0]||'?', petImgX+petImgW/2, petImgY+petImgH/2+25);
    ctx.font=`bold 11px "${FONT}"`;
    ctx.fillText(mutKey.toUpperCase(), petImgX+petImgW/2, petImgY+petImgH-8);
  }

  // ── 7. Barra de rodapé ───────────────────────────────────────────────────
  const barY = cy+ch-40, barH=32;
  ctx.strokeStyle='rgba(230,160,0,0.4)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(cx+12, barY-2); ctx.lineTo(cx+cw-12, barY-2); ctx.stroke();

  ctx.shadowBlur=4; ctx.shadowColor='rgba(0,0,0,0.05)'; ctx.shadowOffsetY=2;
  ctx.fillStyle='rgba(255,248,220,0.7)'; rrect(ctx,cx+10,barY,cw-20,barH,10); ctx.fill(); ns(ctx);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const dateStr = now.toLocaleDateString('pt-BR');
  ctx.fillStyle='#7A5000'; ctx.font=`bold 12px "${FONT}"`; ctx.textAlign='left';
  ctx.fillText(timeStr, cx+22, barY+21);
  ctx.fillText(dateStr, cx+120, barY+21);
  ctx.fillStyle='rgba(120,80,0,0.5)'; ctx.font=`11px "${FONT}"`; ctx.textAlign='right';
  ctx.fillText('LuxarHub Steal Tracker', cx+cw-18, barY+21);

  return canvas.toBuffer('image/png');
}

// ── Rotas ────────────────────────────────────────────────────────────────────
app.post('/steal', async (req, res) => {
  const { name, mutation, traits, genText, value, stealer } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!WEBHOOK_URL) return res.status(400).json({ error: 'WEBHOOK_URL not set' });

  try {
    console.log(`[steal-api] ${stealer} roubou ${name} (${mutation})`);
    const img = await generateCard({ name, mutation, traits, genText, value, stealer });
    const form = new FormData();
    form.append('file', img, { filename: 'steal.png', contentType: 'image/png' });
    form.append('payload_json', JSON.stringify({
      username: 'STEAL LOG',
      avatar_url: 'https://tr.rbxcdn.com/180DAY-108394624972794/150/150/Image/Webp/noFilter',
      content: '',
    }));
    await axios.post(WEBHOOK_URL, form, { headers: form.getHeaders(), timeout: 15000 });
    res.json({ ok: true });
  } catch (err) {
    console.error('[steal-api] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (_req, res) => res.json({ status: 'steal-api online', font: FONT }));

app.listen(PORT, () => console.log(`[steal-api] Porta ${PORT} | Fonte: ${FONT}`));
