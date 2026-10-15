/**
 * planet-scene.js — 官网首页 3D 卡通世界星球
 * 由 pet-smart-app 的 HomeScene（three.js r186）演化而来：
 * 程序化生成「童话世界星球」—— 山脉雪顶、海洋湖泊河流、草地树木、漂浮云朵，
 * 保留 APP 原版的猫咪行为与饮水舱，整体缓慢自转 + 悬浮。
 */
import * as THREE from './vendor/three.module.js';

const PLANET_RADIUS = 2.4;
const UP_VECTOR = new THREE.Vector3(0, 1, 0);

const CAT_COLORS = ['#e08a4e', '#7f9cf5', '#b47ad4', '#5bb5a0'];

const CAT_START = [
  [0.2, 1.25],
  [2.2, 1.7],
  [3.8, 1.1],
  [4.9, 1.9],
];

// 饮水舱在星球上的位置（猫咪的饮水点）
const DRINK_THETA = 1.0;
const DRINK_PHI = 1.35;

const CAT_COUNT = 3;
const TREE_COUNT = 44; // 原 220 棵的 20%
const FOREST_COUNT = 6; // 树木成团分布的「森林团」数量

// 猫窝 / 逗猫棒位置（初始化时在平缓草地上随机寻找）
let HOUSE_SPOT = null;
let WAND_SPOT = null;

// ---------------- 地形参数（改这里调世界观） ----------------
const HILL_AMP = 0.5; // 丘陵起伏幅度
const MOUNTAIN_AMP = 0.45; // 山脉高度
const LAND_BIAS = 0.3; // 陆地抬升（保证没有海洋，只有河流低洼）
const SNOW_LEVEL = 0.42; // 雪线
const ROCK_LEVEL = 0.3; // 岩石线

// 河流（起点 θ,φ → 终点 θ,φ，蜿蜒穿过大陆）
const RIVERS = [
  { a: [3.7, 0.9], b: [2.9, 1.6], wobble: 0.16 },
  { a: [5.4, 1.5], b: [0.4, 1.05], wobble: 0.14 },
];

const RIVER_WIDTH = 0.09;

// ---------------- 调色板 ----------------
const C_VALLEY = new THREE.Color('#4c9c4a');
const C_GRASS = new THREE.Color('#6cb45a');
const C_GRASS_LIGHT = new THREE.Color('#87c96f');
const C_ROCK = new THREE.Color('#968d7e');
const C_SNOW = new THREE.Color('#f7f9fa');
const C_RIVER_EDGE = new THREE.Color('#7fe0f0');
const C_RIVER_DEEP = new THREE.Color('#2f9ec4');
const _c = new THREE.Color();

const mount = document.getElementById('heroPlanet');
if (mount) {
  initPlanetScene(mount);
}

// ================= 地形 / 噪声 =================

