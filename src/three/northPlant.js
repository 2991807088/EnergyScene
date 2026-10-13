// ============================================================
//  城北电站：小型柴发电站、大型火力发电站 + 围栏 + 南向大门 + 连接道路
//
//  选址与场地平整见 three/northSite.js（本模块只管「在平好的台地上摆东西」）。
//
//  布局（世界坐标，台地标高 PAD = NORTH_SITE.padH）：
//    · 柴发厂房   x = 4、z = -210，32 × 15 × 8
//    · 火电厂房   x = 95、z = -211，96 × 27 × 17，附烟囱
//    · 储罐区     柴发厂房西侧
//    · 大门       开在南围栏 z = -189、x = 16，正对连接道路
//    · 屋顶光伏   仅铺在柴发厂房屋顶
//    · 连接道路   x = 16，城市北缘 → 大门，贴合平整后的地形，沥青 + 标线纹理
// ============================================================
import * as THREE from 'three'
import { makeWallCanvas, makeFenceCanvas } from './factoryCampus'
import { SOLAR_MATERIALS, SOLAR_PANEL_TINT, SOLAR_TABLE } from './solarFarm'
import { NORTH_SITE, NORTH_ROAD } from './northSite'
import { terrainHeight } from './terrain'

const DEG = Math.PI / 180
const PAD = NORTH_SITE.padH

/** 厂区布局参数 */
export const PLANT = {
  minX: -27,
  maxX: 159,
  minZ: -235,
  maxZ: -189,

  fenceH: 2.2,
  fenceT: 0.14,

  halls: [
    { name: '小型柴发电站', x: 4, z: -210, len: 32, depth: 15, height: 8 },
    { name: '大型火力发电站', x: 95, z: -211, len: 96, depth: 27, height: 17 }
  ],

  /** 储罐 */
  tanks: [
    { x: -23, z: -217 },
    { x: -23, z: -211 },
    { x: -23, z: -205 }
  ],
  tankR: 2.4,
  tankH: 5.2,

  /** 火电站烟囱（圆柱，scale 用半径换算） */
  stacks: [
    { x: 151, z: -216, radius: 1.6, height: 36 },
    { x: 157, z: -216, radius: 1.6, height: 36 }
  ],

  /** 大门：南围栏上，正对连接道路 */
  gate: { x: NORTH_ROAD.x, width: 12 },

  /** 屋顶光伏 */
  panelTiltDeg: 15,
  panelRowsPerHall: 3,
  panelColPitch: 5.58,
  panelLift: 0.42,
  panelGapSide: 0.7
}

// ---------- 贴图 / 材质 ----------

function canvasTexture(canvas, repeatX, repeatY) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.anisotropy = 4
  return t
}

/** 道路贴图：沥青底 + 两侧白色边线 + 中央虚线（v 方向为行车方向） */
function makeRoadCanvas() {
  const W = 128
  const H = 128
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')

  g.fillStyle = '#31373f'
  g.fillRect(0, 0, W, H)
  // 沥青颗粒噪点
  for (let i = 0; i < 300; i++) {
    const v = 40 + Math.floor(Math.random() * 30)
    g.fillStyle = `rgba(${v},${v + 4},${v + 8},0.35)`
    g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5)
  }
  // 边线
  g.fillStyle = '#cfd3d8'
  g.fillRect(5, 0, 4, H)
  g.fillRect(W - 9, 0, 4, H)
  // 中央虚线
  g.fillStyle = '#d8c95a'
  g.fillRect(W / 2 - 2, 8, 4, 48)
  return c
}

let _cache = null
function materials() {
  if (_cache) return _cache

  const wallCanvas = makeWallCanvas()
  // 厂房长边在 ±z 面，端面在 ±x 面
  const wallLong = new THREE.MeshStandardMaterial({
    map: canvasTexture(wallCanvas, 15, 1),
    roughness: 0.72,
    metalness: 0.18
  })
  const wallEnd = new THREE.MeshStandardMaterial({
    map: canvasTexture(wallCanvas, 3, 1),
    roughness: 0.72,
    metalness: 0.18
  })
  const roof = new THREE.MeshStandardMaterial({ color: '#79828d', roughness: 0.85, metalness: 0.16 })
  const trim = new THREE.MeshStandardMaterial({ color: '#8d959e', roughness: 0.8, metalness: 0.1 })
  const steel = new THREE.MeshStandardMaterial({ color: '#59626d', roughness: 0.5, metalness: 0.6 })
  const asphalt = new THREE.MeshStandardMaterial({ color: '#2b3138', roughness: 0.86, metalness: 0.22 })
  const tank = new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.45, metalness: 0.6 })
  const chimney = new THREE.MeshStandardMaterial({ color: '#d8d6d1', roughness: 0.72 })
  const chimneyStripe = new THREE.MeshStandardMaterial({ color: '#ae554d', roughness: 0.75 })

  // BoxGeometry 分组顺序 +x -x +y -y +z -z：±z 是长边、±x 是端面
  const hallFaces = [wallEnd, wallEnd, roof, roof, wallLong, wallLong]

  _cache = { wallLong, wallEnd, roof, trim, steel, asphalt, tank, chimney, chimneyStripe, hallFaces }
  return _cache
}

