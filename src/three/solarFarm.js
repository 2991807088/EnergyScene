// 东侧规划区的新光伏电站：面板朝 -z 倾斜。
// 支架基准取占地采样的最高地面，柱脚独立贴地；面板和立柱采用实例渲染。
import * as THREE from 'three'
import { terrainHeight } from './terrain'
import { EAST_SITES } from './cityLayout'

const DEG = Math.PI / 180

/** 单张支架（一组面板）的尺寸，单位与场景一致（≈ 米） */
export const SOLAR_TABLE = {
  width: 5.4, // 支架宽（沿排方向）
  slopeLen: 2.3, // 面板斜面长
  thickness: 0.09, // 面板厚度
  tiltDeg: 30, // 倾角（与水平面夹角）
  axisH: 1.0, // 转轴（面板中心）离地高度
  legTopDrop: 0.3, // 立柱顶端比转轴低这么多 —— 顶到转轴高度会直接穿出面板背面
  legInset: 1.7, // 立柱相对支架中心的横向偏移
  legRadius: 0.085,
  legSink: 0.35 // 立柱往地里埋的深度
}

const TILT = SOLAR_TABLE.tiltDeg * DEG

// 一张支架在水平面上的占地半尺寸（取地面基准用）。
// 面板绕转轴倾斜后，斜面半长 2.3/2 投到地面的水平长度是 (2.3/2)·cos30°，
// 再加上板厚半 0.09/2 的贡献 (0.09/2)·sin30°。
const TABLE_HALF_W = SOLAR_TABLE.width / 2
const TABLE_HALF_Z =
  (SOLAR_TABLE.slopeLen * Math.cos(TILT) + SOLAR_TABLE.thickness * Math.sin(TILT)) / 2
/** 占地 3×3 采样点（阵列局部坐标，单位是「半尺寸的倍数」），取地面最高点用 */
const FOOT_GRID = [-1, 0, 1]

// ---------- 单片阵列的配置 ----------

/**
 * @typedef {object} FarmConfig
 * @property {number} cx       阵列中心 X
 * @property {number} cz       阵列中心 Z
 * @property {number} yaw      阵列朝向（绕 Y）
 * @property {number} rows     排数（沿阵列局部 +z 排开）
 * @property {number} cols     每排支架数（沿阵列局部 +x）
 * @property {number} rowPitch 排间距
 * @property {number} colPitch 同排相邻支架间距
 * @property {number} salt     面板色调抖动的随机偏移
 */

/** 东侧独立光伏用地。 */
const EDGE_WIDTH = 132
const EDGE_DEPTH = 58
const EDGE_COLS = Math.round(EDGE_WIDTH / 5.8)
const EDGE_ROWS = 11
// 间距由跨度反算，让最外侧支架与城区两侧边界对齐。
const EDGE_COL_PITCH = (EDGE_WIDTH - SOLAR_TABLE.width) / (EDGE_COLS - 1)
// 一张支架沿 z 的占地 = 斜面在水平面的投影
const EDGE_ROW_PITCH = (EDGE_DEPTH - TABLE_HALF_Z * 2) / (EDGE_ROWS - 1)

const FARM_EDGE = {
  cx: (EAST_SITES.solar.minX + EAST_SITES.solar.maxX) / 2,
  cz: (EAST_SITES.solar.minZ + EAST_SITES.solar.maxZ) / 2,
  yaw: Math.PI, // 行列对齐城市网格；面板往 -z 斜（太阳的 z 分量在 -z 侧）
  rows: EDGE_ROWS,
  cols: EDGE_COLS,
  rowPitch: EDGE_ROW_PITCH,
  colPitch: EDGE_COL_PITCH,
  salt: 1
}

const FARM_CONFIGS = [FARM_EDGE]

/** 新光伏电站的占地（世界 XZ），供校验与调试 */
export const EDGE_FARM_SPAN = {
  x: EDGE_WIDTH,
  z: EDGE_DEPTH,
  nearZ: EAST_SITES.solar.minZ,
  farZ: EAST_SITES.solar.maxZ,
  depth: EDGE_DEPTH
}

