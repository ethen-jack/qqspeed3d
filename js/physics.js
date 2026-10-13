import { ROAD_HALF, CURB } from './track.js';

const TAU = Math.PI * 2;
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 速度参数（m/s）。km/h = ×3.6
export const V_MAX = 56;            // 约 200 km/h
const V_JET = 64, V_PAD = 67, V_NITRO = 79, V_REV = 14;
const ACC = 24, ACC_BOOST = 38, BRAKE = 34;
const GRAVITY = 28;
const SMALL_JET_WINDOW = .45, DOUBLE_JET_WINDOW = .45, LAND_JET_WINDOW = .3;

export class Vehicle {
  constructor(track, { ai = false, name = '', color = '#fff' } = {}) {
    this.track = track; this.ai = ai; this.name = name; this.color = color;
    this.events = [];
    this.fr = {};
  }

  place(s, d) {
    const t = this.track, f = t.frameAt(s, {});
    this.x = f.x + f.rx * d; this.z = f.z + f.rz * d; this.y = f.y;
    this.h = Math.atan2(f.tx, f.tz); this.va = this.h;
    this.v = 0; this.vy = 0; this.air = false; this.airTime = 0;
    this.steer = 0; this.prevGround = f.y; this.accel = 0;
    this.hint = -1;
    t.project(this.x, this.z, this.y, -1, this.fr);
    this.hint = this.fr.i; this.s = this.fr.s; this.d = this.fr.d;
    this.total = t.deltaS(0, this.s);
    this.drifting = false; this.driftDir = 0; this.driftTime = 0; this.driftRelease = 0;
    this.sinceDriftEnd = 99; this.sinceSmallJet = 99; this.sinceLand = 99; this.lastDriftLen = 0;
    this.boostT = 0; this.boostKind = 0; this.boostVmax = V_MAX;
    this.slots = 0; this.gauge = 0;
    this.wrongT = 0; this.wallT = 0;
    this.finished = false; this.finishTime = 0;
  }

  emit(type, data) { this.events.push({ type, data }); }

  // kind 1 = 小喷/双喷/落地喷/加速带, 2 = 氮气
  startBoost(kind, time, vmax, instant = 0) {
    if (this.boostKind === 2 && this.boostT > 0) {          // 氮气中：只叠加瞬时速度
      this.v = Math.min(this.v + instant, V_NITRO); return;
    }
    this.boostVmax = this.boostT > 0 ? Math.max(this.boostVmax, vmax) : vmax;
    this.boostKind = kind;
    this.boostT = Math.max(this.boostT, time);
    this.v = Math.max(this.v, Math.min(this.v + instant, this.boostVmax));
  }

  startJet() { this.startBoost(1, 1.2, V_JET + 4, 14); this.emit('startJet'); }

  addGauge(x) {
    if (this.slots >= 2) { this.gauge = Math.min(this.gauge + x, .999); return; }
    this.gauge += x;
    if (this.gauge >= 1) { this.gauge -= 1; this.slots++; this.emit('gainNitro'); if (this.slots >= 2) this.gauge = Math.min(this.gauge, .999); }
  }

  useNitro() {
    if (this.slots <= 0) return false;
    this.slots--;
    this.boostKind = 2; this.boostT = Math.max(this.boostT, 2.8); this.boostVmax = V_NITRO;
    this.v = Math.max(this.v, Math.min(this.v + 6, V_NITRO));
    this.emit('nitro');
    return true;
  }

