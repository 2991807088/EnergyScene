// ============================================================
//  厂房园区：连续四排厂房 + 屋顶铺满光伏 + 四周围栏 + 一个出入口
//
//  选址来自用户俯视截图里的红框。把该截图反解一遍（城市地面四条边线拟合 → 单应 H，
//  再用已知路网 x/z = ±16、±96 回投校验），红框四角落在世界坐标：
//      x ∈ [-96, -16]   z ∈ [+16, +96]
//  这个矩形四条边正好压在城市仅有的四条干道上（南北是中心十字 x=-16 / z=+16，
//  西南是环城路 x=-96 / z=+96），也就是「四边都临街」——出入口随便挑一条边都能接马路。
//  框内 4 条红色横线反投出来落在 x ≈ -32 / -48 / -64 / -80，正是 16 一档的街区边界，
//  据此把园区沿 x 方向切成 4 排。
//
//  布局（围栏在红框基础上再往里缩，给马路留出人行道和路缘）：
//    · 围栏矩形   x ∈ [-93, -19]、z ∈ [19, 93]（74 × 74）
//    · 4 排厂房   每排沿 z 铺 64 长、沿 x 进深 11.5，排间距 3.5，前后各留 8.75 的场院
//    · 屋顶光伏   低倾角（15°）密排，把屋顶盖满，而不是像地面电站那样稀疏排布
//    · 出入口     开在 x = -19 这条边上（正对 x = -16 的中心干道），全场唯一
//
//  与其它模块的关系：
//    · 建筑（buildings.js）与树木（trees.js）都要避让本园区，见 isInsideCampus()
//    · 面板几何 / 材质直接复用地面电站的（three/solarFarm.js），保证两处光伏观感一致
// ============================================================
import * as THREE from 'three'
import { CITY_EXPANSION } from './cityLayout'
import { SOLAR_MATERIALS, SOLAR_PANEL_TINT, SOLAR_TABLE } from './solarFarm'

const DEG = Math.PI / 180
export const CAMPUS_OFFSET = { x: -CITY_EXPANSION, z: CITY_EXPANSION }

/** 园区（围栏）范围与厂房阵列参数 */
export const CAMPUS = {
  minX: -93,
  maxX: -19,
  minZ: 19,
  maxZ: 93,

  fenceH: 2.2,
  fenceT: 0.14,

  /** 4 排厂房：沿 x 排开 */
  rows: 4,
  hallDepth: 11.5, // 沿 x 的进深
  hallGap: 3.5, // 排间距（也是场内通道）
  hallLen: 64, // 沿 z 的长度
  hallH: 7.2,
  hallFirstFace: -27.75, // 第 0 排的「近侧」面在 x = -27.75，前后场院各 8.75

  /** 屋顶光伏 */
  panelTiltDeg: 15,
  panelsPerRow: 4, // 沿 x 铺 4 排板
  panelColPitch: 5.58, // 沿 z 的板列间距（板宽 5.4 + 0.18 缝）
  panelLift: 0.42, // 板中心离屋面的高度
  panelGapTop: 0.6, // 沿 x 两端留白

  /** 唯一出入口：开在 x = maxX 这条边（朝 x = -16 的中心干道） */
  gate: { z: 56, width: 11 }
}

/** 围栏矩形内（可带外扩余量）—— 供建筑 / 树木避让 */
export function isInsideCampus(x, z, margin = 0) {
  x -= CAMPUS_OFFSET.x
  z -= CAMPUS_OFFSET.z
  return (
    x >= CAMPUS.minX - margin &&
    x <= CAMPUS.maxX + margin &&
    z >= CAMPUS.minZ - margin &&
    z <= CAMPUS.maxZ + margin
  )
}

