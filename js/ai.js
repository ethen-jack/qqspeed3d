import { angDiff } from './physics.js';
import { ROAD_HALF } from './track.js';

// AI 车手：沿赛道追踪目标点，弯道漂移、出弯小喷、有氮气就用
export class AIDriver {
  constructor(veh, skill, lane) {
    this.veh = veh; this.skill = skill; this.lane = lane;
    this.prevUp = false; this.jetPlan = -1; this.nitroCd = 2 + Math.random() * 3;
    this.f = {};
  }

  input(dt, player) {
    const v = this.veh, t = v.track;
    const look = 10 + Math.abs(v.v) * .45;
    const f = t.frameAt(v.s + look, this.f);
    // 内线：根据前方曲率靠弯心
    const ahead = t.frameAt(v.s + look * 1.6, {}).curv;
    const targetD = Math.max(-ROAD_HALF + 3, Math.min(ROAD_HALF - 3, this.lane + ahead * 160));
    const tx = f.x + f.rx * targetD, tz = f.z + f.rz * targetD;
    const want = Math.atan2(tx - v.x, tz - v.z);
    const err = angDiff(want, v.h);
    let steer = Math.max(-1, Math.min(1, -err * 2.6));

    // 弯道强度
    let maxC = 0;
    for (let k = 10; k < 60; k += 6) maxC = Math.max(maxC, Math.abs(t.frameAt(v.s + k, this.f).curv));
    let drift = false;
    if (!v.drifting && maxC > .022 && v.v > 30 && Math.abs(err) > .08) drift = true;
    if (v.drifting) drift = Math.abs(err) > .12 && Math.sign(-err) === v.driftDir;
    if (v.drifting && !drift) steer = 0;

    // 橡皮筋：离玩家太远会加/减速
    const gap = player ? player.total - v.total : 0;
    let up = true, down = false;
    const brakeC = .045 - this.skill * .01;
    if (maxC > brakeC && v.v > 40 && !v.drifting) { up = false; if (maxC > brakeC * 1.4) down = true; }
    if (gap < -120 && this.skill < 1) up = Math.random() < .7;

    // 小喷：漂移结束后按一下 ↑
    let upEdge = false;
    if (!v.drifting && v.sinceDriftEnd < .3 && this.jetPlan < 0) this.jetPlan = .08 + (1 - this.skill) * .25;
    if (this.jetPlan >= 0) { this.jetPlan -= dt; up = false; if (this.jetPlan < 0) { up = true; upEdge = Math.random() < .55 + this.skill * .4; } }
    if (!this.prevUp && up && v.sinceLand < .2) upEdge = true;
    this.prevUp = up;

    let nitroEdge = false;
    this.nitroCd -= dt;
    if (v.slots > 0 && this.nitroCd < 0 && maxC < .012 && !v.drifting) {
      nitroEdge = true; this.nitroCd = 3 + Math.random() * 4 + (gap < -60 ? 4 : 0);
    }
    return { steer, up, down, drift, upEdge, nitroEdge };
  }
}
