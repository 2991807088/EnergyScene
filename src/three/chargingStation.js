// ============================================================
//  储能充电站：光伏顶棚 + 车位充电 + 集装箱储能
//
//  选址来自用户第二张斜俯视截图的红框。反解过程（见下方说明）：
//    1) 城市地面掩膜 -> 逐行/逐列取端点 -> 得到三条真实边界线：
//         左边线 (438,0)->(67,758)     斜率 dx/dy = -0.489
//         下边线 (76,758)->(1726,622)  斜率 dy/dx = -0.082
//         右边线 (1404,0)->(1799,480)  斜率 dx/dy = +0.823
//       两条侧边（世界 z 方向）求交得到 z 轴消失点 Vz=(798,-736)。
//       消失点只依赖相机朝向，且 ndc_y = cotφ/tan(22.5°) —— 直接解出 φ = 39.71°。
//    2) 用两个可见城市角 A(67,759)、B(1904,607) 对相机位置做线性最小二乘
//       （投影方程对 C 是线性的），得 C = (14.06, 97.77, -138.83)，重投影误差 25px。
//    3) 反投红框像素 x[251,903] y[306,668] 得到世界四边形：
//         TL(108.5,-31.1) TR(11.9,-41.8) BR(15.9,-97.8) BL(87.6,-89.8)
//       中心 (56,-65)，尺寸约 85×59。对齐到 16 一档的街区边界后定为
//         x ∈ [16, 96]   z ∈ [-96, -32]
//       这个矩形的东/南两边正压在环城路 x=96、z=-96 上，西边压在中心十字
//       干道 x=16 上 —— 三面临街，出入口挑西侧即可。
//
//  围栏在红框基础上再往里缩 3，给马路留人行道和路缘。
//
//  场地布局（围栏 74×58，中心 (56,-64)）：
//    · 北侧   一排 6 台储能集装箱（BESS）
//    · 中部   光伏顶棚（56×30，柱高 5.8），棚顶密铺双玻组件
//    · 棚下   两排共 24 个充电车位，中间 16 宽的通行车道，每车位一台充电桩
//    · 车辆   10 台电动车停在车位里充电（车头朝通道，车身带充电指示灯）
//    · 南侧   管理/配电房
//    · 出入口 开在西侧 x = minX（正对 x = 16 的中心干道），全场唯一
//
//  与其它模块的关系：
//    · 建筑（buildings.js）要避让本站，见 isInsideChargingStation()
//    · 光伏组件几何 / 材质复用地面电站的（three/solarFarm.js），保证全场景一致
// ============================================================
import * as THREE from 'three'
import { SOLAR_MATERIALS, SOLAR_PANEL_TINT, SOLAR_TABLE } from './solarFarm'

const DEG = Math.PI / 180
export const CHARGING_OFFSET = { x: -88, z: -64 }

/** 场地（围栏）范围与各分区参数 */
export const CHARGING = {
  // 围栏矩形 = 红框内缩 3（红框 x∈[16,96] z∈[-96,-32]）
  minX: 19,
  maxX: 93,
  minZ: -93,
  maxZ: -35,

  fenceH: 2.4,
  fenceT: 0.14,

  /** 唯一出入口：开在西侧 x = minX（朝 x = 16 的中心干道） */
  gate: { z: -64, width: 12 },

  /** 储能集装箱：北侧一排 6 台 */
  bess: {
    count: 6,
    w: 6.0, // 沿 x
    h: 2.7,
    d: 2.6, // 沿 z
    pitch: 11.5,
    firstX: 29.5,
    z: -39.5
  },

  /** 光伏顶棚 */
  canopy: {
    minX: 28,
    maxX: 84,
    minZ: -84,
    maxZ: -54,
    colH: 5.8,
    roofT: 0.18,
    panelTiltDeg: 10,
    panelRowPitch: 2.6, // 沿 z（坡向）排距
    panelColPitch: 5.58, // 沿 x（板宽 5.4 + 0.18 缝）
    panelLift: 0.32
  },

  /**
   * 充电车位：三排
   *   0 排 —— 顶棚南侧的**露天**充电位。刻意留一排在外，是为了让「车在充电」
   *          这件事从棚顶被压住的视角下依然看得见（棚下那一排从斜上方基本被板遮死）
   *   1 排 —— 顶棚下南半侧
   *   2 排 —— 顶棚下北半侧
   * sgn 表示车头朝向（+1 朝 +z），约定一律朝通道。
   */
  bay: {
    perRow: 10,
    w: 4.0, // 单个车位宽（沿 x）
    d: 5.5, // 车位深（沿 z）
    x0: 34, // 第一排车位左边界
    rowCenterZ: [-90, -79.75, -58.25],
    rowHead: [1, 1, -1],
    lineW: 0.13
  },

  /** 车辆：停在部分车位里充电 */
  car: { len: 4.6, bodyH: 0.85, bodyW: 1.95, cabinH: 0.62, cabinLen: 2.4 }
}