function hash3(ix, iy, iz) {
  // 标准整数哈希：按轴乘以大素数混合 + 雪崩，小整数坐标下也均匀
  let h =
    Math.imul(ix, 0x27d4eb2d) ^
    Math.imul(iy, 0x165667b1) ^
    Math.imul(iz, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h ^ (h >>> 7), 0x297a2d39);
  h ^= h >>> 14;
  return (h >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);
  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

function fbm(x, y, z, octaves) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, z * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function angularDist(theta1, phi1, theta2, phi2) {
  let dTheta = theta1 - theta2;
  dTheta = ((dTheta % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return Math.hypot(dTheta * Math.sin(phi1), phi1 - phi2);
}

function riverMask(theta, phi) {
  let best = 1;
  for (const river of RIVERS) {
    const [aT, aP] = river.a;
    const [bT, bP] = river.b;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const rt = aT + (bT - aT) * t + river.wobble * Math.sin(t * 6);
      const rp = aP + (bP - aP) * t + river.wobble * Math.sin(t * 5 + 2);
      const d = angularDist(theta, phi, rt, rp);
      if (d < best) best = d;
    }
  }
  return 1 - smoothstep(0.02, RIVER_WIDTH, best);
}

/** 星球表面高度（以半径 2.4 为基准，陆地为主，仅河流低洼低于 0） */
function terrainHeight(theta, phi) {
  const x = Math.sin(phi) * Math.cos(theta);
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);

  const hills = fbm(x * 1.6, y * 1.6, z * 1.6, 3) - 0.5;
  const ridge = fbm(x * 3.2, y * 3.2, z * 3.2, 2) - 0.38;
  const mountainMask = smoothstep(0.26, 0.42, fbm(x * 1.3, y * 1.3, z * 1.3, 2));
  const mountains = Math.max(0, ridge) * mountainMask * MOUNTAIN_AMP;

  let h = hills * HILL_AMP + mountains + LAND_BIAS;

  // 微地形细节：高频小幅度噪声，让表面更细腻
  const detail = fbm(x * 6.4, y * 6.4, z * 6.4, 2) - 0.5;
  h += detail * 0.05;

  // 河流挖出低洼（蓝色彩带）
  const river = riverMask(theta, phi);
  h -= river * 0.14;

  return h;
}

// ================= 3D 构建 =================

function initPlanetScene(mount) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.8, 8.5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // 胶片级色调映射：让色彩更浓郁细腻
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  mount.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x6b5d4a, 0.42));
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.45);
  sun.position.set(8, 6, 5);
  scene.add(sun);
  // 暖色逆光：勾出星球边缘轮廓，更有「渲染感」
  const rim = new THREE.DirectionalLight(0xffd9a0, 0.4);
  rim.position.set(-7, 2, -6);
  scene.add(rim);

  // 星球世界：星野 + 地形星球 + 树木 + 饮水舱 + 猫咪，整体自转与悬浮
  const world = new THREE.Group();
  world.add(createStars());
  world.add(createPlanet());
  world.add(createTrees());
  world.add(createFlowers());
  world.add(createRocks());
  // 大气辉光：星球外圈一圈柔和光晕（BackSide 球壳，高于最高山体）
  world.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS + 0.6, 48, 32),
      new THREE.MeshBasicMaterial({
        color: 0x8fd8e8,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
      }),
    ),
  );
  scene.add(world);

  // 饮水舱（第一枚硅基探针）——猫咪的饮水点，贴着地形放置
  const water = createWaterDevice();
  placeOnPlanet(water, DRINK_THETA, DRINK_PHI);
  world.add(water);

  // 猫咪
  const cats = [];
  for (let i = 0; i < CAT_COUNT; i++) {
    const cat = createCat(CAT_COLORS[i % CAT_COLORS.length], i);
    cats.push(cat);
    world.add(cat.group);
  }

  // 猫窝 + 逗猫棒：随机落在平缓草地上；猫咪会去猫窝睡觉、去逗猫棒玩耍
  HOUSE_SPOT = findLandSpot(0.08, 0.32);
  WAND_SPOT = findLandSpot(0.08, 0.3);
  const catHouse = createCatHouse();
  placeOnPlanet(catHouse, HOUSE_SPOT.theta, HOUSE_SPOT.phi);
  world.add(catHouse);
  const teaser = createTeaserWand();
  placeOnPlanet(teaser, WAND_SPOT.theta, WAND_SPOT.phi);
  teaser.rotateZ(0.35);
  world.add(teaser);

  const resize = () => {
    const width = mount.clientWidth || 320;
    const height = mount.clientHeight || 480;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();

  if (reduceMotion) {
    world.rotation.y = 0.6;
    cats.forEach((cat) => cat.group.rotateY(cat.index * 0.5));
    renderer.render(scene, camera);
    return;
  }

  let lastTime = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    const time = now / 1000;
    world.rotation.y += dt * 0.12;
    world.position.y = Math.sin(time * 0.5) * 0.14;

    cats.forEach((cat) => updateCat(cat, dt, time));

    renderer.render(scene, camera);
  });
}

function createStars() {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 30 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xfff3e0,
    size: 0.09,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
  });
  return new THREE.Points(geometry, material);
}

