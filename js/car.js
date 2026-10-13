import * as THREE from 'three';
import { smokeTexture } from './textures.js';

const glowTex = smokeTexture();

// 低多边形跑车：x 宽度，y 高度，z 朝前
export function makeCar(color, { name = '', ai = false } = {}) {
  const root = new THREE.Group();      // 位置 + 航向
  const body = new THREE.Group();      // 俯仰 / 侧倾 / 漂移甩尾
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: .55, roughness: .25, clearcoat: 1, clearcoatRoughness: .08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: .6, metalness: .4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1530, metalness: .9, roughness: .05, clearcoat: 1 });

  const extrude = (pts, width, mat, bevel = .06) => {
    const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) s.lineTo(pts[k][0], pts[k][1]);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
  };

  // 车身侧面轮廓（x=纵向，y=高度）
  body.add(extrude([[-2.1, .28], [2.05, .28], [2.2, .42], [2.12, .62], [1.0, .82], [-1.5, .9], [-2.12, .92], [-2.2, .6]], 1.78, paint));
  // 座舱
  body.add(extrude([[.85, .8], [.15, 1.3], [-.95, 1.33], [-1.55, .9]], 1.42, glass, .05));
  // 侧裙 + 前铲
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.98, .14, 4.2), dark); skirt.position.y = .28; body.add(skirt);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(1.9, .06, .35), dark); lip.position.set(0, .22, 2.15); body.add(lip);
  // 尾翼
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.95, .07, .45), paint); wing.position.set(0, 1.32, -1.95); wing.rotation.x = -.12; body.add(wing);
  for (const x of [-.6, .6]) { const st = new THREE.Mesh(new THREE.BoxGeometry(.08, .4, .2), dark); st.position.set(x, 1.1, -1.9); body.add(st); }
  for (const x of [-.98, .98]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(.05, .28, .6), dark); ep.position.set(x, 1.3, -1.95); body.add(ep); }
  // 车顶条纹
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(.32, .02, 4.0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3 }));
  stripe.position.set(0, .93, -.2); body.add(stripe);

  // 灯
  const headMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1030 });
  for (const x of [-.66, .66]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(.42, .1, .1), headMat); h.position.set(x, .6, 2.12); h.rotation.x = -.5; body.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(.5, .1, .06), tailMat); t.position.set(x, .78, -2.2); body.add(t);
  }
  // 车底霓虹
  const glowMat = new THREE.MeshBasicMaterial({ color, map: glowTex, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6), glowMat); glow.rotation.x = -Math.PI / 2; glow.position.y = .05; root.add(glow);

  // 车轮
  const tireGeo = new THREE.CylinderGeometry(.38, .38, .32, 20); tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(.24, .24, .34, 6); rimGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: .9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 1, roughness: .2 });
  const wheels = [], steer = [];
  for (const [x, z] of [[-.9, 1.33], [.9, 1.33], [-.9, -1.33], [.9, -1.33]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, .38, z);
    const w = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat); tire.castShadow = true;
    w.add(tire, new THREE.Mesh(rimGeo, rimMat));
    pivot.add(w); body.add(pivot);
    wheels.push(w); if (z > 0) steer.push(pivot);
  }

  // 氮气尾焰：内蓝外橙
  const flames = [];
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const outerMat = new THREE.MeshBasicMaterial({ color: 0x2a6bff, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const x of [-.45, .45]) {
    const f = new THREE.Group(); f.position.set(x, .45, -2.25);
    const cg = new THREE.ConeGeometry(.14, 1.2, 10, 1, true); cg.rotateX(-Math.PI / 2); cg.translate(0, 0, -.6);
    const og = new THREE.ConeGeometry(.24, 1.9, 10, 1, true); og.rotateX(-Math.PI / 2); og.translate(0, 0, -.95);
    f.add(new THREE.Mesh(cg, coreMat), new THREE.Mesh(og, outerMat));
    f.visible = false; body.add(f); flames.push(f);
  }

  // 名字牌
  let tag = null;
  if (name) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d'); g.font = '700 36px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(28, 6, 200, 50); g.fillStyle = ai ? '#ffffff' : '#ffe45c'; g.fillText(name, 128, 44);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    tag.scale.set(3.2, .8, 1); tag.position.y = 2.4; tag.renderOrder = 10; root.add(tag);
  }

  return { root, body, wheels, steer, flames, coreMat, outerMat, tailMat, glowMat, glow, tag };
}

// 每帧更新外观
export function animateCar(car, { speed, steer, slip, roll, pitch, boost, braking, dt, t }) {
  for (const w of car.wheels) w.rotation.x += speed * dt / .38;
  for (const p of car.steer) p.rotation.y = steer * .45;
  car.body.rotation.set(pitch, slip, roll, 'YXZ');
  const on = boost > 0;
  for (const f of car.flames) {
    f.visible = on;
    if (on) { const s = .75 + Math.random() * .5; f.scale.set(1, 1, s * (boost > 1 ? 1.5 : 1)); }
  }
  car.outerMat.color.setHex(boost > 1 ? 0x2a6bff : 0xff7a1f);
  car.tailMat.color.setHex(braking ? 0xff5070 : 0xb00018);
  car.glowMat.opacity = .55 + .25 * Math.sin(t * 6);
}