/** 三排车位的中心 z（0 排露天、1/2 排棚下） */
export const CHARGING_BAY_Z = CHARGING.bay.rowCenterZ

/** 围栏矩形内（可带外扩余量）—— 供建筑 / 树木避让 */
export function isInsideChargingStation(x, z, margin = 0) {
  x -= CHARGING_OFFSET.x
  z -= CHARGING_OFFSET.z
  return (
    x >= CHARGING.minX - margin &&
    x <= CHARGING.maxX + margin &&
    z >= CHARGING.minZ - margin &&
    z <= CHARGING.maxZ + margin
  )
}

/** 场地中心（供调试 / 参考） */
export const CHARGING_CENTER = {
  x: (CHARGING.minX + CHARGING.maxX) / 2,
  z: (CHARGING.minZ + CHARGING.maxZ) / 2
}

// ---------- 纹理 ----------

/** 2D 整数哈希 -> [0,1) */
function hash01(i) {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(31, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** 围栏：细密金属网格（与厂房园区同一套视觉） */
function makeFenceCanvas() {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.clearRect(0, 0, S, S)
  g.fillStyle = '#3b444f'
  for (let x = 3; x < S; x += 32) g.fillRect(x, 0, 5, S)
  g.fillRect(0, 2, S, 4)
  g.fillRect(0, S - 7, S, 5)
  for (let y = 12; y < S - 8; y += 12) g.fillRect(0, y, S, 2)
  return c
}

/** 储能集装箱侧面：深色柜体 + 竖向散热格栅 + 顶部警示条 */
function makeBessCanvas() {
  const W = 128, H = 64
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#dde3ea'
  g.fillRect(0, 0, W, H)
  // 柜门分割
  g.fillStyle = '#b9c2cc'
  g.fillRect(0, H - 10, W, 10)
  g.strokeStyle = 'rgba(70,80,92,0.55)'
  g.lineWidth = 2
  for (let x = 0; x <= W; x += 32) {
    g.beginPath(); g.moveTo(x + 0.5, 4); g.lineTo(x + 0.5, H - 10); g.stroke()
  }
  // 散热格栅
  g.fillStyle = '#5c6874'
  for (let x = 8; x < W; x += 32) {
    g.fillRect(x, 14, 18, 3)
    g.fillRect(x, 21, 18, 3)
    g.fillRect(x, 28, 18, 3)
  }
  // 顶部警示条
  g.fillStyle = '#2f7d4f'
  g.fillRect(0, 0, W, 5)
  return c
}

function canvasTexture(canvas, repeatX, repeatY) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.anisotropy = 4
  return t
}

let _cache = null
function materials() {
  if (_cache) return _cache

  const bessCanvas = makeBessCanvas()
  const bessSide = new THREE.MeshStandardMaterial({
    map: canvasTexture(bessCanvas, 2, 1), roughness: 0.62, metalness: 0.35
  })
  const bessCap = new THREE.MeshStandardMaterial({ color: '#8e99a5', roughness: 0.7, metalness: 0.3 })

  _cache = {
    // 场院硬化
    asphalt: new THREE.MeshStandardMaterial({ color: '#2b3138', roughness: 0.86, metalness: 0.22 }),
    // 顶棚钢结构
    steel: new THREE.MeshStandardMaterial({ color: '#59626d', roughness: 0.5, metalness: 0.6 }),
    // 顶棚屋面板（浅色压型钢板）
    deck: new THREE.MeshStandardMaterial({ color: '#9aa4b0', roughness: 0.62, metalness: 0.34 }),
    trim: new THREE.MeshStandardMaterial({ color: '#8d959e', roughness: 0.8, metalness: 0.1 }),
    // 储能柜
    bessSide,
    bessCap,
    // 车位划线
    paint: new THREE.MeshStandardMaterial({ color: '#e9eef4', roughness: 0.9, metalness: 0.0 }),
    // 充电桩
    charger: new THREE.MeshStandardMaterial({ color: '#3c454f', roughness: 0.45, metalness: 0.55 }),
    chargerScreen: new THREE.MeshStandardMaterial({
      color: '#1a2c3f', roughness: 0.3, metalness: 0.2,
      emissive: new THREE.Color('#2f8fd8'), emissiveIntensity: 0.85
    }),
    // 车辆
    carBody: new THREE.MeshStandardMaterial({ color: '#e8ecf1', roughness: 0.35, metalness: 0.45 }),
    carGlass: new THREE.MeshStandardMaterial({ color: '#2b3a4a', roughness: 0.18, metalness: 0.5 }),
    tire: new THREE.MeshStandardMaterial({ color: '#20262c', roughness: 0.95, metalness: 0.0 }),
    // 充电指示灯（车在充电 → 亮绿，符合国内「工作中」配色）
    ledOn: new THREE.MeshStandardMaterial({
      color: '#1f7a45', roughness: 0.4, metalness: 0.1,
      emissive: new THREE.Color('#28c06a'), emissiveIntensity: 1.6
    })
  }
  return _cache
}

/** 围栏材质：按段长算贴图重复 */
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

export function buildChargingStation() {
  const M = materials()
  const boxes = [] // { material, position, scale, rotation? }
  const box = (material, position, scale, rotation = null) => boxes.push({ material, position, scale, rotation })

  const { minX, maxX, minZ, maxZ } = CHARGING
  const yardW = maxX - minX
  const yardD = maxZ - minZ
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2

  // ---- 0) 场院硬化（整块，底面抬到 y=0.055 避免与城市地面共面打架）----
  box(M.asphalt, [cx, 0.055, cz], [yardW - 0.6, 0.07, yardD - 0.6])

  // ---- 1) 储能集装箱阵列（北侧一排）----
  const B = CHARGING.bess
  for (let i = 0; i < B.count; i++) {
    const bx = B.firstX + i * B.pitch
    // 柜体：±x 面是宽面（贴格栅纹理），±z 端面/±y 用素色
    box([M.bessSide, M.bessSide, M.bessCap, M.bessCap, M.bessCap, M.bessCap],
      [bx, B.h / 2, B.z], [B.w, B.h, B.d])
    // 柜顶雨檐（略比柜体大一圈）
    box(M.bessCap, [bx, B.h + 0.09, B.z], [B.w + 0.36, 0.18, B.d + 0.36])
  }

  // ---- 2) 光伏顶棚：柱 + 屋面板 ----
  const C = CHARGING.canopy
  const cw = C.maxX - C.minX
  const cd = C.maxZ - C.minZ
  const ccx = (C.minX + C.maxX) / 2
  const ccz = (C.minZ + C.maxZ) / 2
  const colT = 0.34

  // 柱列刻意落在车位分隔线上（x = 38/50/62/74 都是车位边界），
  // 两端 28 / 84 在车位区之外，避免立柱戳在车位正中挡车
  const colXs = [C.minX, 38, 50, 62, 74, C.maxX]
  const colZs = [C.minZ, (C.minZ + C.maxZ) / 2, C.maxZ]
  for (const px of colXs) {
    for (const pz of colZs) {
      box(M.steel, [px, C.colH / 2, pz], [colT, C.colH, colT])
    }
  }
  // 柱顶纵向主梁（沿 x，三道）
  for (const pz of colZs) {
    box(M.steel, [ccx, C.colH + 0.18, pz], [cw, 0.36, 0.3])
  }
  // 屋面板（水平的压型钢板，给光伏一个基面）
  box(M.deck, [ccx, C.colH + 0.45, ccz], [cw, C.roofT, cd])
  // 檐口包边（四周薄边）
  const et = 0.22
  for (const s of [-1, 1]) {
    box(M.trim, [ccx + s * (cw / 2 - et / 2), C.colH + 0.45, ccz], [et, C.roofT + 0.16, cd])
    box(M.trim, [ccx, C.colH + 0.45, ccz + s * (cd / 2 - et / 2)], [cw, C.roofT + 0.16, et])
  }

  // ---- 3) 车位划线（每个车位一条分隔线 + 每排一条底线）----
  const Y = CHARGING.bay
  const yTop = 0.095
  for (const rz of Y.rowCenterZ) {
    for (let i = 0; i <= Y.perRow; i++) {
      const lx = Y.x0 + i * Y.w
      box(M.paint, [lx, yTop, rz], [Y.lineW, 0.02, Y.d])
    }
    // 每排两端封口（形成完整车位框）
    box(M.paint, [Y.x0 + (Y.perRow * Y.w) / 2, yTop, rz - Y.d / 2], [Y.perRow * Y.w, 0.02, Y.lineW])
    box(M.paint, [Y.x0 + (Y.perRow * Y.w) / 2, yTop, rz + Y.d / 2], [Y.perRow * Y.w, 0.02, Y.lineW])
  }

  // ---- 4) 充电桩（每车位一台，装在靠通道一侧）----
  const chargers = []
  const chargerZ = (rz, sgn) => rz + sgn * (Y.d / 2 + 0.55)
  Y.rowCenterZ.forEach((rz, r) => {
    const sgn = Y.rowHead[r] // 桩一律立在车位靠通道那一端
    for (let i = 0; i < Y.perRow; i++) {
      const px = Y.x0 + (i + 0.5) * Y.w
      const pz = chargerZ(rz, sgn)
      // 底座
      box(M.charger, [px, 0.09, pz], [0.9, 0.18, 0.7])
      // 立柱
      box(M.charger, [px, 0.95, pz], [0.5, 1.54, 0.4])
      // 屏幕（自发光，朝通道）
      box(M.chargerScreen, [px, 1.35, pz + sgn * 0.22], [0.36, 0.44, 0.06])
      chargers.push({ x: px, z: pz, row: r })
    }
  })

  // ---- 5) 车辆：停在部分车位里充电 ----
  const cars = []
  const carPlan = [
    // 露天排（0）：多放几台，保证「在充电的新能源车」一眼能看见
    { row: 0, i: 0 }, { row: 0, i: 1 }, { row: 0, i: 3 }, { row: 0, i: 4 },
    { row: 0, i: 6 }, { row: 0, i: 8 },
    // 棚下两排
    { row: 1, i: 1 }, { row: 1, i: 4 }, { row: 1, i: 7 },
    { row: 2, i: 2 }, { row: 2, i: 5 }, { row: 2, i: 9 }
  ]
  const CR = CHARGING.car
  carPlan.forEach((plan) => {
    const rz = Y.rowCenterZ[plan.row]
    const px = Y.x0 + (plan.i + 0.5) * Y.w
    const sgn = Y.rowHead[plan.row] // 车头朝通道
    // 车身
    box(M.carBody, [px, 0.42 + CR.bodyH / 2 - 0.42, rz], [CR.bodyW, CR.bodyH, CR.len])
    // 车舱（略短，居中偏后）
    box(M.carGlass, [px, CR.bodyH + CR.cabinH / 2 - 0.06, rz - sgn * 0.25],
      [CR.bodyW - 0.16, CR.cabinH, CR.cabinLen])
    // 四个轮子
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(M.tire, [px + sx * (CR.bodyW / 2 - 0.05), 0.33, rz + sz * 1.45],
          [0.26, 0.62, 0.62])
      }
    }
    // 充电指示灯（车头侧，绿灯 = 正在补能）
    box(M.ledOn, [px, 0.86, rz + sgn * (CR.len / 2 - 0.08)], [0.34, 0.09, 0.05])
    cars.push({ x: px, z: rz, row: plan.row })
  })

  // ---- 6) 管理 / 配电房（东南角，避开露天充电排）----
  box(M.trim, [88.0, 1.7, -88.5], [7.0, 3.4, 6.4])
  box(M.deck, [88.0, 3.52, -88.5], [7.6, 0.24, 7.0])
  // 设备房外的配电箱
  box(M.charger, [84.0, 0.85, -88.5], [1.4, 1.7, 1.0])

  // ---- 7) 围栏（唯一缺口在西侧 x = minX）----
  const fence = []
  const addFence = (fx, fz, len, alongZ) => {
    fence.push({
      material: fenceMaterial(len),
      position: [fx, CHARGING.fenceH / 2, fz],
      scale: alongZ ? [CHARGING.fenceT, CHARGING.fenceH, len] : [len, CHARGING.fenceH, CHARGING.fenceT]
    })
  }
  addFence(cx, minZ, yardW, false)
  addFence(cx, maxZ, yardW, false)
  addFence(maxX, cz, yardD, true)

  const g = CHARGING.gate
  const g0 = g.z - g.width / 2
  const g1 = g.z + g.width / 2
  addFence(minX, (minZ + g0) / 2, g0 - minZ, true)
  addFence(minX, (g1 + maxZ) / 2, maxZ - g1, true)

  // ---- 8) 大门：两根门柱 + 横梁 ----
  box(M.steel, [minX, 1.6, g0], [0.9, 3.2, 0.9])
  box(M.steel, [minX, 1.6, g1], [0.9, 3.2, 0.9])
  box(M.steel, [minX, 3.34, g.z], [0.7, 0.42, g.width + 1.2])
  // 门楣上的招牌板（浅色 + 自发光条，示意「光储充一体站」）
  box(M.deck, [minX - 0.1, 3.9, g.z], [0.32, 0.72, g.width - 0.4])
  box(M.chargerScreen, [minX - 0.28, 3.9, g.z], [0.06, 0.4, g.width - 1.6])

  // ---- 9) 出入口铺装：从大门一直铺到马路边 ----
  box(M.asphalt, [minX - 1.1, 0.055, g.z], [2.6, 0.07, g.width])

  return {
    boxes,
    fence,
    panels: layoutCanopyPanels(),
    chargers,
    cars
  }
}

