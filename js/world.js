import * as THREE from 'three';
import { ROAD_HALF, CURB, WALL_H } from './track.js';
import * as TX from './textures.js';

// 沿赛道生成带状几何体。fn(i) 返回 [[x,y,z,u],[x,y,z,u]] 左右两点
function strip(track, fn, vScale, from = 0, to = track.N, closed = true) {
  const pos = [], uv = [], idx = [];
  const count = to - from + (closed ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const i = track.wrap(from + k);
    const [a, b] = fn(i);
    const v = (k * track.ds) / vScale;
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    uv.push(a[3], v, b[3], v);
    if (k > 0) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const P = (t, i, d, dy = 0, u = 0, useRamp = true) => [
  t.px[i] + t.rx[i] * d, t.py[i] + (useRamp ? t.ramp[i] : 0) + dy, t.pz[i] + t.rz[i] * d, u];

export function buildWorld(scene, track) {
  const group = new THREE.Group(); scene.add(group);
  const H = ROAD_HALF, E = H + CURB;

  // 路面
  const road = new THREE.Mesh(
    strip(track, i => [P(track, i, -H, 0.02, 0), P(track, i, H, 0.02, 1)], 24),
    new THREE.MeshStandardMaterial({ map: TX.roadTexture(), roughness: .55, metalness: .15 }));
  road.receiveShadow = true; group.add(road);

  // 路肩（红白）
  const curbMat = new THREE.MeshStandardMaterial({ map: TX.curbTexture(), roughness: .6 });
  for (const sgn of [-1, 1]) {
    const m = new THREE.Mesh(strip(track, i => sgn < 0
      ? [P(track, i, -E, 0.08, 0), P(track, i, -H, 0.02, 1)]
      : [P(track, i, H, 0.02, 0), P(track, i, E, 0.08, 1)], 8), curbMat);
    m.receiveShadow = true; group.add(m);
  }

  // 护栏：霓虹墙 + 顶部灯带
  const wallMatL = new THREE.MeshStandardMaterial({ map: TX.wallTexture('#26c6ff', '#8a3bff'), emissive: 0xffffff, emissiveIntensity: .55, side: THREE.DoubleSide });
  wallMatL.emissiveMap = wallMatL.map;
  const wallMatR = new THREE.MeshStandardMaterial({ map: TX.wallTexture('#ff2b6a', '#ffb31f'), emissive: 0xffffff, emissiveIntensity: .55, side: THREE.DoubleSide });
  wallMatR.emissiveMap = wallMatR.map;
  const stripMats = [new THREE.MeshBasicMaterial({ color: 0x40d8ff }), new THREE.MeshBasicMaterial({ color: 0xff3d8a })];
  [-1, 1].forEach((sgn, n) => {
    const d = sgn * E;
    // uv: u=高度方向，v=沿赛道
    const wall = new THREE.Mesh(strip(track, i => {
      const top = Math.max(WALL_H, track.ramp[i] + WALL_H);
      return [P(track, i, d, 0, 0, false), P(track, i, d, top, 1, false)];
    }, 8), n ? wallMatR : wallMatL);
    group.add(wall);
    const lightStrip = new THREE.Mesh(strip(track, i => {
      const top = Math.max(WALL_H, track.ramp[i] + WALL_H);
      return [P(track, i, d - sgn * 0.15, top, 0, false), P(track, i, d + sgn * 0.15, top, 1, false)];
    }, 8), stripMats[n]);
    group.add(lightStrip);
  });

  // 高架下方桥体侧面 + 桥墩
  const underMat = new THREE.MeshStandardMaterial({ color: 0x1a1d2c, roughness: .8, side: THREE.DoubleSide });
  for (const sgn of [-1, 1]) {
    group.add(new THREE.Mesh(strip(track, i => {
      const a = P(track, i, sgn * E, 0, 0, false), b = P(track, i, sgn * E, -Math.min(1.2, Math.max(.3, track.py[i])), 0, false);
      return [[a[0], a[1], a[2], 0], [b[0], b[1], b[2], 1]];
    }, 8), underMat));
  }
  const depth = i => -Math.min(1.2, Math.max(.3, track.py[i]));
  group.add(new THREE.Mesh(strip(track, i => [P(track, i, E, depth(i), 0, false), P(track, i, -E, depth(i), 1, false)], 8), underMat));
  const pillarGeo = new THREE.CylinderGeometry(1.4, 1.8, 1, 12);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5a6078, roughness: .7 });
  for (let i = 0; i < track.N; i += 34) {
    const y = track.py[i];
    if (y < 3) continue;
    for (const d of [-7, 7]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.scale.y = y - 1.2;
      p.position.set(track.px[i] + track.rx[i] * d, (y - 1.2) / 2, track.pz[i] + track.rz[i] * d);
      p.castShadow = true; group.add(p);
    }
  }

  buildFeatures(group, track);
  buildCity(group, track);
  buildSky(scene);
  return group;
}
// 贴在路面上的一小块（加速带、起跑线等）
function patch(track, s0, len, d0, d1, dy, mat, vScale) {
  const i0 = Math.round(track.wrapS(s0) / track.ds), n = Math.max(2, Math.round(len / track.ds));
  return new THREE.Mesh(strip(track, i => [P(track, i, d0, dy, 0), P(track, i, d1, dy, 1)], vScale ?? len, i0, i0 + n, false), mat);
}

