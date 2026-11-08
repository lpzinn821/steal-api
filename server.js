require('dotenv').config();
const express  = require('express');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const axios    = require('axios');
const FormData = require('form-data');

// Carrega fontes do sistema (Linux/Railway)
try { GlobalFonts.loadSystemFonts(); } catch(e) {}
const FONT = GlobalFonts.has('Arial') ? 'Arial'
           : GlobalFonts.has('Liberation Sans') ? 'Liberation Sans'
           : GlobalFonts.has('DejaVu Sans') ? 'DejaVu Sans'
           : GlobalFonts.has('FreeSans') ? 'FreeSans'
           : 'sans-serif';

console.log('[steal-api] Usando fonte:', FONT);

const app  = express();
app.use(express.json());

const PORT        = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const MUTATION_COLORS = {
  Bloodrot:'#C0003A', Candy:'#FF46F6', Crystal:'#C389E5', Cursed:'#F53838',
  Cyber:'#5DCFFF',   Diamond:'#25C4FE', Divine:'#FFD13B', Eclipse:'#FFDB6F',
  Galaxy:'#AA3CFF',  Gold:'#FFD700',   Lava:'#FF7A00',   Phantom:'#BBBBBB',
  Radioactive:'#68F500', Rainbow:'#FF00FB', Yinyang:'#CCCCCC', Normal:'#FF4444',
};

function rrect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

function ns(ctx){ ctx.shadowBlur=0; ctx.shadowColor='transparent'; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; }