// ---------- 4 排厂房的中心（沿 x） ----------
// 第 k 排：x 从 hallFirstFace - (hallDepth + hallGap) * k 往 -x 方向铺 hallDepth
function hallCenterX(k) {
  return CAMPUS.hallFirstFace - CAMPUS.hallDepth / 2 - (CAMPUS.hallDepth + CAMPUS.hallGap) * k
}
const HALL_CZ = (CAMPUS.minZ + CAMPUS.maxZ) / 2

// ---------- 贴图 ----------

/** 厂房外墙：浅灰工业板 + 顶部一条高窗带 + 竖向板缝（城北工厂复用，已导出） */
export function makeWallCanvas() {
  const W = 128
  const H = 128
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')

  g.fillStyle = '#b9c0c7'
  g.fillRect(0, 0, W, H)

  // 竖向板缝
  g.strokeStyle = 'rgba(70,78,88,0.5)'
  g.lineWidth = 1
  for (let x = 0; x <= W; x += 16) {
    g.beginPath()
    g.moveTo(x + 0.5, 0)
    g.lineTo(x + 0.5, H)
    g.stroke()
  }
  // 勒脚（底部深一档）
  g.fillStyle = '#8d959e'
  g.fillRect(0, H - 14, W, 14)

  // 高窗带：一条横向的深色玻璃带 + 窗棂
  g.fillStyle = '#31404f'
  g.fillRect(0, 22, W, 24)
  g.fillStyle = '#7f95ab'
  for (let x = 3; x < W; x += 16) {
    g.fillRect(x, 25, 11, 18)
  }
  g.strokeStyle = 'rgba(20,26,34,0.75)'
  g.lineWidth = 2
  for (let x = 0; x <= W; x += 16) {
    g.beginPath()
    g.moveTo(x + 0.5, 22)
    g.lineTo(x + 0.5, 46)
    g.stroke()
  }
  // 顶部檐口
  g.fillStyle = '#9aa2ab'
  g.fillRect(0, 0, W, 7)
  return c
}