/** 围栏材质：按段长算贴图重复，保证网格密度一致 */
function fenceMaterial(len) {
  return new THREE.MeshStandardMaterial({
    map: canvasTexture(makeFenceCanvas(), len / 2.6, 1),
    transparent: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0.55,
    color: '#ffffff'
  })
}

// ---------- 组装 ----------

/**
 * 生成厂区的全部静态部件。
 * @returns {{ boxes: Array, tanks: Array, fence: Array, panels: object, signs: Array }}
 */
export function buildNorthPlant() {
  const M = materials()
  const boxes = []
  const box = (material, position, scale) => boxes.push({ material, position, scale })

  // ---- 1) 两座不同规模的电站厂房；朝城市的 +z 墙面留给中文标牌 ----
  for (const hall of PLANT.halls) {
    const { x, z, len, depth, height } = hall
    box(M.hallFaces, [x, PAD + height / 2, z], [len, height, depth])
    box(M.roof, [x, PAD + height + 0.06, z], [len + 0.3, 0.12, depth + 0.3])
    const ph = 0.5
    const pt = 0.26
    const hl = len / 2
    const hd = depth / 2
    for (const s of [-1, 1]) {
      box(M.trim, [x + s * (hl - pt / 2), PAD + height + 0.12 + ph / 2, z], [pt, ph, depth])
      box(M.trim, [x, PAD + height + 0.12 + ph / 2, z + s * (hd - pt / 2)], [len, ph, pt])
    }
  }

  // 火电厂房屋顶的通风设备，与柴发屋顶光伏形成不同的轮廓。
  for (const x of [62, 82, 102, 122]) {
    box(M.steel, [x, PAD + 18.2, -214], [8, 2.4, 6])
    box(M.trim, [x, PAD + 19.5, -214], [8.5, 0.2, 6.5])
  }

  // ---- 2) 场院硬化 ----
  const yardW = PLANT.maxX - PLANT.minX
  const yardD = PLANT.maxZ - PLANT.minZ
  box(M.asphalt, [(PLANT.minX + PLANT.maxX) / 2, PAD + 0.05, (PLANT.minZ + PLANT.maxZ) / 2], [
    yardW - 0.6,
    0.07,
    yardD - 0.6
  ])

  // ---- 3) 围栏（唯一缺口在南边 z = maxZ 的大门处） ----
  const fence = []
  const ft = PLANT.fenceT
  const fh = PLANT.fenceH
  const addFence = (cx, cz, len, alongX) => {
    fence.push({
      material: fenceMaterial(len),
      position: [cx, PAD + fh / 2, cz],
      scale: alongX ? [len, fh, ft] : [ft, fh, len]
    })
  }
  addFence((PLANT.minX + PLANT.maxX) / 2, PLANT.minZ, yardW, true)
  addFence(PLANT.minX, (PLANT.minZ + PLANT.maxZ) / 2, yardD, false)
  addFence(PLANT.maxX, (PLANT.minZ + PLANT.maxZ) / 2, yardD, false)

  const g = PLANT.gate
  const gx0 = g.x - g.width / 2
  const gx1 = g.x + g.width / 2
  addFence((PLANT.minX + gx0) / 2, PLANT.maxZ, gx0 - PLANT.minX, true)
  addFence((gx1 + PLANT.maxX) / 2, PLANT.maxZ, PLANT.maxX - gx1, true)

  // ---- 4) 大门：两根门柱 + 横梁 + 门卫房 ----
  box(M.steel, [gx0, PAD + 1.5, PLANT.maxZ], [0.9, 3.0, 0.9])
  box(M.steel, [gx1, PAD + 1.5, PLANT.maxZ], [0.9, 3.0, 0.9])
  box(M.steel, [g.x, PAD + 3.15, PLANT.maxZ], [g.width + 1.2, 0.42, 0.7])
  box(M.trim, [gx1 + 3.4, PAD + 1.6, PLANT.maxZ - 3.6], [3.6, 3.2, 4.2])
  box(M.roof, [gx1 + 3.4, PAD + 3.32, PLANT.maxZ - 3.6], [4.2, 0.24, 4.8])

  // ---- 5) 储罐（放在防火堤平台上，圆柱几何在组件里单独给） ----
  const dikeTop = PAD + 0.7
  const tanks = PLANT.tanks.map((t) => ({
    material: M.tank,
    position: [t.x, dikeTop + PLANT.tankH / 2, t.z],
    scale: [PLANT.tankR * 2, PLANT.tankH, PLANT.tankR * 2]
  }))
  // 罐区防火堤（矮平台围出罐区）
  box(M.trim, [-23, PAD + 0.35, -211], [7.5, 0.7, 17])

  // 厂房东侧的烟囱属于火电站，红白色环带让它在远景中仍可辨识。
  const stacks = []
  for (const s of PLANT.stacks) {
    const d = s.radius * 2
    stacks.push({ material: M.chimney, position: [s.x, PAD + s.height / 2, s.z], scale: [d, s.height, d] })
    for (const y of [23, 29, 35]) {
      stacks.push({
        material: M.chimneyStripe,
        position: [s.x, PAD + y, s.z],
        scale: [d + 0.06, 2.2, d + 0.06]
      })
    }
  }

  const signs = PLANT.halls.map((hall) => ({
    name: hall.name,
    position: [hall.x, PAD + hall.height * 0.69, hall.z + hall.depth / 2 + 0.08],
    width: hall.len * 0.72,
    height: hall.height * 0.24
  }))

  return { boxes, tanks: [...tanks, ...stacks], fence, panels: layoutRoofPanels(), signs }
}

