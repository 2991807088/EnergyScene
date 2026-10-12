import * as THREE from 'three'
import {
  GROUND_SIZE, GRID_MIN, GRID_MAX, ROAD_LINES, LOCAL_ROAD_LINES,
  ROAD_WIDTH, ASPHALT, PARK_AREAS,
  verticalRoadX, horizontalRoadZ, mulberry32
} from './cityLayout'
import { CAMPUS, CAMPUS_OFFSET, isInsideCampus } from './factoryCampus'
import { CHARGING, CHARGING_OFFSET, isInsideChargingStation } from './chargingStation'

const HALF = GROUND_SIZE / 2
const shifted = (area, offset) => ({
  minX: area.minX + offset.x, maxX: area.maxX + offset.x,
  minZ: area.minZ + offset.z, maxZ: area.maxZ + offset.z
})
const RESERVED = [shifted(CAMPUS, CAMPUS_OFFSET), shifted(CHARGING, CHARGING_OFFSET), ...PARK_AREAS]

function roadSegments(axis, coordinate, major) {
  let segments = [[GRID_MIN, GRID_MAX]]
  if (major) return segments
  for (const area of RESERVED) {
    const fixed = axis === 'z' ? [area.minX, area.maxX] : [area.minZ, area.maxZ]
    if (coordinate < fixed[0] - 2 || coordinate > fixed[1] + 2) continue
    const lo = (axis === 'z' ? area.minZ : area.minX) - 1
    const hi = (axis === 'z' ? area.maxZ : area.maxX) + 1
    segments = segments.flatMap(([a, b]) => {
      if (b <= lo || a >= hi) return [[a, b]]
      return [...(a < lo ? [[a, lo]] : []), ...(b > hi ? [[hi, b]] : [])]
    })
  }
  return segments
}

export const CITY_ROADS = [
  ...ROAD_LINES.map((n) => ({ n, major: true })),
  ...LOCAL_ROAD_LINES.map((n) => ({ n, major: false }))
].flatMap(({ n, major }) => ['x', 'z'].map((axis) => {
  const coordinate = axis === 'z' ? verticalRoadX(n) : horizontalRoadZ(n)
  return { axis, coordinate, major, width: major ? ROAD_WIDTH : 4, asphalt: major ? ASPHALT : 2.8, segments: roadSegments(axis, coordinate, major) }
}))

