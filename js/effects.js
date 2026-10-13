import * as THREE from 'three';
import { smokeTexture } from './textures.js';

// 粒子：烟雾 / 火花 / 氮气火星，共用一个 Points 池
export class Particles {
  constructor(scene, max = 2500) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.grow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(max), 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(max), 1));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: smokeTexture() }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
        uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.);
          gl_PointSize = size*scale/-mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA); }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, r, g, b, life, size, grow = 0) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([r, g, b], i * 3);
    this.life[i] = this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow;
  }

  update(dt) {
    const sz = this.geo.attributes.size.array, al = this.geo.attributes.alpha.array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {       // 用最后一个填补
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.vel[i * 3 + k] = this.vel[j * 3 + k]; this.col[i * 3 + k] = this.col[j * 3 + k]; }
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size[i] = this.size[j]; this.grow[i] = this.grow[j];
          i--;
        }
        continue;
      }
      const p = i * 3;
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      this.vel[p] *= .96; this.vel[p + 1] = this.vel[p + 1] * .96 + .4 * dt; this.vel[p + 2] *= .96;
      this.size[i] += this.grow[i] * dt;
      const k = this.life[i] / this.maxLife[i];
      sz[i] = this.size[i]; al[i] = Math.min(1, k * 1.6);
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = this.geo.attributes.alpha.needsUpdate = true;
  }
}

// 漂移胎痕：环形缓冲的四边形条带
export class SkidMarks {
  constructor(scene, max = 3000) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 4 * 3);
    const idx = [];
    for (let k = 0; k < max; k++) { const o = k * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.last = new Map();
  }

  // key 区分不同轮子；连续调用会连成条带
  add(key, x, y, z, rx, rz, w = .17) {
    const prev = this.last.get(key);
    const cur = [x - rx * w, y + .04, z - rz * w, x + rx * w, y + .04, z + rz * w];
    if (prev) {
      const o = this.i * 12;
      this.pos.set(prev, o); this.pos.set(cur, o + 6);
      this.i = (this.i + 1) % this.max;
      this.geo.attributes.position.needsUpdate = true;
    }
    this.last.set(key, cur);
  }

  cut(key) { this.last.delete(key); }
}

// 2D 速度线覆盖层
export class SpeedLines {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.lines = Array.from({ length: 90 }, () => this.spawn({}));
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() { this.c.width = innerWidth; this.c.height = innerHeight; }
  spawn(l) { l.a = Math.random() * Math.PI * 2; l.r = .15 + Math.random() * .4; l.len = .05 + Math.random() * .15; l.sp = .6 + Math.random(); return l; }
  draw(intensity, dt, boostColor) {
    const g = this.g, w = this.c.width, h = this.c.height;
    g.clearRect(0, 0, w, h);
    if (intensity <= .02) return;
    const cx = w / 2, cy = h * .45, R = Math.hypot(w, h) / 2;
    g.lineCap = 'round';
    for (const l of this.lines) {
      l.r += l.sp * dt * (1 + intensity * 2);
      if (l.r > 1.1) this.spawn(l);
      const r0 = l.r * R, r1 = (l.r + l.len * intensity) * R;
      const ca = Math.cos(l.a), sa = Math.sin(l.a);
      g.strokeStyle = boostColor; g.globalAlpha = Math.min(1, intensity) * Math.min(1, l.r * 2) * .55;
      g.lineWidth = 1 + l.r * 3 * intensity;
      g.beginPath(); g.moveTo(cx + ca * r0, cy + sa * r0); g.lineTo(cx + ca * r1, cy + sa * r1); g.stroke();
    }
    // 边缘暗角
    const gr = g.createRadialGradient(cx, cy, R * .45, cx, cy, R);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,10,40,${.5 * Math.min(1, intensity)})`);
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
}