async function fetchBrainrotImage(name) {
  // Tenta buscar imagem do brainrot pela API do Phantom (adicione a URL real aqui)
  // const PHANTOM_API = process.env.PHANTOM_API_URL;
  // if (PHANTOM_API) { ... }
  return null;
}

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

  // Tenta carregar imagem do brainrot
  let brainrotImg = null;
  try { brainrotImg = await fetchBrainrotImage(name); } catch(e) {}

  // Background
  const bg = ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#FFF9EF'); bg.addColorStop(1,'#FFE8C0');
  ctx.fillStyle = bg; rrect(ctx,0,0,W,H,22); ctx.fill();

  // Gold border
  const gold = ctx.createLinearGradient(0,0,W,H);
  gold.addColorStop(0,'#FFC200'); gold.addColorStop(0.35,'#FFE066');
  gold.addColorStop(0.65,'#FFB800'); gold.addColorStop(1,'#FFC200');
  ctx.strokeStyle=gold; ctx.lineWidth=5;
  ctx.shadowBlur=12; ctx.shadowColor='rgba(255,180,0,0.5)';
  rrect(ctx,2.5,2.5,W-5,H-5,20); ctx.stroke(); ns(ctx);

  ctx.strokeStyle='rgba(255,215,0,0.4)'; ctx.lineWidth=1.5;
  rrect(ctx,9,9,W-18,H-18,15); ctx.stroke();

  // TOP-LEFT badge STEAL LOG
  ctx.shadowBlur=8; ctx.shadowColor='rgba(0,0,0,0.3)'; ctx.shadowOffsetX=2; ctx.shadowOffsetY=3;
  ctx.fillStyle='#1E0F08'; rrect(ctx,20,20,190,64,16); ctx.fill(); ns(ctx);
  ctx.fillStyle='#E8630A'; ctx.beginPath(); ctx.arc(50,52,18,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#FFD700'; ctx.font=`bold 20px "${FONT}"`; ctx.textAlign='left'; ctx.fillText('STEAL',76,46);
  ctx.fillStyle='#FFFFFF'; ctx.fillText('LOG',76,70);

  // TOP-RIGHT STOLEN badge
  ctx.shadowBlur=6; ctx.shadowColor='rgba(180,0,0,0.4)'; ctx.shadowOffsetX=2; ctx.shadowOffsetY=2;
  ctx.fillStyle='#CC0000'; rrect(ctx,W-165,20,145,44,22); ctx.fill(); ns(ctx);
  ctx.fillStyle='#FFFFFF'; ctx.font=`bold 20px "${FONT}"`; ctx.textAlign='center'; ctx.fillText('STOLEN',W-92,48);

  // Stealer row
  ctx.shadowBlur=6; ctx.shadowColor='rgba(0,0,0,0.2)';
  ctx.fillStyle='#E8630A'; rrect(ctx,20,100,60,56,10); ctx.fill(); ns(ctx);
  ctx.fillStyle='#E8630A'; ctx.font=`bold 13px "${FONT}"`; ctx.textAlign='left'; ctx.fillText('Stealer',92,118);
  ctx.shadowBlur=4; ctx.shadowColor='rgba(0,0,0,0.1)';
  ctx.fillStyle='#FFF8EE'; rrect(ctx,90,124,480,32,8); ctx.fill(); ns(ctx);
  ctx.fillStyle='#3A1800'; ctx.font=`bold 16px "${FONT}"`; ctx.fillText(stealer,100,145);

  ctx.strokeStyle='rgba(255,180,0,0.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(20,170); ctx.lineTo(W-20,170); ctx.stroke();

  // Inner card
  ctx.shadowBlur=8; ctx.shadowColor='rgba(0,0,0,0.12)'; ctx.shadowOffsetX=2; ctx.shadowOffsetY=3;
  ctx.fillStyle='#FFFDF8'; rrect(ctx,20,178,580,192,14); ctx.fill(); ns(ctx);
  ctx.strokeStyle='#F0A040'; ctx.lineWidth=2; rrect(ctx,20,178,580,192,14); ctx.stroke();

  function fieldRow(label, value, valueColor, iconColor, rowY) {
    ctx.fillStyle=iconColor; rrect(ctx,30,rowY-14,32,28,8); ctx.fill();
    ctx.fillStyle=iconColor; ctx.font=`bold 11px "${FONT}"`; ctx.textAlign='left'; ctx.fillText(label,70,rowY-2);
    ctx.fillStyle=valueColor||'#1E0F08'; ctx.font=`bold 15px "${FONT}"`; ctx.fillText(value,70,rowY+14);
  }

  fieldRow('Brainrot', name,    '#1E0F08', '#E8630A', 210);
  fieldRow('Mutation', mutKey,  mutColor,  '#8B44CC', 255);
  fieldRow('Generation', genText,'#1E0F08','#D4820A', 300);

  ctx.fillStyle='#CC6611'; rrect(ctx,30,332,32,28,8); ctx.fill();
  ctx.fillStyle='#CC6611'; ctx.font=`bold 11px "${FONT}"`; ctx.textAlign='left'; ctx.fillText('Traits',70,332);
  const ts = traits.length>0 ? traits.join('  ·  ') : 'None';
  ctx.fillStyle='#1E0F08'; ctx.font=`bold 13px "${FONT}"`;
  ctx.fillText(ts.length>55 ? ts.slice(0,55)+'...' : ts, 70, 352);

  // Right block: imagem do brainrot OU letra da mutação
  const rx=620, ry=178, rw=W-rx-20, rh=192;
  ctx.shadowBlur=20; ctx.shadowColor=mutColor+'99';
  ctx.fillStyle=mutColor+'22'; rrect(ctx,rx,ry,rw,rh,14); ctx.fill(); ns(ctx);
  ctx.strokeStyle=mutColor; ctx.lineWidth=2.5; rrect(ctx,rx,ry,rw,rh,14); ctx.stroke();

  if (brainrotImg) {
    ctx.save();
    rrect(ctx,rx+4,ry+4,rw-8,rh-8,10); ctx.clip();
    ctx.drawImage(brainrotImg, rx+4, ry+4, rw-8, rh-8);
    ctx.restore();
  } else {
    ctx.fillStyle=mutColor; ctx.font=`bold 72px "${FONT}"`; ctx.textAlign='center';
    ctx.fillText(mutKey[0]||'?', rx+rw/2, ry+rh/2+24);
  }
  ctx.fillStyle=mutColor; ctx.font=`bold 11px "${FONT}"`; ctx.textAlign='center';
  ctx.fillText(mutKey.toUpperCase(), rx+rw/2, ry+rh-12);

  // Bottom bar
  const barY=H-50;
  ctx.shadowBlur=6; ctx.shadowColor='rgba(0,0,0,0.1)'; ctx.shadowOffsetY=-2;
  ctx.fillStyle='#FFF3DC'; rrect(ctx,20,barY,W-40,36,10); ctx.fill(); ns(ctx);
  ctx.strokeStyle='#F0A040'; ctx.lineWidth=1.5; rrect(ctx,20,barY,W-40,36,10); ctx.stroke();

  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const dateStr = now.toLocaleDateString('pt-BR');
  ctx.fillStyle='#3A1800'; ctx.font=`bold 13px "${FONT}"`; ctx.textAlign='left';
  ctx.fillText(timeStr, 30, barY+22);
  ctx.fillText(dateStr, 185, barY+22);
  ctx.fillText('STEAL LOG', 340, barY+22);
  ctx.fillStyle='rgba(100,60,0,0.4)'; ctx.font=`11px "${FONT}"`; ctx.textAlign='right';
  ctx.fillText('LuxarHub Steal Tracker', W-28, barY+26);

  return canvas.toBuffer('image/png');
}

app.post('/steal', async (req, res) => {
  const { name, mutation, traits, genText, value, stealer } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const webhook = WEBHOOK_URL;
  if (!webhook) return res.status(400).json({ error: 'WEBHOOK_URL not set' });

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

    await axios.post(webhook, form, { headers: form.getHeaders(), timeout: 15000 });
    res.json({ ok: true });
  } catch (err) {
    console.error('[steal-api] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (_req, res) => res.json({ status: 'steal-api online', font: FONT }));

app.listen(PORT, () => console.log(`[steal-api] Porta ${PORT} | Fonte: ${FONT}`));