/** 全部部件共用的单位立方体 */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
export function chargingUnitBox() {
  return UNIT_BOX
}
export const CHARGING_FENCE_ALPHA = true

// ---------- 顶棚光伏 ----------

/**
 * 顶棚光伏：在水平屋面板上按 10° 倾角密排。
 *
 * 朝向取「板面法线偏向 +z（南）」，即绕 X 轴正转 —— 太阳水平方位角在
 * SUN_AZIMUTH，与本场地的主朝向基本一致，所以这里不做额外 yaw，
 * 让板宽方向顺着顶棚长轴（x），铺满矩形屋面不留下角部空白。
 */
function layoutCanopyPanels() {
  const T = SOLAR_TABLE
  const C = CHARGING.canopy
  const tilt = C.panelTiltDeg * DEG

  const spanX = C.maxX - C.minX
  const spanZ = C.maxZ - C.minZ
  const cols = Math.max(1, Math.floor((spanX - 1.2) / C.panelColPitch))
  const rows = Math.max(1, Math.floor((spanZ - 1.2) / C.panelRowPitch))
  const count = cols * rows

  const deckY = C.colH + 0.45 + C.roofT / 2

  const matrices = new Float32Array(count * 16)
  const tones = new Float32Array(count * 3)
  const base = new THREE.Color(SOLAR_PANEL_TINT)

  const tiltM = new THREE.Matrix4().makeRotationX(tilt)
  const scaleM = new THREE.Matrix4().makeScale(T.width, T.thickness, T.slopeLen)
  const liftM = new THREE.Matrix4().makeTranslation(0, C.panelLift, 0)
  const local = new THREE.Matrix4().multiplyMatrices(liftM, tiltM).multiply(scaleM)

  const place = new THREE.Matrix4()
  const out = new THREE.Matrix4()
  const cx = (C.minX + C.maxX) / 2
  const cz = (C.minZ + C.maxZ) / 2

  let i = 0
  for (let r = 0; r < rows; r++) {
    const lz = cz + (r - (rows - 1) / 2) * C.panelRowPitch
    for (let c = 0; c < cols; c++) {
      const lx = cx + (c - (cols - 1) / 2) * C.panelColPitch
      place.makeTranslation(lx, deckY, lz)
      matrices.set(out.multiplyMatrices(place, local).elements, i * 16)

      const lum = 0.88 + 0.26 * hash01(i)
      const warm = (hash01(i + 4242) - 0.5) * 0.12
      tones[i * 3] = base.r * lum * (1 + warm)
      tones[i * 3 + 1] = base.g * lum
      tones[i * 3 + 2] = base.b * lum * (1 - warm * 0.6)
      i++
    }
  }

  return { matrices, tones, count, cols, rows, deckY }
}

/** 面板材质（复用地面电站那份） */
export function chargingPanelMaterial() {
  return SOLAR_MATERIALS.panel
}

/** 各功能区的世界包围盒（供校验 / 调试） */
export function chargingLayout() {
  const C = CHARGING.canopy
  const B = CHARGING.bess
  return {
    yard: { minX: CHARGING.minX, maxX: CHARGING.maxX, minZ: CHARGING.minZ, maxZ: CHARGING.maxZ },
    bess: {
      firstX: B.firstX - B.w / 2,
      lastX: B.firstX + (B.count - 1) * B.pitch + B.w / 2,
      z: B.z, h: B.h
    },
    canopy: { minX: C.minX, maxX: C.maxX, minZ: C.minZ, maxZ: C.maxZ, colH: C.colH },
    bays: CHARGING.bay.rowCenterZ.map((z) => ({
      centerZ: z,
      minX: CHARGING.bay.x0,
      maxX: CHARGING.bay.x0 + CHARGING.bay.perRow * CHARGING.bay.w
    })),
    gate: CHARGING.gate
  }
}
