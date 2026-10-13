import * as THREE from 'three';

export const ROAD_HALF = 12;      // 半路宽（米）
export const CURB = 1.6;          // 路肩宽
export const WALL_H = 1.3;

// 霓虹十一城赛道控制点 [x, y, z]
const CTRL = [
  [0, 0, 0], [120, 0, 0], [220, 0, -10], [290, 0, 30], [310, 0, 110], [270, 0, 180],
  [190, 3, 200], [110, 9, 190], [30, 13, 210], [-30, 14, 260], [-50, 14, 340],
  [-20, 12, 420], [-60, 7, 490], [-150, 2, 500], [-230, 0, 460], [-250, 0, 380],
  [-200, 0, 330], [-140, 0, 300], [-120, 0, 240], [-170, 0, 190], [-240, 0, 160],
  [-300, 0, 100], [-300, 0, 20], [-250, 0, -30], [-160, 0, -30], [-80, 0, -5],
];

export class Track {
  constructor() {
    const pts = CTRL.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    const N = Math.round(this.length / 0.9);
    this.N = N;
    this.ds = this.length / N;
    const P = this.curve.getSpacedPoints(N); P.pop();
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);   // 水平切线
    this.rx = new Float32Array(N); this.rz = new Float32Array(N);   // 右向量
    this.slope = new Float32Array(N);
    this.ramp = new Float32Array(N);                                  // 飞跃台附加高度
    for (let i = 0; i < N; i++) { this.px[i] = P[i].x; this.py[i] = P[i].y; this.pz[i] = P[i].z; }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      this.tx[i] = dx; this.tz[i] = dz; this.rx[i] = -dz; this.rz[i] = dx;
      this.slope[i] = (this.py[b] - this.py[a]) / (2 * this.ds);
    }
    // 曲率（带符号，右转为正）
    this.curv = new Float32Array(N);
    const W = 6;
    for (let i = 0; i < N; i++) {
      const a = (i - W + N) % N, b = (i + W) % N;
      const ha = Math.atan2(this.tx[a], this.tz[a]), hb = Math.atan2(this.tx[b], this.tz[b]);
      let dh = hb - ha; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      this.curv[i] = -dh / (2 * W * this.ds);
    }

    // 赛道要素
    this.startIdx = 0;
    const rampS = this.sNear(-205, -30);
    this.rampStart = rampS; this.rampLen = 22; this.rampH = 2.6;
    for (let k = 0; k < this.rampLen / this.ds; k++) {
      const i = this.wrap(Math.round(rampS / this.ds) + k);
      this.ramp[i] = this.rampH * (k * this.ds) / this.rampLen;
    }
    this.boostPads = [
      { s: this.sNear(70, 0), d: -5 }, { s: this.sNear(70, 0), d: 5 },
      { s: this.sNear(-45, 300), d: 0 },
      { s: this.sNear(-150, 296), d: -4 },
      { s: this.sNear(-300, 60), d: 4 },
    ];
    this.tunnel = [this.sNear(-298, 125), this.sNear(-262, -18)];
  }

  wrap(i) { return ((i % this.N) + this.N) % this.N; }
  wrapS(s) { const L = this.length; return ((s % L) + L) % L; }

  sNear(x, z) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < this.N; i++) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return bi * this.ds;
  }

  // 根据弧长 s 和横向偏移 d 取得世界坐标信息
  frameAt(s, out) {
    s = this.wrapS(s);
    const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    out.x = this.px[i] + (this.px[j] - this.px[i]) * t;
    out.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    out.y = this.py[i] + (this.py[j] - this.py[i]) * t;
    out.tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t;
    out.tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    const l = Math.hypot(out.tx, out.tz); out.tx /= l; out.tz /= l;
    out.rx = -out.tz; out.rz = out.tx;
    out.ramp = this.ramp[i];
    out.slope = this.slope[i];
    out.curv = this.curv[i];
    out.i = i;
    return out;
  }

  // 世界坐标 -> 赛道坐标（局部搜索）
  project(x, z, y, hint, out) {
    let bi = 0;
    if (hint < 0) {
      let best = 1e18;
      for (let i = 0; i < this.N; i++) {
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2 + ((this.py[i] - y) * 3) ** 2;
        if (d < best) { best = d; bi = i; }
      }
    } else {
      let best = 1e18;
      for (let k = -40; k <= 40; k++) {
        const i = this.wrap(hint + k);
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < best) { best = d; bi = i; }
      }
    }
    const dx = x - this.px[bi], dz = z - this.pz[bi];
    let along = dx * this.tx[bi] + dz * this.tz[bi];
    const s = this.wrapS(bi * this.ds + along);
    this.frameAt(s, out);
    out.s = s;
    out.d = (x - out.x) * out.rx + (z - out.z) * out.rz;
    out.ground = out.y + (Math.abs(out.d) < ROAD_HALF + CURB ? out.ramp : 0);
    return out;
  }

  // 两个弧长之间的有符号差（考虑回绕）
  deltaS(a, b) {
    let d = b - a; const L = this.length;
    if (d > L / 2) d -= L; if (d < -L / 2) d += L;
    return d;
  }
}
