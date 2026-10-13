// 全部音效用 WebAudio 实时合成，无需外部音频文件
export class Audio {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = .55; this.master.connect(C.destination);
    const comp = C.createDynamicsCompressor(); comp.connect(this.master); this.out = comp;

    // 引擎：两路锯齿波 + 低通
    this.engGain = C.createGain(); this.engGain.gain.value = 0;
    this.engFilter = C.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 900; this.engFilter.Q.value = 4;
    this.o1 = C.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = C.createOscillator(); this.o2.type = 'square';
    const g2 = C.createGain(); g2.gain.value = .35;
    this.o1.connect(this.engFilter); this.o2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.out);
    this.o1.start(); this.o2.start();

    // 噪声源
    const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const mkNoise = (type, f, q) => {
      const src = C.createBufferSource(); src.buffer = buf; src.loop = true;
      const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = C.createGain(); g.gain.value = 0;
      src.connect(fl).connect(g).connect(this.out); src.start();
      return { g, fl };
    };
    this.skid = mkNoise('bandpass', 2200, 6);    // 漂移胎噪
    this.wind = mkNoise('lowpass', 500, .7);     // 风噪
    this.jet = mkNoise('bandpass', 700, 1.2);    // 喷射轰鸣

    this.musicOn = false; this.nextBeat = 0; this.beat = 0;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : .55; }

  update(veh, racing) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const sp = Math.abs(veh.v) / 56;
    // 模拟换挡：速度区间内转速上升
    const gear = Math.min(4, Math.floor(sp * 5));
    const rpm = .25 + (sp * 5 - gear) * .55 + gear * .04;
    const f = 55 + rpm * 150 + (veh.boostT > 0 ? 25 : 0);
    this.o1.frequency.setTargetAtTime(f, t, .05);
    this.o2.frequency.setTargetAtTime(f * .5, t, .05);
    this.engFilter.frequency.setTargetAtTime(500 + rpm * 1800, t, .05);
    this.engGain.gain.setTargetAtTime(racing ? .12 + .1 * Math.min(1, veh.accel / 20 + .3) : .06, t, .1);
    this.skid.g.gain.setTargetAtTime(veh.drifting && !veh.air ? .16 + .1 * Math.min(1, Math.abs(veh.slip)) : 0, t, .04);
    this.skid.fl.frequency.setTargetAtTime(1800 + sp * 900, t, .05);
    this.wind.g.gain.setTargetAtTime(sp * sp * .18, t, .1);
    this.jet.g.gain.setTargetAtTime(veh.boostT > 0 ? (veh.boostKind === 2 ? .35 : .2) : 0, t, .06);
    if (this.musicOn) this.music();
  }

  tone(freq, dur, type = 'sine', vol = .3, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime + delay;
    const o = C.createOscillator(), g = C.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + .02);
  }

  noiseHit(dur, f, vol = .4, type = 'lowpass') {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const src = C.createBufferSource(); src.buffer = this.noiseBuf;
    const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
    const g = C.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(fl).connect(g).connect(this.out); src.start(t); src.stop(t + dur);
  }

  sfx(name) {
    switch (name) {
      case 'count': this.tone(660, .25, 'square', .18); break;
      case 'go': this.tone(1320, .6, 'square', .2); this.tone(990, .6, 'square', .12); break;
      case 'smallJet': this.noiseHit(.35, 1200, .5, 'bandpass'); this.tone(300, .3, 'sawtooth', .12, 2.5); break;
      case 'doubleJet': this.noiseHit(.45, 1600, .6, 'bandpass'); this.tone(420, .35, 'sawtooth', .14, 2.5); break;
      case 'nitro': this.noiseHit(1.2, 900, .7); this.tone(160, 1, 'sawtooth', .2, 3); break;
      case 'gainNitro': this.tone(880, .12, 'triangle', .25); this.tone(1320, .2, 'triangle', .25, 1, .1); break;
      case 'pad': this.tone(500, .3, 'triangle', .2, 2); break;
      case 'wall': this.noiseHit(.25, 400, .7); this.tone(90, .2, 'square', .2, .5); break;
      case 'land': this.noiseHit(.2, 300, .5); break;
      case 'lap': [784, 988, 1175].forEach((f, i) => this.tone(f, .25, 'triangle', .25, 1, i * .1)); break;
      case 'finish': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, .3, 'square', .14, 1, i * .13)); break;
      case 'click': this.tone(1000, .05, 'square', .1); break;
    }
  }

  // 简单的电子背景乐（贝斯 + 军鼓 + 琶音）
  music() {
    const C = this.ctx, t = C.currentTime;
    if (this.nextBeat < t) this.nextBeat = t + .05;
    const bpm = 128, step = 60 / bpm / 2;
    const bass = [45, 45, 57, 45, 43, 43, 55, 43, 41, 41, 53, 41, 43, 43, 55, 47];
    const arp = [69, 72, 76, 72, 67, 71, 74, 71, 65, 69, 72, 69, 67, 71, 74, 79];
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    while (this.nextBeat < t + .2) {
      const b = this.beat % 16, at = this.nextBeat - t;
      this.tone(mtof(bass[b]), step * .9, 'sawtooth', .07, 1, at);
      if (b % 2 === 0) this.tone(mtof(arp[(this.beat >> 1) % 16] + 12), step * .7, 'triangle', .035, 1, at);
      if (b % 4 === 0) this.tone(110, .18, 'sine', .25, .3, at);           // 底鼓
      if (b % 8 === 4) this.later(at, () => this.noiseHit(.12, 3000, .12, 'highpass'));
      this.nextBeat += step; this.beat++;
    }
  }

  later(sec, fn) { setTimeout(fn, sec * 1000); }
}
