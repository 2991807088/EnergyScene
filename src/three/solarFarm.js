// ============================================================
//  光伏电站：选址 / 朝向 / 支架布置
//
//  两片阵列，共用同一套支架尺寸与材质：
//
//  1) 小阵列 SOLAR_FARM_CENTER (172.44, 175.92)
//     —— 用户截图里红箭头尖端的反投影。相机位姿由城市轮廓拟合得到
//        （逐行左右边界残差 ~4px / 1920px），再用射线与真实地形高度场求交。
//
//  2) 城市 +z 边的大型电站 FARM_EDGE (0, 145)
//     —— 用户第二张俯视截图里红框的位置。红框是画在城市"远端边"上的一个矩形，
//        把该截图的相机反解一遍（城市四条边线求交得四角 → 单应 → 8 种角点对应里
//        用已知的小阵列世界坐标挑出正确的那一组，误差 10.7 世界单位）后确认：
//        红框贴着的正是世界 z = +100 这条边，横向覆盖 x ∈ [-100, 100]，
//        向外延伸约 90。于是这片电站按「宽度 = 城市宽度 200」建成；
//        朝向取 yaw = π（行列对齐城市网格），面板往 -z 斜 —— 太阳水平方位
//        (-0.638, -0.770) 的 z 分量就在 -z 侧，倾角不会被白斜。
//        该方位离山脊带中心（RANGE_AZIMUTH ≈ -129.8°，跨度 ±77°）还有 140°，
//        地形只有 PLAIN_HEIGHT 级的低缓起伏，不会贴到山。
//
//  不写死朝向：小阵列局部 +z 指向太阳水平方位（φ = π/2 − 太阳方位），
//  以后改太阳方向，阵列会自己跟着转。
//
//  落地规则（两片阵列同一条规则，坡地上才不会出洋相）：
//  - 支架基准面 = 该支架「占地 3×3 采样点里的最高地面」。面板是刚性的、
//    悬在地面之上，基准取最高才能保证整块板都不入土；只按中心点取高度的话，
//    坡地上翘起那一侧的板角会扎进土里（城边这块地最陡 18%，实测能埋 0.5）。
//  - 立柱顶端挂在支架基准面上（低于面板背面 legTopDrop，不会捅穿面板），
//    柱脚落到「立柱自己那点的地面」以下 legSink —— 柱长逐根算，
//    坡地上既不悬空，也不会为了够地面而顶穿面板。
//
//  输出实例矩阵：整片电站只要 2 次 draw call（面板 + 立柱）。
// ============================================================
import * as THREE from 'three'
import { terrainHeight } from './terrain'
import { SUN_DIRECTION } from './environments'

const DEG = Math.PI / 180

/** 小阵列中心（世界 XZ）—— 红箭头尖端与地形求交的结果 */
export const SOLAR_FARM_CENTER = { x: 172.44, z: 175.92 }

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

/**
 * 太阳水平方位（rad）。
 * 小阵列局部 +z 指向它 → 面板法线自然朝太阳倾斜。
 * 这里推出 -129.8°，与地形里的 RANGE_AZIMUTH（山脊带中心）同向。
 */
const SUN_AZIMUTH = Math.atan2(SUN_DIRECTION[2], SUN_DIRECTION[0])

/**
 * 小阵列朝向：Y 轴旋转把局部 (0,0,1) 映到 (sinφ, 0, cosφ)。
 * 令它等于太阳水平方向 (cos az, 0, sin az)，解得 φ = π/2 − az。
 */
export const SOLAR_FARM_YAW = Math.PI / 2 - SUN_AZIMUTH

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
 * @property {number} salt     面板色调抖动用的盐，避免两片阵列的冷暖完全一样
 */

/** 1) 小阵列 —— 逐位保持原样（尺寸、格数、随机盐都没动） */
const FARM_SMALL = {
  cx: SOLAR_FARM_CENTER.x,
  cz: SOLAR_FARM_CENTER.z,
  yaw: SOLAR_FARM_YAW,
  rows: 7,
  cols: 11,
  rowPitch: 5.6,
  colPitch: 5.8,
  salt: 0
}

/** 2) 城市 +z 边的大型电站 —— 宽度锁死等于城市宽度 */
const EDGE_WIDTH = 200 // 与城市地面同宽
const EDGE_DEPTH = 90 // 从城边往 +z 铺出去多深
const EDGE_GAP = 1 // 与城市地面边留 1 的缝，免得和地面边线糊在一起
const EDGE_COLS = 34
const EDGE_ROWS = 16
// 间距由「跨度」反算，保证最外侧支架的外缘正好落在 x = ±100
const EDGE_COL_PITCH = (EDGE_WIDTH - SOLAR_TABLE.width) / (EDGE_COLS - 1)
// 一张支架沿 z 的占地 = 斜面在水平面的投影
const EDGE_ROW_PITCH = (EDGE_DEPTH - TABLE_HALF_Z * 2) / (EDGE_ROWS - 1)

const FARM_EDGE = {
  cx: 0,
  cz: 100 + EDGE_GAP + EDGE_DEPTH / 2, // 近端贴城边，往 +z 铺 EDGE_DEPTH
  yaw: Math.PI, // 行列对齐城市网格；面板往 -z 斜（太阳的 z 分量在 -z 侧）
  rows: EDGE_ROWS,
  cols: EDGE_COLS,
  rowPitch: EDGE_ROW_PITCH,
  colPitch: EDGE_COL_PITCH,
  salt: 1
}

/** 全部阵列，顺序固定：小阵列在前，保证它的实例下标不变 */
const FARM_CONFIGS = [FARM_SMALL, FARM_EDGE]

/** 城市 +z 电站的占地（世界 XZ），供校验与调试 */
export const EDGE_FARM_SPAN = {
  x: EDGE_WIDTH,
  z: EDGE_DEPTH,
  nearZ: 100 + EDGE_GAP,
  farZ: 100 + EDGE_GAP + EDGE_DEPTH,
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

/** 世界坐标 → 小阵列局部坐标（R_y(yaw) 的逆） */
export function toFarmLocal(x, z) {
  return toLocal(FARM_SMALL, x, z)
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

/** 小阵列占地（世界 XZ 的半尺寸，供调试与校验用） */
export const SOLAR_FARM_FOOTPRINT = { halfX: FARM_SMALL.halfX, halfZ: FARM_SMALL.halfZ }

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
    // 色调的盐错开，免得两片阵列前几十张板颜色完全撞上
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

/** 小阵列（原样，供校验/复用） */
export function layoutSolarFarm() {
  return layoutFarms([FARM_SMALL])
}

/** 城市 +z 边的大型电站 */
export function layoutEdgeFarm() {
  return layoutFarms([FARM_EDGE])
}

/** 全部阵列合并成一份实例数据 —— 组件只用这一个，2 次 draw call 画完两片 */
export function layoutAllFarms() {
  return layoutFarms(FARM_CONFIGS)
}