/**
 * 烟囱口（烟羽发射点）世界坐标。
 * y 取筒顶略低一点，让最初的几团烟像是从筒里冒出来的。
 */
export function stackMouths() {
  return PLANT.stacks.map((s) => ({
    x: s.x,
    y: PAD + s.height - 0.6,
    z: s.z,
    radius: s.radius
  }))
}

/** 单位立方体（与厂房园区共用同一份几何） */
export { campusUnitBox as northPlantUnitBox } from './factoryCampus'

/** 储罐用的单位圆柱 */
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 24)
export function northPlantTankGeometry() {
  return UNIT_CYLINDER
}

// ---------- 屋顶光伏 ----------

function hash01(i) {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(31, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/**
 * 柴发厂房屋顶光伏：低倾角密排，行列与厂房长轴（x）对齐，朝南（朝城市一侧）。
 * 与城内厂房园区同一个取舍：宁可偏一点太阳，也要把矩形屋面铺满。
 */
function layoutRoofPanels() {
  const T = SOLAR_TABLE
  const tilt = PLANT.panelTiltDeg * DEG

  const hall = PLANT.halls[0]
  const rows = PLANT.panelRowsPerHall
  const rowSpan = hall.depth - PLANT.panelGapSide * 2
  const rowPitch = rowSpan / rows
  const cols = Math.max(1, Math.floor((hall.len - 1.6) / PLANT.panelColPitch))

  const count = rows * cols
  const matrices = new Float32Array(count * 16)
  const tones = new Float32Array(count * 3)
  const base = new THREE.Color(SOLAR_PANEL_TINT)

  const yawM = new THREE.Matrix4().makeRotationY(Math.PI) // 面板局部 +z → 世界 -z 之反向：朝南
  const tiltM = new THREE.Matrix4().makeRotationX(tilt)
  const scaleM = new THREE.Matrix4().makeScale(T.width, T.thickness, T.slopeLen)
  const liftM = new THREE.Matrix4().makeTranslation(0, PLANT.panelLift, 0)
  const local = new THREE.Matrix4().multiplyMatrices(yawM, liftM).multiply(tiltM).multiply(scaleM)

  const place = new THREE.Matrix4()
  const out = new THREE.Matrix4()
  const roofY = PAD + hall.height + 0.12

  let i = 0
  for (let r = 0; r < rows; r++) {
    const lz = hall.z + (r - (rows - 1) / 2) * rowPitch
    for (let c = 0; c < cols; c++) {
      const lx = hall.x + (c - (cols - 1) / 2) * PLANT.panelColPitch
      place.makeTranslation(lx, roofY, lz)
      matrices.set(out.multiplyMatrices(place, local).elements, i * 16)

      const lum = 0.88 + 0.26 * hash01(i)
      const warm = (hash01(i + 7777) - 0.5) * 0.12
      tones[i * 3] = base.r * lum * (1 + warm)
      tones[i * 3 + 1] = base.g * lum
      tones[i * 3 + 2] = base.b * lum * (1 - warm * 0.6)
      i++
    }
  }

  return { matrices, tones, count }
}

/** 面板材质（复用地面电站那份，保证观感一致） */
export function northPlantPanelMaterial() {
  return SOLAR_MATERIALS.panel
}

// ---------- 连接道路 ----------

/**
 * 连接道路几何：贴合平整后地形的贴地条带。
 * 沿 z 每 0.8m 采一个断面，路面抬 0.05 防共面。
 */
export function buildNorthRoad() {
  const r = NORTH_ROAD
  const step = 0.8
  const n = Math.ceil((r.fromZ - r.toZ) / step)

  const positions = []
  const uvs = []
  const indices = []
  let vAcc = 0
  let prevZ = r.fromZ

  for (let i = 0; i <= n; i++) {
    const z = Math.max(r.toZ, r.fromZ - i * step)
    const y = terrainHeight(r.x, z) + 0.05
    if (i > 0) vAcc += Math.abs(prevZ - z) / (r.halfW * 2)
    prevZ = z

    positions.push(r.x - r.halfW, y, z, r.x + r.halfW, y, z)
    uvs.push(0, vAcc, 1, vAcc)

    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    map: canvasTexture(makeRoadCanvas(), 1, 1),
    roughness: 0.88,
    metalness: 0.12
  })
  material.map.wrapT = THREE.RepeatWrapping

  return { geometry: geo, material }
}