/** 围栏：细密金属网格（用 alphaTest 抠出镂空，比半透明更稳）（城北工厂复用，已导出） */
export function makeFenceCanvas() {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.clearRect(0, 0, S, S)
  g.fillStyle = '#3b444f'
  // 立柱
  for (let x = 3; x < S; x += 32) g.fillRect(x, 0, 5, S)
  // 上下横梁
  g.fillRect(0, 2, S, 4)
  g.fillRect(0, S - 7, S, 5)
  // 网片横丝
  for (let y = 12; y < S - 8; y += 12) g.fillRect(0, y, S, 2)
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

  const wallCanvas = makeWallCanvas()
  // 长边（±x 面，长 64）多铺几档，端面（±z 面，长 11.5）少铺几档
  const wallLong = new THREE.MeshStandardMaterial({
    map: canvasTexture(wallCanvas, 16, 1),
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

  // 厂房主体要「长边 / 端面 / 屋面」三种材质：BoxGeometry 的分组顺序是 +x -x +y -y +z -z，
  // 厂房沿 z 长 64 → ±x 面是长边、±z 面是端面
  const hallFaces = [wallLong, wallLong, roof, roof, wallEnd, wallEnd]

  _cache = { wallLong, wallEnd, roof, trim, steel, asphalt, hallFaces }
  return _cache
}

/** 围栏材质：按段长算贴图重复，保证网格密度一致 */
function fenceMaterial(len) {
  const m = new THREE.MeshStandardMaterial({
    map: canvasTexture(makeFenceCanvas(), len / 2.6, 1),
    transparent: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0.55,
    color: '#ffffff'
  })
  return m
}

// ---------- 组装 ----------

/**
 * 生成园区的全部静态部件。
 * @returns {{ boxes: Array, fence: Array, panels: object }}
 *   boxes  —— 用同一份单位立方体几何 + scale 变形（跟 buildings.js 一个套路）
 *   fence  —— 围栏段（每段自己的贴图重复，材质单独）
 *   panels —— 屋顶光伏的实例矩阵 / 实例色
 */
export function buildFactoryCampus() {
  const M = materials()
  const boxes = [] // { material, position, scale }
  const box = (material, position, scale) => boxes.push({ material, position, scale })

  const { hallDepth, hallLen, hallH, rows } = CAMPUS

  // ---- 1) 4 排厂房本体 + 女儿墙 ----
  for (let k = 0; k < rows; k++) {
    const cx = hallCenterX(k)
    // 主体（6 面材质：长边 / 端面 / 屋面）
    box(M.hallFaces, [cx, hallH / 2, HALL_CZ], [hallDepth, hallH, hallLen])
    // 屋面找坡层（薄板，压在箱体顶上，给光伏一个明确的基面）
    box(M.roof, [cx, hallH + 0.06, HALL_CZ], [hallDepth + 0.3, 0.12, hallLen + 0.3])
    // 女儿墙四边
    const ph = 0.5
    const pt = 0.26
    const hd = hallDepth / 2
    const hl = hallLen / 2
    for (const s of [-1, 1]) {
      box(M.trim, [cx + s * (hd - pt / 2), hallH + 0.12 + ph / 2, HALL_CZ], [pt, ph, hallLen])
      box(M.trim, [cx, hallH + 0.12 + ph / 2, HALL_CZ + s * (hl - pt / 2)], [hallDepth, ph, pt])
    }
  }

  // ---- 2) 场院硬化（把围栏内的地面压一层深色，读起来是厂区而不是街道） ----
  // 底面抬到 y = 0.02，避免与城市地面（y = 0）共面打架
  const yardW = CAMPUS.maxX - CAMPUS.minX
  const yardD = CAMPUS.maxZ - CAMPUS.minZ
  box(M.asphalt, [(CAMPUS.minX + CAMPUS.maxX) / 2, 0.055, (CAMPUS.minZ + CAMPUS.maxZ) / 2], [
    yardW - 0.6,
    0.07,
    yardD - 0.6
  ])

  // ---- 3) 围栏（唯一缺口在 x = maxX 这条边上） ----
  const fence = []
  const ft = CAMPUS.fenceT
  const fh = CAMPUS.fenceH
  const addFence = (cx, cz, len, alongZ) => {
    fence.push({
      material: fenceMaterial(len),
      position: [cx, fh / 2, cz],
      scale: alongZ ? [ft, fh, len] : [len, fh, ft]
    })
  }
  addFence((CAMPUS.minX + CAMPUS.maxX) / 2, CAMPUS.minZ, yardW, false)
  addFence((CAMPUS.minX + CAMPUS.maxX) / 2, CAMPUS.maxZ, yardW, false)
  addFence(CAMPUS.minX, (CAMPUS.minZ + CAMPUS.maxZ) / 2, yardD, true)

  const g = CAMPUS.gate
  const gz0 = g.z - g.width / 2
  const gz1 = g.z + g.width / 2
  addFence(CAMPUS.maxX, (CAMPUS.minZ + gz0) / 2, gz0 - CAMPUS.minZ, true)
  addFence(CAMPUS.maxX, (gz1 + CAMPUS.maxZ) / 2, CAMPUS.maxZ - gz1, true)

  // ---- 4) 大门：两根门柱 + 横梁 + 门卫房 ----
  box(M.steel, [CAMPUS.maxX, 1.5, gz0], [0.9, 3.0, 0.9])
  box(M.steel, [CAMPUS.maxX, 1.5, gz1], [0.9, 3.0, 0.9])
  box(M.steel, [CAMPUS.maxX, 3.15, g.z], [0.7, 0.42, g.width + 1.2])
  box(M.trim, [CAMPUS.maxX - 3.6, 1.6, gz1 + 3.4], [4.2, 3.2, 3.6])
  box(M.roof, [CAMPUS.maxX - 3.6, 3.32, gz1 + 3.4], [4.8, 0.24, 4.2])

  // ---- 5) 出入口铺装：从大门一直铺到马路边 ----
  box(M.asphalt, [CAMPUS.maxX + 1.1, 0.055, g.z], [2.6, 0.07, g.width])

  return { boxes, fence, panels: layoutRoofPanels() }
}

/** 全部部件共用的单位立方体（靠 scale 变形，与 buildings.js 一个套路） */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)

/** 单位立方体几何（面板 / 立柱之外的方盒都复用它） */
export function campusUnitBox() {
  return UNIT_BOX
}

/** 围栏段是否要投影（贴图带 alphaTest，投影才有镂空感） */
export const CAMPUS_FENCE_ALPHA = true

// ---------- 屋顶光伏 ----------

/** 2D 整数哈希 → [0,1)，给每块板一点明暗差异（与地面电站同一套路） */
function hash01(i) {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(31, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/**
 * 屋顶光伏：低倾角密排，把屋面盖满。
 *
 * 朝向取 YAW = -π/2，即面板局部 +z 指向世界 -x —— 太阳的水平方位在 -129.8°，
 * 与 -x 差 40°；这是刻意的取舍：宁可稍微偏一点太阳，也要让行列与厂房长轴对齐，
 * 否则斜着排会在矩形屋面的四个角留出大片空白，"铺满"就无从谈起。
 */
function layoutRoofPanels() {
  const T = SOLAR_TABLE
  const tilt = CAMPUS.panelTiltDeg * DEG
  const yaw = -Math.PI / 2

  const rows = CAMPUS.panelsPerRow
  const rowSpan = CAMPUS.hallDepth - CAMPUS.panelGapTop * 2
  const rowPitch = rowSpan / rows
  const cols = Math.max(1, Math.floor((CAMPUS.hallLen - 1.6) / CAMPUS.panelColPitch))

  const perHall = rows * cols
  const count = perHall * CAMPUS.rows

  const matrices = new Float32Array(count * 16)
  const tones = new Float32Array(count * 3)
  const base = new THREE.Color(SOLAR_PANEL_TINT)

  const yawM = new THREE.Matrix4().makeRotationY(yaw)
  const tiltM = new THREE.Matrix4().makeRotationX(tilt)
  const scaleM = new THREE.Matrix4().makeScale(T.width, T.thickness, T.slopeLen)
  const liftM = new THREE.Matrix4().makeTranslation(0, CAMPUS.panelLift, 0)
  const local = new THREE.Matrix4().multiplyMatrices(yawM, liftM).multiply(tiltM).multiply(scaleM)

  const place = new THREE.Matrix4()
  const out = new THREE.Matrix4()
  const roofY = CAMPUS.hallH + 0.12

  let i = 0
  for (let k = 0; k < CAMPUS.rows; k++) {
    const cx = hallCenterX(k)
    for (let r = 0; r < rows; r++) {
      const lx = cx + (r - (rows - 1) / 2) * rowPitch
      for (let c = 0; c < cols; c++) {
        const lz = HALL_CZ + (c - (cols - 1) / 2) * CAMPUS.panelColPitch
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
  }

  return { matrices, tones, count, perHall, cols, rowPitch, roofY }
}

/** 面板材质（复用地面电站那份，保证两处观感一致） */
export function campusPanelMaterial() {
  return SOLAR_MATERIALS.panel
}

/** 某排厂房的中心 x（供调试 / 校验） */
export function campusHallCenterX(k) {
  return hallCenterX(k)
}

/** 4 排厂房的世界包围盒（供校验） */
export function campusHallBounds() {
  return Array.from({ length: CAMPUS.rows }, (_, k) => ({
    k,
    centerX: hallCenterX(k),
    minX: hallCenterX(k) - CAMPUS.hallDepth / 2,
    maxX: hallCenterX(k) + CAMPUS.hallDepth / 2,
    minZ: HALL_CZ - CAMPUS.hallLen / 2,
    maxZ: HALL_CZ + CAMPUS.hallLen / 2
  }))
}
