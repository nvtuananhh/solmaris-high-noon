// city.js — builds Solmaris: road grid, whitewashed old town, glass downtown,
// marina with yachts, beachfront, cliffside coast highway and the lighthouse.
// Exports the colliders (AABBs) everything else collides against, the road
// network traffic follows, and the activity anchor points (garage, ramps...).
// Repeated small parts (road dashes, windows, lamps, palms) are InstancedMeshes
// so the scene stays fast even on software rendering.
const THREE = window.THREE;
import { CFG, clamp } from './config.js';
import { makeRng, pick, range } from './random.js';

export class City {
  constructor(scene, seed = 1) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.colliders = [];   // {minX,maxX,minZ,maxZ}
    this.roadLines = [];   // road centreline coords, both axes
    this.palms = [];
    this.tokenSpots = [];
    this.ramps = [];
    this._inst = { dash: [], win: [], pole: [], bulb: [], trunk: [], leaf: [] };
    this.build();
    this._finishInstancing();
  }
  addCollider(x, z, hx, hz) {
    this.colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
  }
  // Push a circle (x,z,r) out of every AABB it overlaps. Returns corrected {x,z,hit}.
  collide(x, z, r) {
    let hit = false;
    for (const c of this.colliders) {
      const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (r - d);
          x += (dx / d) * push; z += (dz / d) * push;
        } else {
          // centre inside the box: shove out along the smallest penetration axis
          const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
          else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
        }
      }
    }
    return { x, z, hit };
  }
  onRoad(x, z) {
    const w = CFG.roadWidth / 2 + 1;
    for (const l of this.roadLines) {
      if (Math.abs(x - l) < w || Math.abs(z - l) < w) return true;
    }
    return false;
  }
  _instanced(list, geo, mat, castShadow = false) {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const d = new THREE.Object3D();
    list.forEach((t, i) => {
      d.position.set(t.x, t.y, t.z);
      d.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
      d.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.castShadow = castShadow;
    m.instanceMatrix.needsUpdate = true;
    this.scene.add(m);
  }
  _finishInstancing() {
    const I = this._inst;
    this._instanced(I.dash, new THREE.PlaneGeometry(0.5, 5),
      new THREE.MeshBasicMaterial({ color: 0xf2e9c8 }));
    this._instanced(I.win, new THREE.BoxGeometry(1.6, 1.8, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x2c3e50 }));
    this._instanced(I.pole, new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x2c2c34 }));
    this._instanced(I.bulb, new THREE.SphereGeometry(0.4, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
    this._instanced(I.trunk, new THREE.CylinderGeometry(0.28, 0.42, 6, 6),
      new THREE.MeshLambertMaterial({ color: CFG.colors.trunk }));
    this._instanced(I.leaf, new THREE.ConeGeometry(2.6, 2.2, 6),
      new THREE.MeshLambertMaterial({ color: CFG.colors.palm }), true);
  }
  build() {
    const rng = this.rng, C = CFG.colors;
    const s = this.scene;
    // --- sky, sun, light ---
    s.background = new THREE.Color(C.sky);
    s.fog = new THREE.Fog(0x9fd0ea, 220, 620);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xe8d9b0, 0.95);
    s.add(hemi);
    const sun = new THREE.DirectionalLight(C.sun, 2.4);
    sun.position.set(90, 160, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
    sun.shadow.camera.far = 500; sun.shadow.bias = -0.0004;
    s.add(sun); s.add(sun.target);
    this.sun = sun;
    // --- ground, beach, sea ---
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshLambertMaterial({ color: 0xbfb49a }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -40);
    ground.receiveShadow = true; s.add(ground);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 60),
      new THREE.MeshLambertMaterial({ color: C.sand }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, 205);
    sand.receiveShadow = true; s.add(sand);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 420),
      new THREE.MeshLambertMaterial({ color: C.sea }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, C.seaLevel, 430);
    s.add(sea);
    const seaWest = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 900),
      new THREE.MeshLambertMaterial({ color: C.deepSea }));
    seaWest.rotation.x = -Math.PI / 2; seaWest.position.set(-420, C.seaLevel, 0);
    s.add(seaWest);
    // --- roads ---
    const roadMat = new THREE.MeshLambertMaterial({ color: C.road });
    const walkMat = new THREE.MeshLambertMaterial({ color: C.sidewalk });
    for (let i = -3; i <= 3; i++) this.roadLines.push(i * CFG.roadSpacing);
    for (const l of this.roadLines) {
      for (const [w, h, mat, y] of [
        [CFG.roadWidth, 400, roadMat, 0.06],
        [CFG.roadWidth + 7, 400, walkMat, 0.03],
      ]) {
        const a = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        a.rotation.x = -Math.PI / 2; a.position.set(l, y, 0); a.receiveShadow = true; s.add(a);
        const b = new THREE.Mesh(new THREE.PlaneGeometry(h, w), mat);
        b.rotation.x = -Math.PI / 2; b.position.set(0, y, l); b.receiveShadow = true; s.add(b);
      }
      // dashed centre lines (instanced later)
      for (let t = -190; t < 190; t += 12) {
        this._inst.dash.push({ x: l, y: 0.09, z: t, rx: -Math.PI / 2 });
        this._inst.dash.push({ x: t, y: 0.09, z: l, rx: -Math.PI / 2, rz: Math.PI / 2 });
      }
    }
    // coast highway along the west cliff + beachfront boulevard (z = 180)
    const coast = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roadWidth, 400), roadMat);
    coast.rotation.x = -Math.PI / 2; coast.position.set(-198, 0.06, 0); coast.receiveShadow = true; s.add(coast);
    const blvd = new THREE.Mesh(new THREE.PlaneGeometry(400, CFG.roadWidth), roadMat);
    blvd.rotation.x = -Math.PI / 2; blvd.position.set(0, 0.06, 180); blvd.receiveShadow = true; s.add(blvd);

    // --- buildings, block by block ---
    const wallCols = [C.wallWhite, C.wallCream, C.wallTerra, C.wallBlue, 0xf0e6d2, 0xe6cfae];
    const roofCols = [C.roofTerra, C.roofSlate, 0xb8563a, 0x7d8a99];
    const glassMat = new THREE.MeshLambertMaterial({ color: C.glass, emissive: 0x2a4a5a });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofGeo = new THREE.ConeGeometry(1, 1, 4);
    for (let bx = -3; bx <= 2; bx++) {
      for (let bz = -3; bz <= 2; bz++) {
        const cx = bx * 60 + 30, cz = bz * 60 + 30;
        // keep the marina corner and the central plaza open
        if (cx > 100 && cz > 100) continue;
        if (Math.abs(cx) < 12 && Math.abs(cz) < 12) continue; // old town square
        const downtown = Math.abs(cx) < 70 && cz < -60;
        const n = downtown ? 1 : 2 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const w = downtown ? range(rng, 16, 22) : range(rng, 12, 20);
          const d = downtown ? range(rng, 16, 22) : range(rng, 12, 18);
          const h = downtown ? range(rng, 34, 58) : range(rng, 7, 16);
          const x = cx + range(rng, -9, 9), z = cz + range(rng, -9, 9);
          const mat = downtown ? glassMat : new THREE.MeshLambertMaterial({ color: pick(rng, wallCols) });
          const b = new THREE.Mesh(boxGeo, mat);
          b.scale.set(w, h, d); b.position.set(x, h / 2, z);
          b.castShadow = true; b.receiveShadow = true; s.add(b);
          if (!downtown && rng() < 0.7) {
            const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: pick(rng, roofCols) }));
            roof.scale.set(w * 0.75, 3.2, d * 0.75); roof.position.set(x, h + 1.6, z);
            roof.rotation.y = Math.PI / 4; roof.castShadow = true; s.add(roof);
          }
          // windows: dark insets on the street face (instanced later)
          const rows = Math.max(1, Math.floor(h / 4));
          for (let r = 0; r < rows; r++) {
            for (let cI = -1; cI <= 1; cI++) {
              this._inst.win.push({ x: x + cI * (w / 3.4), y: 3 + r * 4, z: z + d / 2 + 0.05 });
            }
          }
          this.addCollider(x, z, w / 2 + 0.4, d / 2 + 0.4);
        }
      }
    }
    // --- old town square: fountain + market stalls ---
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.5, 1.2, 12),
      new THREE.MeshLambertMaterial({ color: 0xdfe8ea }));
    fountain.position.set(0, 0.6, 0); fountain.castShadow = true; s.add(fountain);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.4, 12),
      new THREE.MeshLambertMaterial({ color: 0x3fa7d6 }));
    water.position.set(0, 1.2, 0); s.add(water);
    this.addCollider(0, 0, 5.6, 5.6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const stall = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: pick(rng, [0xe86a5a, 0x5aa86a, 0xe8b13c, 0x6a8ad4]) }));
      stall.scale.set(4, 2.6, 3); stall.position.set(Math.cos(a) * 14, 1.3, Math.sin(a) * 14);
      stall.castShadow = true; s.add(stall);
      this.addCollider(stall.position.x, stall.position.z, 2.2, 1.7);
    }
    // --- marina: docks + yachts (south-east corner) ---
    const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    for (let i = 0; i < 3; i++) {
      const dock = new THREE.Mesh(boxGeo, dockMat);
      dock.scale.set(3, 0.6, 42); dock.position.set(120 + i * 24, 0.7, 190);
      dock.castShadow = true; s.add(dock);
      const hull = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xf8f8f2 }));
      hull.scale.set(6, 2.2, 16); hull.position.set(120 + i * 24 + 7, 1.1, 196);
      hull.castShadow = true; s.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 12, 6),
        new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      mast.position.set(120 + i * 24 + 7, 8, 196); s.add(mast);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(4, 8),
        new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      sail.position.set(120 + i * 24 + 7, 7, 199); s.add(sail);
    }
    this.marinaLot = { x: 150, z: 150 };
    // --- lighthouse on the south-west cliff ---
    const lh = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 26, 12),
      new THREE.MeshLambertMaterial({ color: 0xf5f0e0 }));
    tower.position.y = 13; tower.castShadow = true; lh.add(tower);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 3, 12),
      new THREE.MeshLambertMaterial({ color: 0xd94f3d }));
    band.position.y = 18; lh.add(band);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.4, 12),
      new THREE.MeshLambertMaterial({ color: 0x333333, emissive: 0xffe9a0 }));
    lamp.position.y = 27.5; lh.add(lamp);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.2, 26, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    beam.rotation.z = Math.PI / 2; beam.position.set(14, 27.5, 0); lh.add(beam);
    lh.position.set(-205, 0, 205);
    s.add(lh);
    this.lighthouse = new THREE.Vector3(-198, 0, 198);
    const cliff = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x9a8a72 }));
    cliff.scale.set(30, 8, 30); cliff.position.set(-205, 4, 205); cliff.castShadow = true; s.add(cliff);
    this.addCollider(-205, 205, 15, 15);
    // --- palms along the boulevard (instanced) + beach umbrellas ---
    for (let i = 0; i < 26; i++) {
      const x = -170 + i * 14 + range(rng, -3, 3);
      const z = i % 2 === 0 ? 171 : 189;
      this._inst.trunk.push({ x, y: 3, z });
      this._inst.leaf.push({ x, y: 6.8, z });
      this.palms.push({ x, z });
    }
    const umbCols = [0xe86a5a, 0x4fa8d8, 0xf2c14e, 0x7fc96a];
    for (let i = 0; i < 8; i++) {
      const x = -150 + i * 40 + range(rng, -6, 6);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 8),
        new THREE.MeshLambertMaterial({ color: pick(rng, umbCols) }));
      umb.position.set(x, 2.6, 198); umb.castShadow = true; s.add(umb);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 5),
        new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(x, 1.3, 198); s.add(pole);
    }
    // --- street lamps (instanced) ---
    for (let i = -3; i <= 3; i++) {
      for (const zz of [-150, -90, -30, 30, 90, 150]) {
        this._inst.pole.push({ x: i * 60 + 7, y: 3.25, z: zz });
        this._inst.bulb.push({ x: i * 60 + 7, y: 6.6, z: zz });
      }
    }
    // --- stunt ramps (plywood wedges) ---
    const rampMat = new THREE.MeshLambertMaterial({ color: 0xd8a24a });
    const rampSpots = [
      { x: -60, z: 176, rotY: 0 }, { x: 90, z: -176, rotY: Math.PI }, { x: -176, z: -30, rotY: Math.PI / 2 },
    ];
    for (const r of rampSpots) {
      const g = new THREE.Group();
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 9), rampMat);
      wedge.rotation.x = -0.42; wedge.position.set(0, 1.6, 0); wedge.castShadow = true; g.add(wedge);
      // solid support under the high end so the ramp reads as a wedge, not a plank
      const support = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 0.8), rampMat);
      support.position.set(0, 1.2, -4.1); support.castShadow = true; g.add(support);
      g.position.set(r.x, 0, r.z); g.rotation.y = r.rotY; s.add(g);
      this.ramps.push({ x: r.x, z: r.z, rotY: r.rotY });
    }
    // --- sun-token spots (12): rooftops, beach, marina, lighthouse path ---
    this.tokenSpots = [
      [-30, -30], [30, -90], [90, -30], [-90, 30], [30, 90], [90, 150],
      [-150, 150], [-60, 176], [150, 120], [-198, 120], [0, 176], [-120, -150],
    ];
    // --- Fresh Coat respray garage + Hillside safehouse anchors ---
    this.garage = { x: -90, z: 120, rotY: 0 };
    const gar = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x3a6ea8 }));
    gar.scale.set(16, 7, 12); gar.position.set(-90, 3.5, 126); gar.castShadow = true; s.add(gar);
    const garSign = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffd23c }));
    garSign.scale.set(12, 1.6, 0.4); garSign.position.set(-90, 7.6, 119.8); s.add(garSign);
    this.addCollider(-90, 126, 8.4, 6.4);
    this.safehouse = { x: -150, z: 30 };
    const sh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xf5efe2 }));
    sh.scale.set(12, 6, 10); sh.position.set(-150, 3, 30); sh.castShadow = true; s.add(sh);
    this.addCollider(-150, 30, 6.4, 5.4);
    // --- traffic routes: rectangular loops around blocks, both directions ---
    this.routes = [];
    for (const l of [-120, -60, 0, 60, 120]) {
      this.routes.push(this._loop(l, l));
      this.routes.push(this._loop(l + 30, l - 30));
    }
    // coast highway loop
    this.routes.push([{ x: -198, z: -180 }, { x: -198, z: 180 }, { x: 180, z: 180 }, { x: 180, z: -180 }]);
  }
  _loop(a, b) {
    const h = 24;
    return [
      { x: a - h, z: b - h }, { x: a + h, z: b - h },
      { x: a + h, z: b + h }, { x: a - h, z: b + h },
    ];
  }
}