function createPlanet() {
  const geometry = new THREE.SphereGeometry(PLANET_RADIUS, 72, 48);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const dir = new THREE.Vector3(x, y, z).normalize();
    const phi = Math.acos(dir.y);
    const theta = Math.atan2(dir.z, dir.x);

    const h = terrainHeight(theta, phi);
    const r = PLANET_RADIUS + h;
    position.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);

    // —— 顶点上色（细腻版：平滑海拔过渡 + 草地斑驳 + 坡度阴影 + 河流渐变）——
    const tValley = 1 - smoothstep(0.05, 0.15, h);
    const tRock = smoothstep(ROCK_LEVEL, ROCK_LEVEL + 0.1, h);
    const tSnow = smoothstep(SNOW_LEVEL, SNOW_LEVEL + 0.08, h);
    _c.copy(C_VALLEY).lerp(C_GRASS, 1 - tValley);
    _c.lerp(C_ROCK, tRock);
    _c.lerp(C_SNOW, tSnow);

    // 草地斑驳：仅在草地区间用高频噪声做深浅色斑
    const inGrass = (1 - tValley) * (1 - tRock);
    const patch = valueNoise(dir.x * 9, dir.y * 9, dir.z * 9);
    _c.lerp(C_GRASS_LIGHT, patch * inGrass * 0.4);

    // 坡度阴影：陡坡 / 谷地微暗，增强立体感（简易环境光遮蔽）
    const eps = 0.03;
    const slope =
      Math.abs(terrainHeight(theta + eps, phi) - h) +
      Math.abs(terrainHeight(theta, phi + eps) - h);
    _c.multiplyScalar(1 - Math.min(0.22, slope * 0.85));

    // 河流渐变：边缘浅蓝 → 中心深蓝
    const river = riverMask(theta, phi);
    if (river > 0.05) {
      _c.lerp(C_RIVER_EDGE, smoothstep(0.05, 0.5, river));
      _c.lerp(C_RIVER_DEEP, smoothstep(0.5, 0.95, river));
    }

    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
    metalness: 0.05,
  });
  return new THREE.Mesh(geometry, material);
}

/** 在平缓草地上随机找一个落点（用于森林团 / 猫窝 / 逗猫棒） */
function findLandSpot(minH = 0.08, maxH = ROCK_LEVEL) {
  for (let i = 0; i < 80; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.3 + Math.random() * (Math.PI - 0.6);
    const h = terrainHeight(theta, phi);
    if (h > minH && h < maxH) return { theta, phi, h };
  }
  return { theta: 2.0, phi: 1.2, h: 0.15 };
}

function createTrees() {
  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.055, 0.24, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 1 });
  const leafGeo = new THREE.SphereGeometry(0.17, 10, 8);
  leafGeo.translate(0, 0.16, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f46, roughness: 0.9, flatShading: true });
  const leafTopGeo = new THREE.SphereGeometry(0.11, 8, 6);
  leafTopGeo.translate(0, 0.42, 0);

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, TREE_COUNT);
  const leavesTop = new THREE.InstancedMesh(leafTopGeo, leafMat, TREE_COUNT);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const group = new THREE.Group();

  // 森林团中心：在草地上随机选点，树围绕中心聚集
  const forests = [];
  for (let i = 0; i < FOREST_COUNT; i++) {
    const spot = findLandSpot();
    forests.push({ theta: spot.theta, phi: spot.phi, radius: 0.22 + Math.random() * 0.18 });
  }

  let placed = 0;
  let attempts = 0;
  while (placed < TREE_COUNT && attempts < TREE_COUNT * 60) {
    attempts++;
    const f = forests[Math.floor(Math.random() * forests.length)];
    const ang = Math.random() * Math.PI * 2;
    const dist = f.radius * Math.pow(Math.random(), 0.55); // 向中心聚集
    const theta = f.theta + dist * Math.cos(ang);
    const phi = Math.min(Math.PI - 0.12, Math.max(0.12, f.phi + dist * Math.sin(ang)));
    const h = terrainHeight(theta, phi);
    if (h < 0.08 || h > ROCK_LEVEL) continue; // 只在草地上
    // 坡度过滤：避免长在悬崖上
    const d = 0.05;
    const hx = terrainHeight(theta + d, phi);
    const hy = terrainHeight(theta, phi + d);
    if (Math.abs(hx - h) + Math.abs(hy - h) > 0.12) continue;

    dir.set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    const r = PLANET_RADIUS + h + 0.16;
    position.copy(dir).multiplyScalar(r);
    quaternion.setFromUnitVectors(UP_VECTOR, dir);
    const s = 0.75 + Math.random() * 0.75;
    scale.set(s, s, s);
    matrix.compose(position, quaternion, scale);

    trunks.setMatrixAt(placed, matrix);
    leaves.setMatrixAt(placed, matrix);
    leavesTop.setMatrixAt(placed, matrix);
    placed++;
  }

  trunks.count = placed;
  leaves.count = placed;
  leavesTop.count = placed;

  // 每棵树颜色微变（树干深浅 + 树冠黄绿/深绿），更自然
  const leafTint = new THREE.Color();
  const leafTopTint = new THREE.Color();
  const trunkTint = new THREE.Color();
  for (let i = 0; i < placed; i++) {
    leafTint.setHSL(0.33 + Math.random() * 0.05, 0.55, 0.4 + Math.random() * 0.16);
    leaves.setColorAt(i, leafTint);
    leafTopTint.copy(leafTint).lerp(new THREE.Color('#e2f0c0'), 0.4);
    leavesTop.setColorAt(i, leafTopTint);
    trunkTint.setHSL(0.08 + Math.random() * 0.03, 0.42, 0.3 + Math.random() * 0.12);
    trunks.setColorAt(i, trunkTint);
  }
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  if (leavesTop.instanceColor) leavesTop.instanceColor.needsUpdate = true;
  if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;

  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  leavesTop.instanceMatrix.needsUpdate = true;

  group.add(trunks, leaves, leavesTop);
  group.userData.treeCount = placed;
  return group;
}