/** 该片阵列在局部坐标下的半尺寸（占地判断用） */
function halfExtents(cfg) {
  return {
    halfX: ((cfg.cols - 1) * cfg.colPitch + SOLAR_TABLE.width) / 2,
    halfZ: ((cfg.rows - 1) * cfg.rowPitch + TABLE_HALF_Z * 2) / 2
  }
}

// 半尺寸只跟配置有关，算一次缓存下来
for (const cfg of FARM_CONFIGS) {
  const h = halfExtents(cfg)
  cfg.halfX = h.halfX
  cfg.halfZ = h.halfZ
}

/** 世界坐标 → 某片阵列的局部坐标（R_y(yaw) 的逆） */
function toLocal(cfg, x, z) {
  const dx = x - cfg.cx
  const dz = z - cfg.cz
  const c = Math.cos(cfg.yaw)
  const s = Math.sin(cfg.yaw)
  return { x: dx * c - dz * s, z: dx * s + dz * c }
}

/**
 * 该点是否落在任意一片阵列占地内。
 * 林带撒点会用它避让 —— 否则会有树从面板中间长出来。
 */
export function isInsideSolarFarm(x, z, margin = 0) {
  for (const cfg of FARM_CONFIGS) {
    const p = toLocal(cfg, x, z)
    if (Math.abs(p.x) <= cfg.halfX + margin && Math.abs(p.z) <= cfg.halfZ + margin) return true
  }
  return false
}

// ---------- 材质 ----------
// 面板材质是白的，颜色一律走 instanceColor（和树木一个套路）：
// 白底 + 实例色才能既保留「每张板略有差异」又不炸材质数量
export const SOLAR_MATERIALS = {
  panel: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.16, metalness: 0.35 }),
  leg: new THREE.MeshStandardMaterial({ color: '#a6adb6', roughness: 0.5, metalness: 0.55 })
}

/** 面板基色（深蓝黑，靠低粗糙度吃天空反射出光泽） */
export const SOLAR_PANEL_TINT = '#1b2c49'
const PANEL_LINEAR = new THREE.Color(SOLAR_PANEL_TINT)

