import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Track, ROAD_HALF, CURB } from './track.js';
import { buildWorld, animateWorld } from './world.js';
import { makeCar, animateCar } from './car.js';
import { Vehicle, angDiff } from './physics.js';
import { AIDriver } from './ai.js';
import { Audio } from './audio.js';
import { Particles, SkidMarks, SpeedLines } from './effects.js';

const $ = id => document.getElementById(id);

// —— 渲染器 / 场景 ——
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1b0a36, .0021);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .1, 4000);

scene.add(new THREE.HemisphereLight(0x8a9cff, 0x2a1030, 1.25));
const sun = new THREE.DirectionalLight(0xc8d4ff, 1.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -.0005;
scene.add(sun, sun.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .75, .55, .72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// —— 世界 ——
const track = new Track();
buildWorld(scene, track);
const particles = new Particles(scene);
const skids = new SkidMarks(scene);
const speedLines = new SpeedLines($('speedlines'));
const audio = new Audio();

// —— 输入 ——
const keys = {};
const MAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'drift', ShiftRight: 'drift', ControlLeft: 'nitro', ControlRight: 'nitro', Space: 'nitro',
};
const edges = {};
addEventListener('keydown', e => {
  const k = MAP[e.code];
  if (k) { if (!keys[k]) edges[k] = true; keys[k] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyR' && state.mode === 'race') resetPlayer();
  if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
  if (e.code === 'KeyM') { audio.setMuted(!audio.muted); popup(audio.muted ? '声音 关' : '声音 开', 'white'); }
  if (e.code === 'Escape') togglePause();
  if (e.code === 'Enter' && state.mode === 'done') startRace();
  if (e.code === 'Enter' && state.mode === 'menu') $('startBtn').click();
});
addEventListener('keyup', e => { const k = MAP[e.code]; if (k) { keys[k] = false; e.preventDefault(); } });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state.mode === 'race') togglePause(true); });

// 触屏
if ('ontouchstart' in window) {
  $('touch').classList.remove('hidden');
  for (const b of document.querySelectorAll('#touch button')) {
    const k = b.dataset.k;
    b.addEventListener('touchstart', e => { e.preventDefault(); if (!keys[k]) edges[k] = true; keys[k] = true; audio.init(); });
    b.addEventListener('touchend', e => { e.preventDefault(); keys[k] = false; });
  }
}

// —— 赛车 ——
const RIVALS = [
  { name: '小橘子', color: '#ff8a1f', skill: .78 },
  { name: '车神阿杰', color: '#1fd6ff', skill: .95 },
  { name: '漂移少女', color: '#c45bff', skill: .86 },
];
let playerColor = '#ff2b6a', totalLaps = 3, camMode = 0;
const racers = [];

function buildRacers() {
  for (const r of racers) scene.remove(r.car.root);
  racers.length = 0;
  const grid = [[-6, 4], [-6, -4], [-14, 4], [-14, -4]];
  const defs = [{ name: '我', color: playerColor, player: true }, ...RIVALS];
  // 玩家在第二排起步，更有追赶感
  const order = [2, 0, 1, 3];
  defs.forEach((d, n) => {
    const veh = new Vehicle(track, { ai: !d.player, name: d.name, color: d.color });
    const [s, lane] = grid[order[n]];
    veh.place(s, lane);
    const car = makeCar(d.color, { name: d.player ? '' : d.name, ai: !d.player });
    scene.add(car.root);
    const r = { veh, car, player: !!d.player, lapShown: 1 };
    if (!d.player) r.ai = new AIDriver(veh, d.skill, lane * .6);
    racers.push(r);
  });
}
const player = () => racers[0];