/** 草地上的小花（InstancedMesh，黄 / 粉 / 白 / 橙） */
function createFlowers() {
  const FLOWER_COUNT = 80;
  const geo = new THREE.SphereGeometry(0.045, 6, 5);
  const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });
  const flowers = new THREE.InstancedMesh(geo, mat, FLOWER_COUNT);
  const flowerColors = [0xffd94f, 0xff8fb5, 0xffffff, 0xffb347];
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let placed = 0;
  let attempts = 0;
  while (placed < FLOWER_COUNT && attempts < FLOWER_COUNT * 40) {
    attempts++;
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.2 + Math.random() * (Math.PI - 0.4);
    const h = terrainHeight(theta, phi);
    if (h < 0.08 || h > 0.24) continue;
    const eps = 0.04;
    if (
      Math.abs(terrainHeight(theta + eps, phi) - h) +
        Math.abs(terrainHeight(theta, phi + eps) - h) >
      0.1
    ) {
      continue;
    }
    dir.set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    position.copy(dir).multiplyScalar(PLANET_RADIUS + h + 0.05);
    quaternion.setFromUnitVectors(UP_VECTOR, dir);
    const s = 0.8 + Math.random() * 0.5;
    scale.set(s, s, s);
    matrix.compose(position, quaternion, scale);
    flowers.setMatrixAt(placed, matrix);
    color.setHex(flowerColors[Math.floor(Math.random() * flowerColors.length)]);
    flowers.setColorAt(placed, color);
    placed++;
  }
  flowers.count = placed;
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  return flowers;
}

/** 岩石（InstancedMesh，灰色小块，散布在岩石带附近） */
function createRocks() {
  const ROCK_COUNT = 26;
  const geo = new THREE.DodecahedronGeometry(0.06, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8d857a, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(geo, mat, ROCK_COUNT);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let placed = 0;
  let attempts = 0;
  while (placed < ROCK_COUNT && attempts < ROCK_COUNT * 40) {
    attempts++;
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.2 + Math.random() * (Math.PI - 0.4);
    const h = terrainHeight(theta, phi);
    if (h < 0.18 || h > ROCK_LEVEL + 0.12) continue;
    dir.set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    position.copy(dir).multiplyScalar(PLANET_RADIUS + h + 0.04);
    quaternion.setFromUnitVectors(UP_VECTOR, dir);
    const s = 0.6 + Math.random() * 1.1;
    scale.set(s, s * (0.7 + Math.random() * 0.4), s);
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(placed, matrix);
    placed++;
  }
  rocks.count = placed;
  rocks.instanceMatrix.needsUpdate = true;
  return rocks;
}

function createWaterDevice() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.28, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0xe6f2f7 }),
  );
  base.position.y = 0.06;
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 0.34, 20),
    new THREE.MeshStandardMaterial({ color: 0x7cc4e8 }),
  );
  tank.position.y = 0.3;
  group.add(base, tank);
  return group;
}

/** 卡通猫窝：木质圆屋 + 红色尖顶 + 门洞 */
function createCatHouse() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.95, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xc96f52, roughness: 0.95, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3326, roughness: 1 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 10), wood);
  base.position.y = 0.08;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    wood,
  );
  dome.position.y = 0.26;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 10), roofMat);
  roof.position.y = 0.46;
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.16, 8), wood);
  chimney.position.set(0.16, 0.55, 0.02);
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.085, 10), dark);
  door.position.set(0, 0.14, 0.315);
  const winGeo = new THREE.CircleGeometry(0.045, 8);
  const winL = new THREE.Mesh(winGeo, dark);
  winL.position.set(-0.2, 0.1, 0.258);
  const winR = new THREE.Mesh(winGeo, dark);
  winR.position.set(0.2, 0.1, 0.258);

  group.add(base, dome, roof, chimney, door, winL, winR);
  return group;
}