const animated = [];

function buildFeatures(group, track) {
  const E = ROAD_HALF + CURB;
  // 起跑线
  group.add(patch(track, -2, 3.2, -ROAD_HALF, ROAD_HALF, 0.04,
    new THREE.MeshStandardMaterial({ map: TX.checkerTexture(), roughness: .6 }), 3.2));

  // 起点拱门
  const f = track.frameAt(0, {});
  const gate = new THREE.Group();
  gate.position.set(f.x, f.y, f.z);
  gate.rotation.y = Math.atan2(f.tx, f.tz);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1b2244, metalness: .6, roughness: .3, emissive: 0x0a2a6a });
  for (const x of [-E - 1, E + 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 12, 1.6), postMat); p.position.set(x, 6, 0); p.castShadow = true; gate.add(p);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(.25, 11, .25), new THREE.MeshBasicMaterial({ color: 0x26c6ff }));
    neon.position.set(x + (x < 0 ? .9 : -.9), 6, .9); gate.add(neon);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * E + 4, 3.2, 1.4), postMat); beam.position.y = 12.5; gate.add(beam);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2 * E, 3), new THREE.MeshBasicMaterial({
    map: TX.textTexture('QQ飞车 · START', { w: 1024, h: 160, color: '#26c6ff', font: '900 110px "PingFang SC","Microsoft YaHei",sans-serif' }), transparent: true }));
  sign.position.set(0, 12.5, -.75); sign.rotation.y = Math.PI; gate.add(sign);
  const sign2 = sign.clone(); sign2.position.z = .75; sign2.rotation.y = 0; gate.add(sign2);
  group.add(gate);

  // 加速带
  const padMat = new THREE.MeshBasicMaterial({ map: TX.arrowTexture(), transparent: true, depthWrite: false });
  animated.push(t => { padMat.map.offset.y = -t * 2.5; });
  for (const b of track.boostPads) group.add(patch(track, b.s, 9, b.d - 2.6, b.d + 2.6, 0.06, padMat, 4.5));

  // 飞跃台：黄黑斜纹 + 两侧警示灯
  group.add(patch(track, track.rampStart, track.rampLen, -ROAD_HALF, ROAD_HALF, 0.05,
    new THREE.MeshStandardMaterial({ map: TX.chevronTexture(), roughness: .5 }), 6));
  const jumpSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3), new THREE.MeshBasicMaterial({
    map: TX.textTexture('JUMP ▲ 飞跃', { color: '#ffcc00' }), transparent: true, side: THREE.DoubleSide }));
  const rf = track.frameAt(track.rampStart - 30, {});
  jumpSign.position.set(rf.x, rf.y + 10, rf.z); jumpSign.rotation.y = Math.atan2(rf.tx, rf.tz) + Math.PI;
  group.add(jumpSign);
  for (const d of [-E - 1.2, E + 1.2]) {
    const pf = track.frameAt(track.rampStart - 30, {});
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 10), postMat);
    pole.position.set(pf.x + pf.rx * d * .55, pf.y + 5, pf.z + pf.rz * d * .55); group.add(pole);
  }

  // 隧道：半圆管 + 光环
  const [t0, t1] = track.tunnel;
  const i0 = Math.round(t0 / track.ds), i1 = Math.round(t1 / track.ds);
  const n = track.wrap(i1 - i0);
  const R = E + 1.5, SEG = 18;
  const pos = [], uv = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const i = track.wrap(i0 + k);
    for (let a = 0; a <= SEG; a++) {
      const ang = Math.PI * a / SEG, d = Math.cos(ang) * R, h = Math.sin(ang) * R * .62;
      pos.push(track.px[i] + track.rx[i] * d, track.py[i] + h, track.pz[i] + track.rz[i] * d);
      uv.push(a / SEG, k * track.ds / 6);
      if (k > 0 && a > 0) {
        const c = k * (SEG + 1) + a, p = c - (SEG + 1);
        idx.push(p - 1, p, c - 1, p, c, c - 1);
      }
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tg.setIndex(idx); tg.computeVertexNormals();
  const tunnelTex = TX.gridTexture(); tunnelTex.repeat.set(6, 1);
  group.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tunnelTex, emissiveMap: tunnelTex, emissive: 0x8899ff, emissiveIntensity: .6, side: THREE.DoubleSide, roughness: .4 })));
  const ringMats = [new THREE.MeshBasicMaterial({ color: 0x26c6ff }), new THREE.MeshBasicMaterial({ color: 0xff2bb0 })];
  for (let k = 0, r = 0; k <= n; k += 14, r++) {
    const i = track.wrap(i0 + k);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - .2, .18, 6, 32, Math.PI), ringMats[r % 2]);
    ring.position.set(track.px[i], track.py[i], track.pz[i]);
    ring.rotation.y = Math.atan2(track.tx[i], track.tz[i]);
    ring.scale.y = .62;
    group.add(ring);
  }

  // 路灯（实例化）
  const lampCount = Math.floor(track.N / 28) * 2;
  const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .16, 7, 6), new THREE.MeshStandardMaterial({ color: 0x3a4058, metalness: .7 }), lampCount);
  const headI = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, .25, .6), new THREE.MeshBasicMaterial({ color: 0xbfefff }), lampCount);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  let c = 0;
  for (let i = 0; i < track.N && c < lampCount; i += 28) {
    const inTunnel = track.wrap(i - i0) < n;
    for (const sgn of [-1, 1]) {
      const d = sgn * (E + .8);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(track.rx[i], track.rz[i]));
      v.set(track.px[i] + track.rx[i] * d, track.py[i] + (inTunnel ? -50 : 3.5), track.pz[i] + track.rz[i] * d);
      m.compose(v, q, sc); poleI.setMatrixAt(c, m);
      v.set(track.px[i] + track.rx[i] * (d - sgn * 1), track.py[i] + (inTunnel ? -50 : 7), track.pz[i] + track.rz[i] * (d - sgn * 1));
      m.compose(v, q, sc); headI.setMatrixAt(c, m);
      c++;
    }
  }
  group.add(poleI, headI);
}
function minTrackDist(track, x, z) {
  let best = 1e18;
  for (let i = 0; i < track.N; i += 4) {
    const d = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function buildCity(group, track) {
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // 地面
  const groundTex = TX.gridTexture(); groundTex.repeat.set(120, 120);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: .95, color: 0x8890b0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 230); ground.receiveShadow = true;
  group.add(ground);

  // 摩天楼群：几种窗户贴图，按尺寸缩放 UV
  const winTex = [1, 2, 3, 4, 5, 6].map(s => TX.windowTexture(s * 7919));
  const mats = winTex.map(t => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: .9, roughness: .3, metalness: .5, color: 0x8899bb }));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x0c0f1c, roughness: .6 });
  const neonCols = [0x26c6ff, 0xff2b6a, 0xffb31f, 0x8a3bff, 0x2bff9a];
  const neonMats = neonCols.map(c => new THREE.MeshBasicMaterial({ color: c }));
  const box = new THREE.BoxGeometry(1, 1, 1);
  let placed = 0, tries = 0;
  while (placed < 260 && tries < 4000) {
    tries++;
    const x = -420 + rnd() * 820, z = -160 + rnd() * 780;
    const dist = minTrackDist(track, x, z);
    const w = 14 + rnd() * 26, dpt = 14 + rnd() * 26;
    if (dist < Math.max(w, dpt) * .75 + ROAD_HALF + 8) continue;
    const far = Math.min(1, dist / 160);
    const h = 25 + rnd() * 70 + far * rnd() * 140;
    const mat = mats[(rnd() * mats.length) | 0].clone();
    mat.map = mat.map.clone(); mat.map.repeat.set(Math.round(w / 10), Math.round(h / 20)); mat.map.needsUpdate = true;
    mat.emissiveMap = mat.map;
    const b = new THREE.Mesh(box, [mat, mat, roofMat, roofMat, mat, mat]);
    b.scale.set(w, h, dpt); b.position.set(x, h / 2, z);
    b.rotation.y = rnd() < .5 ? 0 : (rnd() - .5) * .6;
    group.add(b);
    // 楼顶霓虹边
    if (rnd() < .7) {
      const nm = neonMats[(rnd() * neonMats.length) | 0];
      const edge = new THREE.Mesh(box, nm);
      edge.scale.set(w + .6, .6, dpt + .6); edge.position.set(x, h, z); edge.rotation.y = b.rotation.y;
      group.add(edge);
      if (rnd() < .35) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(.2, .4, 12 + rnd() * 20, 6), nm);
        sp.position.set(x, h + 8, z); group.add(sp);
      }
    }
    placed++;
  }

  // 远景天际线环
  const skyMat = mats[0].clone(); skyMat.map = mats[0].map.clone(); skyMat.map.repeat.set(2, 3); skyMat.emissiveMap = skyMat.map; skyMat.emissiveIntensity = .5;
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * Math.PI * 2, r = 900 + rnd() * 200;
    const h = 80 + rnd() * 260, w = 40 + rnd() * 60;
    const b = new THREE.Mesh(box, skyMat);
    b.scale.set(w, h, w); b.position.set(Math.cos(a) * r, h / 2, 230 + Math.sin(a) * r);
    group.add(b);
  }

  // 广告牌
  const ads = [['QQ飞车', '#26c6ff'], ['漂移之王', '#ff2b6a'], ['NITRO', '#ffb31f'], ['霓虹十一城', '#8a3bff'], ['SPEED', '#2bff9a'], ['集气 · 双喷', '#ff7a1f']];
  const adMats = ads.map(([t, c]) => new THREE.MeshBasicMaterial({ map: TX.textTexture(t, { color: c, bg: 'rgba(5,8,25,.92)' }), side: THREE.DoubleSide }));
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3048, metalness: .7 });
  for (let k = 0, i = 120; i < track.N; i += 170, k++) {
    if (Math.abs(track.curv[i]) > .02) continue;
    const sgn = k % 2 ? 1 : -1, d = sgn * (ROAD_HALF + CURB + 7);
    const x = track.px[i] + track.rx[i] * d, z = track.pz[i] + track.rz[i] * d, y = track.py[i];
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), adMats[k % adMats.length]);
    bd.position.set(x, y + 9, z);
    bd.rotation.y = Math.atan2(track.tx[i], track.tz[i]) + Math.PI + sgn * .5;
    group.add(bd);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, y + 7), poleMat);
    pole.position.set(x, (y + 7) / 2, z); group.add(pole);
  }
}

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(1800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { t: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; uniform float t;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        float y = vP.y;
        vec3 top = vec3(.02,.02,.09), mid = vec3(.17,.04,.30), hor = vec3(.95,.25,.45);
        vec3 c = mix(hor, mid, smoothstep(-.02,.18,y)); c = mix(c, top, smoothstep(.15,.6,y));
        vec2 g = floor(vec2(atan(vP.z,vP.x)*300., y*300.));
        float s = step(.996, h(g)) * smoothstep(.1,.5,y);
        c += vec3(s) * (.6+.4*sin(t*3.+h(g)*30.));
        // 月亮
        vec3 md = normalize(vec3(-.4,.35,.85)); float m = dot(vP, md);
        c += vec3(1.,.85,.95)*smoothstep(.9985,.999,m) + vec3(.6,.2,.5)*pow(max(m,0.),60.)*.5;
        gl_FragColor = vec4(c,1.);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat); sky.position.set(0, 0, 230);
  scene.add(sky);
  animated.push(t => { mat.uniforms.t.value = t; });
}

export function animateWorld(t) { for (const f of animated) f(t); }
