// ============================================================
//  城北电站选址与场地平整（城市北侧平原）
//
//  柴发站与火电站沿城市北缘向东展开，共用一块台地和进场道路。
//
//  平整方式（台地式，不是削平整个山坡）：
//    · 厂区内部压到 padH = 1.4
//    · 边界外 26m 内平滑混回自然地形，读起来是「山坡里切出一块台地」
//    · 连接道路沿 x = 16（正对城市中心北干道）从城市北缘铺到厂区大门，
//      路面高度从 0 渐变到 padH，走廊同样做地形平整
//
//  本模块不 import terrain.js（terrain.js 反而 import 这里），避免循环依赖。
// ============================================================

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 厂区（自然地面要压平的矩形） */
export const NORTH_SITE = {
  minX: -30,
  maxX: 162,
  minZ: -238,
  maxZ: -186,
  padH: 1.4, // 两座厂房共用的台地标高
  blend: 26 // 边界外多远混回自然地形
}

/** 连接道路：城市北缘 → 厂区大门（大门开在南边界，正对 x = 16） */
export const NORTH_ROAD = {
  x: 16,
  fromZ: -163.2, // 稍稍压进城市地面一点，避免接缝
  toZ: -192, // 一直铺进厂区大门（围栏在 -189，门内再送 3m）
  halfW: 3.4, // 路面半宽（比城内 5.6 路略宽，含路缘）
  blend: 9 // 走廊两侧多远混回自然地形
}

/** 点到矩形的距离（矩形内为 0） */
function rectDist(x, z, r) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX)
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ)
  return Math.hypot(dx, dz)
}

/** 厂址平整系数：1 = 完全压在台地标高，0 = 保持自然地形 */
export function northSiteFactor(x, z) {
  return 1 - smoothstep(0, NORTH_SITE.blend, rectDist(x, z, NORTH_SITE))
}

/** 道路纵断目标高度：城市端 0 → 厂区端 padH（缓坡，全程约 4.8% 坡度） */
export function northRoadHeight(z) {
  return NORTH_SITE.padH * smoothstep(NORTH_ROAD.fromZ, NORTH_ROAD.toZ, z)
}

/** 道路走廊平整系数 */
export function northRoadFactor(x, z) {
  if (z < NORTH_ROAD.toZ - 2 || z > NORTH_ROAD.fromZ + 2) return 0
  const dt = Math.abs(x - NORTH_ROAD.x)
  const across = 1 - smoothstep(NORTH_ROAD.halfW, NORTH_ROAD.halfW + NORTH_ROAD.blend, dt)
  // 两端头也收一下，别让平整区在路尾切出陡坎
  const along =
    smoothstep(NORTH_ROAD.toZ - 2, NORTH_ROAD.toZ + 4, z) *
    (1 - smoothstep(NORTH_ROAD.fromZ - 4, NORTH_ROAD.fromZ + 2, z))
  return across * along
}

/**
 * 对自然地形高度应用厂址 + 道路平整。
 * @param {number} h 自然地形高度
 */
export function flattenNorthSite(x, z, h) {
  const fs = northSiteFactor(x, z)
  if (fs > 0) h = h + (NORTH_SITE.padH - h) * fs
  const fr = northRoadFactor(x, z)
  if (fr > 0) h = h + (northRoadHeight(z) - h) * fr
  return h
}

/**
 * 树木 / 其它撒点模块的避让判定。
 * @param margin 厂址矩形外扩余量；道路走廊固定按 halfW + 2 避让
 */
export function isInsideNorthSite(x, z, margin = 0) {
  if (rectDist(x, z, NORTH_SITE) <= margin) return true
  const r = NORTH_ROAD
  return (
    z >= r.toZ - 2 &&
    z <= r.fromZ + 2 &&
    Math.abs(x - r.x) <= r.halfW + 2
  )
}