/** 分区道路、街区庭院与公园，一张纹理覆盖整城，铺装接缝只出现在人行道。 */
export function createCityTexture(size = 4096) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const scale = size / GROUND_SIZE
  const X = (x) => (x + HALF) * scale
  const Y = (z) => (z + HALF) * scale
  const rect = (x, z, w, d, color) => {
    ctx.fillStyle = color
    ctx.fillRect(X(x), Y(z), w * scale, d * scale)
  }
  const rand = mulberry32(4242)
  rect(-HALF, -HALF, GROUND_SIZE, GROUND_SIZE, '#899181')
  // 地块以真实道路围合边界划分，不再每 16 单位画一个铺装方格。
  const streetsX = CITY_ROADS.filter((r) => r.axis === 'z').sort((a, b) => a.coordinate - b.coordinate)
  const streetsZ = CITY_ROADS.filter((r) => r.axis === 'x').sort((a, b) => a.coordinate - b.coordinate)
  const plots = ['#9a9e92', '#a0a398', '#949d91', '#a4a69a']
  for (let n = 0; n < streetsX.length - 1; n++) {
    for (let m = 0; m < streetsZ.length - 1; m++) {
      const left = streetsX[n], right = streetsX[n + 1]
      const top = streetsZ[m], bottom = streetsZ[m + 1]
      const x = left.coordinate + left.width / 2 + 0.25
      const z = top.coordinate + top.width / 2 + 0.25
      const w = right.coordinate - right.width / 2 - 0.25 - x
      const d = bottom.coordinate - bottom.width / 2 - 0.25 - z
      if (isInsideCampus(x + w / 2, z + d / 2) || isInsideChargingStation(x + w / 2, z + d / 2)) continue
      rect(x, z, w, d, plots[Math.floor(rand() * plots.length)])
      if (w > 20 && d > 20) rect(x + 1, z + 1, w - 2, 1.5, '#6b805d')
    }
  }
  const parks = [{ minX: -13, maxX: 13, minZ: -13, maxZ: 13 }, ...PARK_AREAS]
  for (const p of parks) {
    rect(p.minX, p.minZ, p.maxX - p.minX, p.maxZ - p.minZ, '#617d54')
    rect((p.minX + p.maxX) / 2 - 0.75, p.minZ, 1.5, p.maxZ - p.minZ, '#b9b5a3')
    rect(p.minX, (p.minZ + p.maxZ) / 2 - 0.75, p.maxX - p.minX, 1.5, '#b9b5a3')
  }
  for (let i = 0; i < 16000; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'
    ctx.fillRect(rand() * size, rand() * size, 2, 2)
  }
  const strip = (road, lo, hi, width, offset, color) => {
    if (road.axis === 'z') rect(road.coordinate + offset - width / 2, lo, width, hi - lo, color)
    else rect(lo, road.coordinate + offset - width / 2, hi - lo, width, color)
  }
  // 人行道先铺，路口沥青后铺，避免路缘横穿交叉口。
  for (const road of CITY_ROADS) {
    for (const [lo, hi] of road.segments) strip(road, lo - road.width / 2, hi + road.width / 2, road.width, 0, '#bbbcb5')
  }
  for (const road of CITY_ROADS) {
    for (const [lo, hi] of road.segments) strip(road, lo - road.asphalt / 2, hi + road.asphalt / 2, road.asphalt, 0, road.major ? '#343a3d' : '#454b4b')
  }
  const contains = (road, v) => road.segments.some(([lo, hi]) => v >= lo && v <= hi)
  const intersections = (road) => CITY_ROADS.filter((other) => other.axis !== road.axis && contains(other, road.coordinate) && contains(road, other.coordinate))
  const paintable = (road, along) => !intersections(road).some((other) => Math.abs(along - other.coordinate) < other.width / 2 + 0.4)
  for (const road of CITY_ROADS) {
    for (const [lo, hi] of road.segments) {
      for (let v = lo; v < hi; v += 0.6) {
        if (!paintable(road, v)) continue
        for (const side of [-1, 1]) {
          strip(road, v, Math.min(v + 0.6, hi), 0.08, side * (road.asphalt / 2 - 0.15), '#c9cdcb')
          if (road.major) strip(road, v, Math.min(v + 0.6, hi), 0.065, side * 0.1, '#d8bc68')
        }
        if (!road.major && Math.floor((v - lo) / 0.6) % 4 < 2) strip(road, v, Math.min(v + 0.6, hi), 0.07, 0, '#b9c1bf')
      }
      // 人行道的分缝限于路旁，不覆盖街区地面。
      for (let v = lo + 1; v < hi; v += 2) {
        if (!paintable(road, v)) continue
        const curb = (road.width - road.asphalt) / 2
        for (const side of [-1, 1]) strip(road, v, v + 0.04, curb, side * (road.asphalt / 2 + curb / 2), '#969d98')
      }
    }
  }
  const verticals = CITY_ROADS.filter((r) => r.axis === 'z')
  const horizontals = CITY_ROADS.filter((r) => r.axis === 'x')
  for (const v of verticals) for (const h of horizontals) {
    const x = v.coordinate, z = h.coordinate
    if (!contains(v, z) || !contains(h, x)) continue
    // 支路路口只保留标线，主干道交叉口补充斑马线和停止线。
    if (!v.major && !h.major) continue
    for (const sign of [-1, 1]) {
      if (contains(v, z + sign * (h.width / 2 + 2.4))) {
        for (let dx = -v.asphalt / 2 + 0.2; dx < v.asphalt / 2 - 0.2; dx += 0.6) rect(x + dx, z + sign * (h.width / 2 + 1.3) - 0.6, 0.32, 1.2, '#e1e2db')
        rect(sign < 0 ? x - v.asphalt / 2 : x, z + sign * (h.width / 2 + 2.4) - 0.08, v.asphalt / 2, 0.16, '#e1e2db')
      }
      if (contains(h, x + sign * (v.width / 2 + 2.4))) {
        for (let dz = -h.asphalt / 2 + 0.2; dz < h.asphalt / 2 - 0.2; dz += 0.6) rect(x + sign * (v.width / 2 + 1.3) - 0.6, z + dz, 1.2, 0.32, '#e1e2db')
        rect(x + sign * (v.width / 2 + 2.4) - 0.08, sign < 0 ? z : z - h.asphalt / 2, 0.16, h.asphalt / 2, '#e1e2db')
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}