/** 卡通逗猫棒：斜插在草地上的小棒 + 粉色绒球 + 羽毛 */
function createTeaserWand() {
  const group = new THREE.Group();
  const stickMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 1 });
  const toyMat = new THREE.MeshStandardMaterial({ color: 0xef7f9d, roughness: 0.8, flatShading: true });
  const featherMat = new THREE.MeshStandardMaterial({ color: 0xf5e9d8, roughness: 1, flatShading: true });

  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.52, 6), stickMat);
  stick.position.y = 0.26;
  const toy = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toyMat);
  toy.position.set(0, 0.52, 0.2);
  const feather = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), featherMat);
  feather.position.set(0, 0.6, 0.24);

  group.add(stick, toy, feather);
  return group;
}

// ================= 猫咪（移植自 APP HomeScene） =================

function createCat(color, index) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x171717 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), bodyMaterial);
  body.scale.set(1.15, 0.85, 1.25);
  body.position.y = 0.3;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), bodyMaterial);
  head.position.set(0, 0.54, 0.2);
  group.add(head);

  const earGeometry = new THREE.ConeGeometry(0.07, 0.12, 4);
  const earLeft = new THREE.Mesh(earGeometry, bodyMaterial);
  earLeft.position.set(-0.1, 0.68, 0.18);
  earLeft.rotation.z = -0.25;
  const earRight = earLeft.clone();
  earRight.position.x = 0.1;
  earRight.rotation.z = 0.25;
  group.add(earLeft, earRight);

  const eyeGeometry = new THREE.SphereGeometry(0.028, 10, 8);
  const eyeLeft = new THREE.Mesh(eyeGeometry, darkMaterial);
  eyeLeft.position.set(-0.07, 0.56, 0.34);
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.07;
  group.add(eyeLeft, eyeRight);

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.38, 8), bodyMaterial);
  tail.position.set(-0.2, 0.4, -0.2);
  tail.rotation.x = 1.1;
  tail.rotation.z = 0.4;
  group.add(tail);

  const [theta, phi] = CAT_START[index % CAT_START.length];

  return {
    group,
    head,
    behavior: {
      mode: 'idle',
      timer: 1 + Math.random() * 2,
      targetTheta: theta,
      targetPhi: phi,
      arriveMode: null,
    },
    index,
    theta,
    phi,
    yaw: 0,
    tilt: 0,
  };
}

function updateCat(cat, dt, time) {
  const behavior = cat.behavior;

  behavior.timer -= dt;

  if (behavior.mode === 'idle' && behavior.timer <= 0) {
    beginAction(cat, pickBehavior());
  }

  if (behavior.mode === 'walk' || behavior.mode === 'run') {
    const dTheta = behavior.targetTheta - cat.theta;
    const dPhi = behavior.targetPhi - cat.phi;
    const angularDistance = Math.hypot(dTheta, dPhi);
    const speed = behavior.mode === 'run' ? 1.1 : 0.42;
    const step = (speed / PLANET_RADIUS) * dt;

    if (angularDistance <= step) {
      cat.theta = behavior.targetTheta;
      cat.phi = behavior.targetPhi;
      if (behavior.arriveMode === 'drink') {
        behavior.mode = 'drink';
        behavior.timer = 3 + Math.random() * 3;
      } else if (behavior.arriveMode === 'sleep') {
        behavior.mode = 'sleep';
        behavior.timer = 4 + Math.random() * 3;
      } else if (behavior.arriveMode === 'play') {
        behavior.mode = 'play';
        behavior.timer = 3 + Math.random() * 3;
      } else {
        beginAction(cat, 'idle');
      }
    } else {
      cat.theta += (dTheta / angularDistance) * step;
      cat.phi += (dPhi / angularDistance) * step;
      cat.yaw = approachAngle(cat.yaw, Math.atan2(dTheta, dPhi), dt, 5);
    }
  }

  if (behavior.mode === 'drink' && behavior.timer <= 0) {
    beginAction(cat, 'idle');
  }

  if (behavior.mode === 'sleep' && behavior.timer <= 0) {
    beginAction(cat, 'idle');
  }

  if (behavior.mode === 'play' && behavior.timer <= 0) {
    beginAction(cat, 'idle');
  }

  const targetTilt = behavior.mode === 'sleep' ? -1.35 : behavior.mode === 'play' ? -0.3 : 0;
  cat.tilt = approach(cat.tilt, targetTilt, dt, 3);

  if (behavior.mode === 'drink') {
    cat.head.rotation.x = approach(cat.head.rotation.x, -0.55, dt, 6) + Math.sin(time * 3) * 0.05;
  } else if (behavior.mode === 'sleep') {
    cat.head.rotation.x = approach(cat.head.rotation.x, -0.25, dt, 3);
  } else if (behavior.mode === 'play') {
    cat.head.rotation.x = approach(cat.head.rotation.x, 0.3, dt, 6) + Math.sin(time * 9) * 0.2;
  } else {
    cat.head.rotation.x = approach(cat.head.rotation.x, 0, dt, 6);
  }

  if (behavior.mode === 'idle') {
    cat.yaw = approachAngle(cat.yaw, cat.index * 0.5 + Math.sin(time * 0.7 + cat.index) * 0.25, dt, 2);
  }

  placeOnPlanet(cat.group, cat.theta, cat.phi);
  cat.group.rotateY(cat.yaw);
  cat.group.rotateX(cat.tilt);
}

