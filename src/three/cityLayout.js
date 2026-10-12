// ============================================================
//  城市布局坐标（与地面纹理的街道网格对齐）
//  地面 200×200、街区边长 16 → 每轴 12 个街区。
//  道路带以网格线为中心：路面总宽 ROAD_WIDTH（含两侧人行道）。
//  下列公式据此推导出「道路中心线」和「街区中心」的世界坐标。
//  （世界坐标 = 网格坐标，两者的正中心都在原点。）
// ============================================================

export const GROUND_SIZE = 200 // 城市地面边长（世界单位）
export const TILE = 16 // 街区边长
export const GRID_MIN = -96 // 最外一条网格线
export const GRID_MAX = 96
export const GRID_N = 12 // 网格线序号 0..12 → 13 条线 → 12×12 个街区

export const ROAD_WIDTH = 3.6 // 路缘石外包宽度（含两侧人行道）
export const CURB = 0.45 // 单侧人行道宽
export const ASPHALT = ROAD_WIDTH - CURB * 2 // 沥青面宽度 = 2.7

export const ROAD_MIN = GRID_MIN
export const ROAD_MAX = GRID_MAX

/**
 * 真正铺出来的干道（网格线序号）。
 *
 * 当前三条彼此正交的「组」：
 *   1. 中心十字 —— 竖路 x = ±16（n = 5、7）、横路 z = ±16（n = 5、7）
 *   2. 环城路   —— 竖路 x = ±96（n = 0、12）、横路 z = ±96（n = 0、12）
 *
 * 环城路四条边首尾相接，围成 192×192 的矩形，正好贴着城市地面（200×200）内沿，
 * 也就是「围绕城市一圈」。它同时与中心四干道的两端相接，形成完整的路网。
 *
 * 历史版本：n = 0..12 全铺（两轴各 13 条 = 26 条，太密）→ 只留中心 4 条 → 本轮加回最外一圈。
 * 注意这里只管「路的面」：街区中心 blockCenterX/Z 仍按 16 的网格走，建筑与树木落位不受影响。
 * （最外街区中心在 ±88，建筑半宽最大 ≈5.3 → 外沿 ±93.3；路面内沿 ±94.65，还留 1.35 的余量。）
 */
export const ROAD_LINES = [0, 5, 7, 12]

/** 竖道路（沿 z 延伸）中心线 x，n = 0..12 */
export const verticalRoadX = (n) => GRID_MIN + n * TILE

/** 横道路（沿 x 延伸）中心线 z，n = 0..12 */
export const horizontalRoadZ = (n) => GRID_MAX - n * TILE

/** 街区中心 x，n = 0..11 */
export const blockCenterX = (n) => GRID_MIN + TILE / 2 + n * TILE

/** 街区中心 z，n = 0..11 */
export const blockCenterZ = (n) => GRID_MAX - TILE / 2 - n * TILE

/**
 * 装红绿灯的路口（网格线序号对）—— 所有干道两两相交处，共 ROAD_LINES² = 16 个：
 *   · 中心十字四角     (±16, ±16)  ← 原有 4 个
 *   · 环城路四个转角   (±96, ±96)  ← 新增
 *   · 环城路×中心干道  (±96, ±16) / (±16, ±96)  ← 新增 8 个
 *
 * 不写死，跟着 ROAD_LINES 走：以后增删干道时红绿灯自动同步。
 */
export const SIGNAL_JUNCTIONS = ROAD_LINES.flatMap((a) =>
  ROAD_LINES.map((b) => [a, b])
)

/** 可复现伪随机数 */
export function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