/** 2D 整数哈希 → [0,1)，用来给每张板加一点明暗差异 */
function hash01(i, salt) {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(salt, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/**
 * 生成若干片阵列的实例矩阵（一次算完，便于合并成一个 InstancedMesh）。
 *
 * 面板的局部矩阵链（右起先作用）：
 *   缩放成面板尺寸 → 绕转轴倾斜 → 抬到轴高 → 转到阵列朝向
 * 立柱不参与倾斜，始终竖直；每根单独取自己那点的地面高度。
 *
 * @param {FarmConfig[]} configs
 * @returns {{ panelMatrices:Float32Array, legMatrices:Float32Array, tones:Float32Array,
 *             panelCount:number, legCount:number, tables:Array }}
 */
function layoutFarms(configs) {
  const T = SOLAR_TABLE

  // 与朝向无关的几段：先算好，各阵列复用
  const tiltM = new THREE.Matrix4().makeRotationX(TILT)
  const panelScale = new THREE.Matrix4().makeScale(T.width, T.thickness, T.slopeLen)
  const panelLift = new THREE.Matrix4().makeTranslation(0, T.axisH, 0)

  // 立柱顶端高度（相对支架基准面）。
  // 不能顶到 axisH —— 面板只有 0.09 厚，立柱顶端会在面板两面各戳出一圈亮点。
  const legTop = T.axisH - T.legTopDrop

  let panelCount = 0
  let legCount = 0
  for (const cfg of configs) {
    const n = cfg.rows * cfg.cols
    panelCount += n
    legCount += n * 2
  }

  const panelMatrices = new Float32Array(panelCount * 16)
  const legMatrices = new Float32Array(legCount * 16)
  const tones = new Float32Array(panelCount * 3)
  const tables = []

  const offset = new THREE.Vector3()
  const place = new THREE.Matrix4()
  const scratch = new THREE.Matrix4()
  const legScale = new THREE.Matrix4()
  const legLocalVar = new THREE.Matrix4()

  let pi = 0
  let li = 0
  for (let fi = 0; fi < configs.length; fi++) {
    const cfg = configs[fi]
    const yawM = new THREE.Matrix4().makeRotationY(cfg.yaw)
    const cosY = Math.cos(cfg.yaw)
    const sinY = Math.sin(cfg.yaw)
    const panelLocal = new THREE.Matrix4()
      .multiplyMatrices(yawM, panelLift)
      .multiply(tiltM)
      .multiply(panelScale)
    // 固定色调偏移，保证刷新后组件颜色一致。
    const saltLum = 7 + cfg.salt * 1009
    const saltWarm = 11 + cfg.salt * 1009

    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        const lx = (c - (cfg.cols - 1) / 2) * cfg.colPitch
        const lz = (r - (cfg.rows - 1) / 2) * cfg.rowPitch
        offset.set(lx, 0, lz).applyMatrix4(yawM)
        const wx = cfg.cx + offset.x
        const wz = cfg.cz + offset.z

        // 支架基准面 = 占地 3×3 采样点里的最高地面。
        // 面板是刚性的、悬在地面上方，基准面取「最高」才能保证整块板都不入土；
        // 取最低或只取中心，坡地上翘起那一侧的板角就会扎进土里。
        let gy = -Infinity
        for (const gu of FOOT_GRID) {
          for (const gv of FOOT_GRID) {
            const fx = gu * TABLE_HALF_W
            const fz = gv * TABLE_HALF_Z
            gy = Math.max(gy, terrainHeight(wx + cosY * fx + sinY * fz, wz - sinY * fx + cosY * fz))
          }
        }
        tables.push({ farm: fi, x: wx, y: gy, z: wz, lx, lz, row: r, col: c, groundY: gy })

        place.makeTranslation(wx, gy, wz)
        panelMatrices.set(scratch.multiplyMatrices(place, panelLocal).elements, pi * 16)

        // 面板色调抖动：阳光下整片阵列不会是一块死板的纯色
        const lum = 0.86 + 0.3 * hash01(pi, saltLum)
        const warm = (hash01(pi, saltWarm) - 0.5) * 0.14
        tones[pi * 3] = PANEL_LINEAR.r * lum * (1 + warm)
        tones[pi * 3 + 1] = PANEL_LINEAR.g * lum
        tones[pi * 3 + 2] = PANEL_LINEAR.b * lum * (1 - warm * 0.6)

        for (const sx of [-1, 1]) {
          offset.set(lx + sx * T.legInset, 0, lz).applyMatrix4(yawM)
          const lxw = cfg.cx + offset.x
          const lzw = cfg.cz + offset.z
          // 柱脚落到「立柱自己那点的地面」与支架基准面里更低的那一个以下 legSink；
          // 柱顶挂在支架基准面上。柱长逐根算 → 坡地上既不悬空也不顶穿面板。
          const botY = Math.min(terrainHeight(lxw, lzw), gy) - T.legSink
          const topY = gy + legTop
          legScale.makeScale(1, topY - botY, 1)
          legLocalVar.multiplyMatrices(yawM, legScale)
          place.makeTranslation(lxw, (topY + botY) / 2, lzw)
          legMatrices.set(scratch.multiplyMatrices(place, legLocalVar).elements, li * 16)
          li++
        }

        pi++
      }
    }
  }

  return { panelMatrices, legMatrices, tones, panelCount, legCount, tables }
}

/** 城市 +z 边的大型电站 */
export function layoutEdgeFarm() {
  return layoutFarms([FARM_EDGE])
}

/** 大型电站的实例数据，组件以两次 draw call 渲染面板与立柱。 */
export function layoutAllFarms() {
  return layoutFarms(FARM_CONFIGS)
}
