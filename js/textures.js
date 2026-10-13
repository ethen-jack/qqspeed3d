import * as THREE from 'three';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rep = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// 沥青路面：u 横跨路宽，v 沿赛道
export function roadTexture() {
  const [c, g] = cv(512, 1024);
  g.fillStyle = '#23252e'; g.fillRect(0, 0, 512, 1024);
  const img = g.getImageData(0, 0, 512, 1024), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() * 26) | 0; d[i] += n; d[i + 1] += n; d[i + 2] += n + 4; }
  g.putImageData(img, 0, 0);
  // 车辙
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (const x of [120, 175, 335, 390]) g.fillRect(x, 0, 28, 1024);
  // 边线
  g.fillStyle = '#f2f2f2'; g.fillRect(14, 0, 12, 1024); g.fillRect(486, 0, 12, 1024);
  // 车道虚线
  g.fillStyle = '#e8e8e8';
  for (const x of [168, 338]) for (let y = 0; y < 1024; y += 256) g.fillRect(x, y, 7, 140);
  // 中心双黄线
  g.fillStyle = '#ffc83a'; g.fillRect(248, 0, 5, 1024); g.fillRect(259, 0, 5, 1024);
  return tex(c);
}

export function curbTexture() {
  const [c, g] = cv(64, 256);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#e8243c'; g.fillRect(0, i * 64, 64, 64); }
  return tex(c);
}

export function wallTexture(colA, colB) {
  // x = 墙高方向，y = 沿赛道（flipY 后 v 向上 = 行驶方向）
  const [c, g] = cv(64, 256);
  g.fillStyle = '#0b0f22'; g.fillRect(0, 0, 64, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, colA); gr.addColorStop(1, colB);
  g.fillStyle = gr; g.fillRect(4, 0, 6, 256); g.fillRect(54, 0, 6, 256);
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (let y = 0; y < 256; y += 64) {             // 箭头指向行驶方向
    g.beginPath(); g.moveTo(18, y + 48); g.lineTo(32, y + 20); g.lineTo(46, y + 48); g.lineTo(32, y + 38); g.fill();
  }
  return tex(c);
}

export function windowTexture(seed, cols = 8, rows = 16) {
  const [c, g] = cv(256, 512);
  g.fillStyle = '#070912'; g.fillRect(0, 0, 256, 512);
  const pal = ['#ffd27a', '#9fe3ff', '#ffffff', '#ff9ad5', '#7fb8ff'];
  let r = seed;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const cw = 256 / cols, rh = 512 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (rnd() < 0.45) continue;
    g.fillStyle = pal[(rnd() * pal.length) | 0];
    g.globalAlpha = 0.35 + rnd() * 0.65;
    g.fillRect(x * cw + 4, y * rh + 5, cw - 8, rh - 10);
  }
  g.globalAlpha = 1;
  return tex(c);
}

export function textTexture(text, { w = 512, h = 128, color = '#ff2b6a', bg = 'rgba(0,0,0,0)', font = '900 84px "PingFang SC","Microsoft YaHei",sans-serif', border = true } = {}) {
  const [c, g] = cv(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = color; g.lineWidth = 8; g.shadowColor = color; g.shadowBlur = 20; g.strokeRect(8, 8, w - 16, h - 16); }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
  g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = .65; g.fillText(text, w / 2, h / 2 + 4);
  return tex(c, false);
}

export function checkerTexture() {
  const [c, g] = cv(256, 64);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 32, y * 32, 32, 32); }
  return tex(c);
}

export function arrowTexture() {
  const [c, g] = cv(128, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(0,200,255,.15)'); gr.addColorStop(1, 'rgba(0,120,255,.6)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#c8f6ff';
  for (let y = 0; y < 256; y += 128) {
    g.beginPath(); g.moveTo(64, y + 14); g.lineTo(118, y + 70); g.lineTo(96, y + 70); g.lineTo(64, y + 40);
    g.lineTo(32, y + 70); g.lineTo(10, y + 70); g.closePath(); g.fill();
  }
  return tex(c);
}

export function chevronTexture() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#111'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ffcc00';
  for (let i = -256; i < 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 + 256, 256); g.lineTo(i + 256, 256); g.fill(); }
  return tex(c);
}

export function gridTexture() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#060814'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(80,120,255,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(80,120,255,.12)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  return tex(c);
}

export function smokeTexture() {
  const [c, g] = cv(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}