  // inp: {steer:-1..1 (右为正), up, down, drift, upEdge, nitroEdge}
  step(dt, inp) {
    const t = this.track;
    this.sinceDriftEnd += dt; this.sinceSmallJet += dt; this.sinceLand += dt;

    // —— 喷射判定（↑ 的按下瞬间）——
    if (inp.upEdge && !this.air) {
      if (this.sinceDriftEnd < SMALL_JET_WINDOW && this.lastDriftLen > .2) {
        this.sinceDriftEnd = 99; this.sinceSmallJet = 0;
        this.startBoost(1, .6, V_JET, 4); this.addGauge(.05); this.emit('smallJet');
      } else if (this.sinceSmallJet < DOUBLE_JET_WINDOW) {
        this.sinceSmallJet = 99;
        this.startBoost(1, .7, V_JET + 2, 3); this.addGauge(.04); this.emit('doubleJet');
      } else if (this.sinceLand < LAND_JET_WINDOW) {
        this.sinceLand = 99;
        this.startBoost(1, .7, V_JET, 4); this.emit('landJet');
      }
    }
    if (inp.nitroEdge) this.useNitro();

    // —— 转向 ——
    this.steer += (inp.steer - this.steer) * Math.min(1, dt * (this.ai ? 6 : 11));
    const sv = Math.abs(this.v);
    const sgn = this.v >= 0 ? 1 : -1;
    const steerSign = Math.sign(inp.steer);

    // 漂移开始：方向 + Shift
    if (!this.drifting && inp.drift && steerSign !== 0 && sv > 15 && !this.air) {
      this.drifting = true; this.driftDir = steerSign; this.driftTime = 0; this.driftRelease = 0;
      this.emit('driftStart');
    }

    let yaw;
    if (this.drifting) {
      this.driftTime += dt;
      const same = steerSign === this.driftDir, opp = steerSign === -this.driftDir;
      let rate = 1.5 + (same ? .8 : 0) + (inp.drift ? .25 : 0);
      if (opp) rate = .2;
      yaw = -this.driftDir * rate * Math.min(1, sv / 22);
      // 松开方向和 Shift，或反打方向，结束漂移
      if ((!same && !inp.drift) || opp) this.driftRelease += dt; else this.driftRelease = 0;
      if (this.driftRelease > (opp ? .04 : .07) || sv < 10 || this.air) this.endDrift();
      // 漂移集气
      if (this.drifting) this.addGauge(dt * .62 * Math.min(1.2, sv / 50) * (.35 + Math.abs(angDiff(this.h, this.va))));
    } else {
      const k = Math.min(1, sv / 7) * (1.75 - .5 * Math.min(1, sv / 60));
      yaw = -this.steer * k * sgn * (this.ai ? 1.9 : 1);
    }
    if (this.air) yaw *= .35;
    this.h += yaw * dt;

    // —— 速度 ——
    if (this.boostT > 0) { this.boostT -= dt; if (this.boostT <= 0) { this.boostT = 0; this.boostKind = 0; } }
    const vmax = this.boostT > 0 ? this.boostVmax : V_MAX;
    const v0 = this.v;
    if (!this.air) {
      if (this.boostT > 0 && this.v < vmax) this.v += ACC_BOOST * dt;
      else if (inp.up && this.v >= -.5) this.v += ACC * (1 - Math.pow(clamp(this.v / vmax, 0, 1), 1.7)) * dt;
      else if (inp.down) this.v -= (this.v > 0 ? BRAKE : ACC * .6) * dt;
      else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), (3 + .0008 * this.v * this.v) * dt);
      if (inp.up && this.v < 0) this.v = Math.min(0, this.v + BRAKE * dt);
      if (this.v > vmax) this.v -= (this.v - vmax) * 1.4 * dt;
      if (this.v < -V_REV) this.v = -V_REV;
      // 上坡减速/下坡加速
      this.v -= this.fr.slope * 9 * dt;
      // 漂移损速
      if (this.drifting) { const sl = Math.abs(angDiff(this.h, this.va)); this.v -= (1.2 + 5 * sl * sl) * dt; }
    }
    this.accel = (this.v - v0) / dt;

    // —— 抓地：速度方向追随车头 ——
    let slip = angDiff(this.h, this.va);
    if (this.v < 0) slip = 0;
    const grip = this.drifting ? 3.2 : (this.sinceDriftEnd < .3 ? 7 : 13);
    slip *= Math.exp(-grip * dt);
    const maxSlip = this.drifting ? .78 : .5;
    slip = clamp(slip, -maxSlip, maxSlip);
    this.va = this.h - slip;

    // —— 位移 ——
    this.x += Math.sin(this.va) * this.v * dt;
    this.z += Math.cos(this.va) * this.v * dt;
    const prevS = this.s;
    t.project(this.x, this.z, this.y, this.hint, this.fr);
    const f = this.fr;
    this.hint = f.i; this.s = f.s; this.d = f.d;

    // —— 护栏碰撞 ——
    const lim = ROAD_HALF + CURB - 1.05;
    if (Math.abs(f.d) > lim) {
      const side = Math.sign(f.d), over = Math.abs(f.d) - lim;
      this.x -= f.rx * over * side; this.z -= f.rz * over * side;
      const vx = Math.sin(this.va) * this.v, vz = Math.cos(this.va) * this.v;
      const vt = vx * f.tx + vz * f.tz; let vr = vx * f.rx + vz * f.rz;
      if (vr * side > 0) {
        const impact = Math.abs(vr) / (Math.abs(this.v) + 1e-3);
        vr = -vr * .15;
        const nvx = f.tx * vt + f.rx * vr, nvz = f.tz * vt + f.rz * vr;
        const sp = Math.hypot(nvx, nvz) * (1 - .45 * impact);
        this.v = vt >= 0 ? sp : -sp;
        this.va = vt >= 0 ? Math.atan2(nvx, nvz) : Math.atan2(-nvx, -nvz);
        const th = Math.atan2(f.tx, f.tz) + (vt >= 0 ? 0 : Math.PI);
        this.h += angDiff(th, this.h) * Math.min(1, impact * 1.2);
        if (impact > .12 && this.wallT <= 0) { this.emit('wall', { impact, side }); this.wallT = .25; if (impact > .3) this.endDrift(true); }
      }
      t.project(this.x, this.z, this.y, this.hint, this.fr);
      this.s = f.s; this.d = f.d;
    }
    this.wallT -= dt;

    // —— 垂直方向 / 飞跃 ——
    const ground = f.ground;
    if (!this.air) {
      if (ground < this.y - .35 && this.v > 15) {
        this.air = true; this.airTime = 0;
        this.emit('takeoff');
      } else {
        const rate = (ground - this.prevGround) / dt;
        this.vy += (rate - this.vy) * Math.min(1, dt * 30);
        this.y = ground;
      }
    }
    if (this.air) {
      this.airTime += dt;
      this.vy -= GRAVITY * dt; this.y += this.vy * dt;
      if (this.y <= ground) {
        this.y = ground; this.air = false; this.vy = 0;
        if (this.airTime > .35) { this.sinceLand = 0; this.emit('land', { airTime: this.airTime }); }
      }
    }
    this.prevGround = ground;

    // —— 加速带 ——
    if (!this.air) for (const p of t.boostPads) {
      const ds = t.deltaS(p.s, this.s);
      if (ds > 0 && ds < 9 && Math.abs(this.d - p.d) < 3.2) {
        if (!(this.boostT > .8 && this.boostKind >= 1)) this.emit('pad');
        this.startBoost(1, 1.0, V_PAD, 2);
      }
    }

    // —— 进度 / 逆行 ——
    this.total += t.deltaS(prevS, this.s);
    const th = Math.atan2(f.tx, f.tz);
    if (Math.cos(angDiff(this.h, th)) < -.3 && Math.abs(this.v) > 4) this.wrongT += dt; else this.wrongT = 0;
  }

  endDrift(silent = false) {
    if (!this.drifting) return;
    this.drifting = false; this.lastDriftLen = this.driftTime;
    this.sinceDriftEnd = silent ? 99 : 0;
    this.emit('driftEnd');
  }

  resetOnTrack() {
    const s = this.s;
    const d = clamp(this.d, -ROAD_HALF + 3, ROAD_HALF - 3);
    const total = this.total, slots = this.slots, gauge = this.gauge, fin = this.finished, ft = this.finishTime;
    this.place(s, d);
    Object.assign(this, { total, slots, gauge, finished: fin, finishTime: ft });
  }

  get slip() { return angDiff(this.h, this.va); }
  get kmh() { return Math.abs(this.v) * 3.6; }
}