// —— HUD 工具 ——
function popup(text, cls = 'blue') {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  $('popups').prepend(el); setTimeout(() => el.remove(), 1000);
  while ($('popups').children.length > 3) $('popups').lastChild.remove();
}
function center(text, go = false) {
  const el = $('center'); el.textContent = text; el.className = go ? 'go' : '';
  void el.offsetWidth; el.classList.add('anim');
}
const fmt = t => { if (!isFinite(t)) return '--:--.--'; const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
// —— 小地图 ——
const mm = $('minimap'), mg = mm.getContext('2d');
const mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = 220;
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (let i = 0; i < track.N; i++) { minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]); minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]); }
const mmScale = 170 / Math.max(maxX - minX, maxZ - minZ);
// 从起点朝向上方看：x 轴取反使左右与驾驶视角一致
const mmP = (x, z) => [110 - (x - (minX + maxX) / 2) * mmScale, 110 - (z - (minZ + maxZ) / 2) * mmScale];
{
  const g = mmBase.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [w, c] of [[9, 'rgba(38,198,255,.35)'], [4, '#e8f6ff']]) {
    g.strokeStyle = c; g.lineWidth = w; g.beginPath();
    for (let i = 0; i <= track.N; i += 3) { const [x, y] = mmP(track.px[i % track.N], track.pz[i % track.N]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
  }
  const [sx, sy] = mmP(track.px[0], track.pz[0]);
  g.fillStyle = '#fff'; g.fillRect(sx - 6, sy - 2, 12, 4);
}
function drawMinimap() {
  mg.clearRect(0, 0, 220, 220); mg.drawImage(mmBase, 0, 0);
  for (let n = racers.length - 1; n >= 0; n--) {
    const r = racers[n], [x, y] = mmP(r.veh.x, r.veh.z);
    if (r.player) {
      const a = -r.veh.h;   // 指向车头
      mg.save(); mg.translate(x, y); mg.rotate(a + Math.PI);
      mg.fillStyle = '#ffe45c'; mg.strokeStyle = '#000'; mg.lineWidth = 1.5;
      mg.beginPath(); mg.moveTo(0, -8); mg.lineTo(6, 6); mg.lineTo(0, 3); mg.lineTo(-6, 6); mg.closePath(); mg.fill(); mg.stroke();
      mg.restore();
    } else {
      mg.fillStyle = r.veh.color; mg.beginPath(); mg.arc(x, y, 4.5, 0, Math.PI * 2); mg.fill();
      mg.strokeStyle = '#fff'; mg.lineWidth = 1; mg.stroke();
    }
  }
}

// —— 状态机 ——
const state = { mode: 'menu', t: 0, raceT: 0, lastLapStart: 0, best: Infinity, lastUpEdge: -9, jetChecked: false, wrongShown: false, finishOrder: [] };

function startRace() {
  buildRacers();
  for (const k in keys) keys[k] = false;
  Object.assign(state, { mode: 'countdown', t: 0, raceT: 0, lastLapStart: 0, lastUpEdge: -9, jetChecked: false, finishOrder: [], cd: 3 });
  for (const id of ['menu', 'pause', 'result']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  audio.init(); audio.musicOn = true;
  center('3'); audio.sfx('count');
  camSnap = true;
}

function togglePause(force) {
  if (state.mode === 'race' || state.mode === 'countdown') { state.prevMode = state.mode; state.mode = 'paused'; $('pause').classList.remove('hidden'); audio.ctx?.suspend(); }
  else if (state.mode === 'paused' && force !== true) { state.mode = state.prevMode; $('pause').classList.add('hidden'); audio.ctx?.resume(); }
}

function resetPlayer() {
  const v = player().veh; v.resetOnTrack(); popup('复位', 'white'); camSnap = true;
}

function finishRace() {
  state.mode = 'done';
  audio.sfx('finish'); audio.musicOn = false;
  const rows = ranking();
  const pr = rows.findIndex(r => r.player) + 1;
  $('resTitle').textContent = pr === 1 ? '🏆 冠军！' : `第 ${pr} 名`;
  $('resTable').innerHTML = rows.map((r, i) => `<tr class="${r.player ? 'me' : ''}"><td>${i + 1}</td><td>${r.veh.name}</td><td>${r.veh.finished ? fmt(r.veh.finishTime) : '未完成'}</td></tr>`).join('')
    + `<tr><td colspan="3" style="font-size:13px;color:#9fd8ff">最佳单圈 ${fmt(state.best)}</td></tr>`;
  setTimeout(() => { if (state.mode === 'done') $('result').classList.remove('hidden'); }, 1800);
}

function ranking() {
  return [...racers].sort((a, b) => {
    if (a.veh.finished && b.veh.finished) return a.veh.finishTime - b.veh.finishTime;
    if (a.veh.finished !== b.veh.finished) return a.veh.finished ? -1 : 1;
    return b.veh.total - a.veh.total;
  });
}

// 菜单
for (const b of document.querySelectorAll('#colors button')) b.onclick = () => {
  document.querySelectorAll('#colors button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); playerColor = b.dataset.c;
};
for (const b of document.querySelectorAll('#laps button')) b.onclick = () => {
  document.querySelectorAll('#laps button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); totalLaps = +b.dataset.l;
};
$('startBtn').onclick = startRace;
$('resumeBtn').onclick = () => togglePause();
$('restartBtn').onclick = startRace;
$('againBtn').onclick = startRace;
const toMenu = () => { state.mode = 'menu'; audio.musicOn = false; for (const id of ['pause', 'result', 'hud']) $(id).classList.add('hidden'); $('menu').classList.remove('hidden'); audio.ctx?.resume(); };
$('menuBtn').onclick = toMenu; $('backBtn').onclick = toMenu;
// —— 玩家事件 → 反馈 ——
let shake = 0;
function handleEvents(r) {
  const v = r.veh;
  for (const e of v.events) {
    if (!r.player) continue;
    switch (e.type) {
      case 'smallJet': popup('小喷', 'blue'); audio.sfx('smallJet'); break;
      case 'doubleJet': popup('双喷！', 'gold'); audio.sfx('doubleJet'); break;
      case 'landJet': popup('落地喷', 'pink'); audio.sfx('smallJet'); break;
      case 'startJet': popup('起步加速！', 'gold'); audio.sfx('doubleJet'); break;
      case 'nitro': popup('氮气加速', 'blue'); audio.sfx('nitro'); shake = Math.max(shake, .25); break;
      case 'gainNitro': popup('+1 氮气', 'white'); audio.sfx('gainNitro'); break;
      case 'pad': popup('加速带', 'pink'); audio.sfx('pad'); break;
      case 'wall': audio.sfx('wall'); shake = Math.max(shake, e.data.impact * 1.2); break;
      case 'land': audio.sfx('land'); shake = Math.max(shake, .3); break;
      case 'takeoff': popup('飞跃！', 'white'); break;
    }
  }
}

function playerInput() {
  const inp = {
    steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    up: !!keys.up, down: !!keys.down, drift: !!keys.drift,
    upEdge: !!edges.up, nitroEdge: !!edges.nitro,
  };
  return inp;
}

// —— 视觉效果 ——
const tmpV = new THREE.Vector3();
function carEffects(r, dt) {
  const v = r.veh, c = r.car;
  const fx = Math.sin(v.h), fz = Math.cos(v.h), rx = -fz, rz = fx;
  // 漂移：后轮烟雾 + 胎痕
  for (const side of [-1, 1]) {
    const wx = v.x - fx * 1.33 + rx * .9 * side, wz = v.z - fz * 1.33 + rz * .9 * side;
    const key = r.veh.name + side;
    if (v.drifting && !v.air) {
      skids.add(key, wx, v.fr.ground, wz, rx, rz);
      if (Math.random() < dt * 60) {
        const k = .45 + Math.random() * .3;
        particles.emit(wx, v.y + .25, wz, (Math.random() - .5) * 2 - fx * 2, .8 + Math.random(), (Math.random() - .5) * 2 - fz * 2,
          k * .7, k * .75, k * .9, .9, 1.4, 3.2);
      }
      // 漂移火花（颜色随集气变化）
      if (Math.random() < dt * 40) {
        const blue = v.driftTime > .9;
        particles.emit(wx, v.y + .1, wz, (Math.random() - .5) * 6 - fx * 6, 1 + Math.random() * 3, (Math.random() - .5) * 6 - fz * 6,
          blue ? .3 : 1, blue ? .7 : .65, blue ? 1 : .2, .35, .35, -.4);
      }
    } else skids.cut(key);
  }
  // 喷射尾焰粒子
  if (v.boostT > 0 && Math.random() < dt * 70) {
    const nit = v.boostKind === 2;
    for (const side of [-1, 1]) particles.emit(v.x - fx * 2.6 + rx * .45 * side, v.y + .45, v.z - fz * 2.6 + rz * .45 * side,
      -fx * 8 + (Math.random() - .5) * 2, Math.random(), -fz * 8 + (Math.random() - .5) * 2,
      nit ? .25 : 1, nit ? .55 : .5, nit ? 1 : .15, .3, nit ? 1.1 : .8, 1.5);
  }

  // 车身姿态
  const tilt = Math.atan(v.fr.slope);
  let pitch = -tilt - Math.max(-.06, Math.min(.06, v.accel * .0025));
  if (v.air) pitch = -Math.atan2(v.vy, Math.max(10, v.v)) * .8;
  r.visPitch = (r.visPitch ?? 0) + (pitch - (r.visPitch ?? 0)) * Math.min(1, dt * 8);
  const lat = v.drifting ? v.driftDir : v.steer * Math.min(1, Math.abs(v.v) / 40);
  r.visRoll = (r.visRoll ?? 0) + (lat * (v.drifting ? .09 : .05) - (r.visRoll ?? 0)) * Math.min(1, dt * 6);
  const slipVis = v.drifting ? -v.slip * .35 : 0;
  r.visSlip = (r.visSlip ?? 0) + (slipVis - (r.visSlip ?? 0)) * Math.min(1, dt * 8);
  c.root.position.set(v.x, v.y, v.z);
  c.root.rotation.y = v.h;
  animateCar(c, { speed: v.v, steer: v.drifting ? -v.driftDir * .3 : v.steer, slip: r.visSlip, roll: r.visRoll, pitch: r.visPitch,
    boost: v.boostT > 0 ? v.boostKind : 0, braking: keys.down && r.player, dt, t: state.t });
  // 车底光晕保持贴地
  c.glow.position.y = v.fr.ground - v.y + .06;
}
// —— 相机 ——
let camSnap = true;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camYaw = 0, camFov = 68;
function updateCamera(dt) {
  const v = player().veh;
  // 漂移时相机跟随速度方向，能看到车身侧滑
  const targetYaw = v.v < -1 ? v.h : (v.drifting ? v.va + v.slip * .35 : v.h);
  if (camSnap) camYaw = targetYaw;
  camYaw += angDiff(targetYaw, camYaw) * Math.min(1, dt * (v.drifting ? 4.5 : 7));
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const boosting = v.boostT > 0;
  const [dist, hgt, lookH] = camMode === 0 ? [7.2, 2.7, 1.3] : camMode === 1 ? [11, 4.2, 1.2] : [-.2, 1.25, 1.1];
  const back = camMode === 2 ? dist : dist + (boosting ? 1.4 : 0) + Math.abs(v.v) * .015;
  tmpV.set(v.x - fx * back, v.y + hgt, v.z - fz * back);
  if (camSnap || camMode === 2) camPos.copy(tmpV); else camPos.lerp(tmpV, Math.min(1, dt * 12));
  // 防止相机穿出护栏外太多
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - .5) * shake * .6;
    camera.position.y += (Math.random() - .5) * shake * .4;
    shake = Math.max(0, shake - dt * 1.5);
  }
  camLook.set(v.x + fx * 6, v.y + lookH, v.z + fz * 6);
  camera.lookAt(camLook);
  const targetFov = 66 + Math.min(1, Math.abs(v.v) / 56) * 10 + (boosting ? (v.boostKind === 2 ? 14 : 7) : 0);
  camFov += (targetFov - camFov) * Math.min(1, dt * 4);
  camera.fov = camFov; camera.updateProjectionMatrix();
  camSnap = false;
  sun.position.set(v.x + 40, v.y + 80, v.z + 25); sun.target.position.set(v.x, v.y, v.z);
}

// —— HUD ——
let hudT = 0;
const arc = $('speedArc'), slotEls = [...document.querySelectorAll('#slots i')];
function updateHUD(dt) {
  const r = player(), v = r.veh;
  const kmh = Math.round(v.kmh);
  $('speedNum').textContent = kmh;
  arc.style.strokeDashoffset = 377 - 377 * Math.min(1, kmh / 300);
  $('speedo').classList.toggle('boost', v.boostT > 0);
  $('nitroFill').style.width = (v.gauge * 100).toFixed(1) + '%';
  slotEls.forEach((el, i) => el.classList.toggle('on', i < v.slots));
  hudT -= dt;
  if (hudT > 0) return;
  hudT = .1;
  const lap = Math.min(totalLaps, Math.max(1, Math.floor(v.total / track.length) + 1));
  $('lap').textContent = `${lap}/${totalLaps}`;
  $('time').textContent = fmt(state.raceT);
  $('laptime').textContent = fmt(state.raceT - state.lastLapStart);
  $('best').textContent = fmt(state.best);
  const rk = ranking(), pos = rk.indexOf(r) + 1;
  $('rankNum').textContent = pos; $('rankTot').textContent = '/' + racers.length;
  $('ranklist').innerHTML = rk.map((x, i) => `<div class="${x.player ? 'me' : ''}"><span>${i + 1}. ${x.veh.name}</span><span>${x.veh.kmh | 0}</span></div>`).join('');
  $('warn').textContent = v.wrongT > 1 ? '⚠ 逆向行驶！按 R 复位' : '';
}

// —— 比赛逻辑 ——
function raceLogic(r) {
  const v = r.veh;
  if (v.finished) return;
  const lap = Math.floor(v.total / track.length) + 1;
  if (lap > r.lapShown && v.total > 0) {
    r.lapShown = lap;
    if (r.player) {
      const lt = state.raceT - state.lastLapStart;
      state.best = Math.min(state.best, lt);
      state.lastLapStart = state.raceT;
      if (lap <= totalLaps) { popup(lap === totalLaps ? '最后一圈！' : `第 ${lap} 圈`, 'gold'); audio.sfx('lap'); }
    }
  }
  if (v.total >= track.length * totalLaps) {
    v.finished = true; v.finishTime = state.raceT;
    if (r.player) { center('FINISH', true); finishRace(); }
  }
}
// —— 主循环 ——
const clock = new THREE.Clock();
const STEP = 1 / 120;
let acc = 0, menuT = 0;
const noInput = { steer: 0, up: false, down: false, drift: false, upEdge: false, nitroEdge: false };

function physicsStep(dt) {
  const racing = state.mode === 'race';
  for (const r of racers) {
    r.veh.events.length = 0;
    let inp = noInput;
    if (racing && !r.veh.finished) inp = r.player ? playerInput() : r.ai.input(dt, player().veh);
    else if (racing && r.veh.finished) inp = r.player ? { ...noInput, up: false } : r.ai.input(dt, player().veh);
    r.veh.step(dt, inp);
    handleEvents(r);
    if (racing) raceLogic(r);
  }
  // 车与车碰撞（圆形近似，两段式推开）
  for (let a = 0; a < racers.length; a++) for (let b = a + 1; b < racers.length; b++) {
    const A = racers[a].veh, B = racers[b].veh;
    const dx = B.x - A.x, dz = B.z - A.z, dy = B.y - A.y, d = Math.hypot(dx, dz);
    if (d < 2.4 && d > 1e-3 && Math.abs(dy) < 1.5) {
      const push = (2.4 - d) / 2, nx = dx / d, nz = dz / d;
      A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
      // 交换一部分纵向速度
      const fa = Math.sin(A.va) * nx + Math.cos(A.va) * nz, fb = Math.sin(B.va) * nx + Math.cos(B.va) * nz;
      if (fa * A.v > fb * B.v) { const t = (A.v - B.v) * .25; A.v -= Math.abs(t); B.v += Math.abs(t) * .5; }
      if ((racers[a].player || racers[b].player) && Math.abs(A.v - B.v) > 3) { audio.sfx('wall'); shake = Math.max(shake, .2); }
    }
  }
  for (const k in edges) edges[k] = false;
}

function countdown(dt) {
  const prev = state.t; state.t += dt;
  const cross = s => prev < s && state.t >= s;
  if (cross(1)) { center('2'); audio.sfx('count'); }
  if (cross(2)) { center('1'); audio.sfx('count'); }
  if (edges.up) state.lastUpEdge = state.t;
  if (cross(3)) { center('GO!', true); audio.sfx('go'); state.mode = 'race'; state.raceT = 0; state.goT = state.t;
    if (state.t - state.lastUpEdge < .25) player().veh.startJet();
    for (const r of racers) if (!r.player && Math.random() < r.ai.skill) r.veh.startJet();
  }
  for (const k in edges) if (k !== 'up') edges[k] = false;
  edges.up = false;
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  animateWorld(clock.elapsedTime);

  if (state.mode === 'menu') {
    // 菜单背景：环绕城市巡航镜头
    menuT += dt * .03;
    const f = track.frameAt(menuT * track.length, {});
    camera.position.set(f.x + f.rx * 30, f.y + 18, f.z + f.rz * 30);
    camera.lookAt(f.x + f.tx * 20, f.y + 2, f.z + f.tz * 20);
    camera.fov = 60; camera.updateProjectionMatrix();
    composer.render(); speedLines.draw(0, dt, '#fff');
    return;
  }
  if (state.mode === 'paused') { composer.render(); return; }

  if (state.mode === 'countdown') countdown(dt);
  else if (state.mode === 'race') {
    state.raceT += dt; state.t += dt;
    // 起步加速窗口：GO 后 0.25 秒内按下 ↑
    if (edges.up && state.t - state.goT < .25 && player().veh.boostT <= 0) player().veh.startJet();
  } else state.t += dt;

  acc += dt;
  while (acc >= STEP) { physicsStep(STEP); acc -= STEP; }

  for (const r of racers) carEffects(r, dt);
  particles.update(dt);
  updateCamera(dt);
  updateHUD(dt);
  drawMinimap();
  const v = player().veh;
  audio.update(v, state.mode === 'race');
  const sp = Math.max(0, (Math.abs(v.v) - 35) / 30) + (v.boostT > 0 ? (v.boostKind === 2 ? .9 : .45) : 0);
  speedLines.draw(sp, dt, v.boostKind === 2 ? '#bfe9ff' : '#ffffff');
  bloom.strength = .75 + (v.boostT > 0 ? .25 : 0);
  composer.render();
}

$('loading').remove();
frame();

// 调试钩子（自动化测试用）
window.__game = { state, racers, track, keys, edges, startRace };