function beginAction(cat, mode) {
  const behavior = cat.behavior;

  const walkTo = (theta, phi, arriveMode) => {
    behavior.mode = 'walk';
    behavior.targetTheta = theta;
    behavior.targetPhi = phi;
    behavior.arriveMode = arriveMode;
    behavior.timer = 0;
  };

  if (mode === 'drink') {
    walkTo(DRINK_THETA + 0.18, DRINK_PHI + 0.1, 'drink');
    return;
  }

  if (mode === 'sleep' && HOUSE_SPOT) {
    walkTo(HOUSE_SPOT.theta + 0.1, HOUSE_SPOT.phi + 0.06, 'sleep');
    return;
  }

  if (mode === 'play' && WAND_SPOT) {
    walkTo(WAND_SPOT.theta + 0.12, WAND_SPOT.phi + 0.08, 'play');
    return;
  }

  if (mode === 'walk' || mode === 'run') {
    behavior.mode = mode;
    // 只走到陆地上（避免猫咪走到低洼水里）
    for (let i = 0; i < 12; i++) {
      const t = Math.random() * Math.PI * 2;
      const p = 0.25 + Math.random() * (Math.PI - 0.5);
      if (terrainHeight(t, p) > 0.05) {
        behavior.targetTheta = t;
        behavior.targetPhi = p;
        break;
      }
    }
    behavior.arriveMode = 'idle';
    behavior.timer = 0;
    return;
  }

  behavior.mode = mode;
  behavior.arriveMode = null;
  behavior.timer =
    mode === 'idle'
      ? 1.5 + Math.random() * 3
      : mode === 'sleep' || mode === 'play'
        ? 4 + Math.random() * 3
        : 0;
}

function pickBehavior() {
  const roll = Math.random();
  if (roll < 0.2) return 'drink';
  if (roll < 0.4) return 'walk';
  if (roll < 0.55) return 'run';
  if (roll < 0.7) return 'sleep';
  if (roll < 0.86) return 'play';
  return 'idle';
}

function approach(current, target, dt, speed) {
  return current + (target - current) * Math.min(1, dt * speed);
}

function approachAngle(current, target, dt, speed) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, dt * speed);
}

/** 把物体放在星球表面（随地形起伏） */
function placeOnPlanet(object, theta, phi) {
  const sinPhi = Math.sin(phi);
  const dir = new THREE.Vector3(
    sinPhi * Math.cos(theta),
    Math.cos(phi),
    sinPhi * Math.sin(theta),
  );
  const h = Math.max(0.03, terrainHeight(theta, phi));
  const r = PLANET_RADIUS + h;
  object.position.copy(dir).multiplyScalar(r);
  object.quaternion.setFromUnitVectors(UP_VECTOR, dir);
}

// 调试/调参用导出（浏览器中无副作用）
export { terrainHeight, fbm, valueNoise, hash3, angularDist, riverMask, smoothstep };
