// 城区布局的统一坐标：20×20 个街区，外围留出路缘空间。
export const GROUND_SIZE = 328
export const CITY_HALF = GROUND_SIZE / 2 + 1
export const CITY_EXPANSION = (GROUND_SIZE - 200) / 2
export const TILE = 16
export const GRID_N = 20
export const GRID_MIN = -GRID_N * TILE / 2
export const GRID_MAX = -GRID_MIN
export const ROAD_WIDTH = 5.6
export const CURB = 0.8
export const ASPHALT = ROAD_WIDTH - CURB * 2
export const ROAD_MIN = GRID_MIN
export const ROAD_MAX = GRID_MAX

// 外环、分区主干道与中心道路；支路在场站边界处停止。
export const ROAD_LINES = [0, 5, 9, 11, 15, 20]
export const CORE_ROAD_LINES = [9, 11]
export const LOCAL_ROAD_LINES = [2, 7, 13, 18]
export const verticalRoadX = (n) => GRID_MIN + n * TILE
export const horizontalRoadZ = (n) => GRID_MAX - n * TILE
export const blockCenterX = (n) => GRID_MIN + TILE / 2 + n * TILE
export const blockCenterZ = (n) => GRID_MAX - TILE / 2 - n * TILE
export const SIGNAL_JUNCTIONS = ROAD_LINES.flatMap((a) => ROAD_LINES.map((b) => [a, b]))

export const PARK_AREAS = [
  { minX: 104, maxX: 152, minZ: 104, maxZ: 152 },
  { minX: -152, maxX: -104, minZ: -152, maxZ: -104 }
]
export const isParkBlock = (x, z) =>
  Math.max(Math.abs(x), Math.abs(z)) < 15 ||
  PARK_AREAS.some((p) => x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ)

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
