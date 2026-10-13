// 城区布局的统一坐标：30×30 个街区，外围留出路缘空间。
export const GROUND_SIZE = 500
export const CITY_HALF = GROUND_SIZE / 2 + 1
export const CITY_EXPANSION = (GROUND_SIZE - 200) / 2
export const TILE = 16
export const GRID_N = 30
export const GRID_MIN = -GRID_N * TILE / 2
export const GRID_MAX = -GRID_MIN
export const ROAD_WIDTH = 5.6
export const CURB = 0.8
export const ASPHALT = ROAD_WIDTH - CURB * 2
export const ROAD_MIN = GRID_MIN
export const ROAD_MAX = GRID_MAX

// 外环、分区主干道与中心道路；支路在场站边界处停止。
export const ROAD_LINES = [0, ...Array.from({ length: 6 }, (_, i) => i * 4 + 5), GRID_N]
export const CORE_ROAD_LINES = [13, 17]
export const LOCAL_ROAD_LINES = []
export const verticalRoadX = (n) => GRID_MIN + n * TILE
export const horizontalRoadZ = (n) => GRID_MAX - n * TILE
export const blockCenterX = (n) => GRID_MIN + TILE / 2 + n * TILE
export const blockCenterZ = (n) => GRID_MAX - TILE / 2 - n * TILE
export const SIGNAL_JUNCTIONS = ROAD_LINES.flatMap((a) => ROAD_LINES.map((b) => [a, b]))

/** 西侧纵向公园；地面、树木和水系共用这一块边界。 */
export const CENTRAL_PARK = {
  minX: -92,
  maxX: -36,
  minZ: -92,
  maxZ: 28
}

export const ATHLETICS_TRACK = {
  x: (CENTRAL_PARK.minX + CENTRAL_PARK.maxX) / 2,
  z: -2,
  halfWidth: 19,
  halfLength: 29
}

export function isInsideTrack(x, z, margin = 0) {
  const dx = Math.abs(x - ATHLETICS_TRACK.x)
  const dz = Math.abs(z - ATHLETICS_TRACK.z)
  const straight = ATHLETICS_TRACK.halfLength - ATHLETICS_TRACK.halfWidth
  return Math.hypot(dx, Math.max(0, dz - straight)) <= ATHLETICS_TRACK.halfWidth + margin
}

export const PARK_AREAS = []
// 规划图的左侧主城：五列、五行；东侧另设两块工厂及风光电站。
// 垃圾焚烧电站顶北缘（z -236..-180）、变电站顶东缘（x 164..236）——
// 两处污染/高压场站贴城市边缘布置，住宅街区避开场站占地。
export const CITY_ZONES = {
  charging: { minX: -92, maxX: 28, minZ: -156, maxZ: -100 },
  incineration: { minX: 36, maxX: 156, minZ: -236, maxZ: -180 },
  park: CENTRAL_PARK,
  mall: { minX: -92, maxX: -36, minZ: 36, maxZ: 92 },
  business: { minX: -28, maxX: 28, minZ: -92, maxZ: 92 },
  substation: { minX: 164, maxX: 236, minZ: -56, maxZ: 56 },
  diesel: { minX: 100, maxX: 156, minZ: 36, maxZ: 92 }
}

const EAST_SITE_MIN_X = GROUND_SIZE / 2 + 80
const EAST_SITE_MAX_X = EAST_SITE_MIN_X + 142
export const EAST_SITES = {
  factoryNorth: { minX: EAST_SITE_MIN_X, maxX: EAST_SITE_MAX_X, minZ: -156, maxZ: -101 },
  factorySouth: { minX: EAST_SITE_MIN_X, maxX: EAST_SITE_MAX_X, minZ: -93, maxZ: -38 },
  solar: { minX: EAST_SITE_MIN_X, maxX: EAST_SITE_MAX_X, minZ: -30, maxZ: 38 },
  wind: { minX: EAST_SITE_MIN_X, maxX: EAST_SITE_MAX_X, minZ: 46, maxZ: 156 }
}
export const inArea = (x, z, area, margin = 0) =>
  x >= area.minX - margin && x <= area.maxX + margin &&
  z >= area.minZ - margin && z <= area.maxZ + margin
export function cityZone(x, z) {
  for (const [name, area] of Object.entries(EAST_SITES)) {
    if (inArea(x, z, area)) return name
  }
  for (const [name, area] of Object.entries(CITY_ZONES)) {
    if (inArea(x, z, area)) return name
  }
  return 'residential'
}
export const isParkBlock = (x, z) =>
  inArea(x, z, CENTRAL_PARK)

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
