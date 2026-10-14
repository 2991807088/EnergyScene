// ============================================================
//  东缘大型变电站 + 风电 / 光伏 / 火电 / 水电高压进线
//
//  落点：CITY_ZONES.substation（城市东缘，x164..236 / z-56..56 的场区），
//  与上一轮「变电站贴城市边缘」的布置一致，改动该常量即可整体平移。
//
//  复用 substation.js 的视觉语言（pylon 铁塔 / cable 三相架空线 /
//  gantry 进线门架 / insulator 套管），但全部用世界坐标（不再叠加
//  GRID_OFFSET），因为本组件直接在场景里按世界坐标渲染。
//
//  三条架空通道、四个电源：
//    · wind / thermal —— 风电与火电共用东侧主线
//    · solar —— 东缘光伏电站（EAST_SITES.solar）西行进站
//    · hydro —— 长江水电站出线塔沿西、南城界绕行进站
// ============================================================
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { terrainHeight } from './terrain'
import { CITY_HALF, CITY_ZONES, EAST_SITES } from './cityLayout'
import { OUTLINE_TOWER } from './hydropower'

const area = CITY_ZONES.substation
const outsideCity = CITY_HALF + 18 // 铁塔横担也留在城区地面外
const windStationX = EAST_SITES.wind.minX + 10
const windStationZ = EAST_SITES.wind.minZ + 10
const solarStationX = EAST_SITES.solar.minX + 8
const solarStationZ = EAST_SITES.solar.minZ + 6
const thermal = EAST_SITES.thermal
const lerp = (a, b, t) => a + (b - a) * t

function material(color, metalness = 0.25, roughness = 0.7) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness })
}

function labelMaterial(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#173a51'
  ctx.fillRect(0, 0, 512, 128)
  ctx.strokeStyle = '#79cad5'
  ctx.lineWidth = 6
  ctx.strokeRect(4, 4, 504, 120)
  ctx.fillStyle = '#f0f8ff'
  ctx.font = 'bold 56px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 66)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map })
}

// 风/火共用一列铁塔；风电线路第二塔旁接入火电。前两路只在指定点立塔。
export const EAST_GRID_ROUTES = [
  { key: 'wind', points: [[310, windStationZ - 34], [300, thermal.maxZ - 12], [282, 160], [268, 68], [240, 18]], fixedTowers: true },
  { key: 'solar', points: [[310, 40], [270, 4], [240, -18]], fixedTowers: true },
  // 水电改走城区另一侧，避免与风/火主线在东侧并排。
  { key: 'hydro', points: [[OUTLINE_TOWER.x, OUTLINE_TOWER.z], [-outsideCity, -outsideCity], [outsideCity, -outsideCity], [outsideCity, -70], [200, -70]], towerSpacing: 95 }
]

export function buildEastSubstation() {
  const steel = material('#929ea8', 0.72, 0.36)
  const transformer = material('#506878', 0.55, 0.48)
  const ceramic = material('#b3c3c4', 0.12)
  const concrete = material('#b3b5ac', 0.05, 0.92)
  const gravel = material('#777f7c', 0.08, 0.95)
  const wall = material('#d6d8d0', 0.08)
  const roof = material('#476173', 0.3)
  const glass = material('#244b61', 0.4, 0.3)
  const warning = material('#e8b845', 0.15)
  const parts = []
  const linePoints = []
  const wires = []
  const flowLines = []
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const add = (kind, mat, position, scale, rotation) => {
    quaternion.setFromEuler(new THREE.Euler(...(rotation ?? [0, 0, 0])))
    matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale))
    parts.push({ kind, material: mat, matrix: matrix.clone() })
  }
  const box = (mat, position, scale) => add('box', mat, position, scale)
  const cylinder = (mat, position, radius, height, rotation) => add('cylinder', mat, position, [radius, height, radius], rotation)
  const beam = (a, b, radius = 0.14, mat = steel) => {
    const start = new THREE.Vector3(...a)
    const end = new THREE.Vector3(...b)
    const direction = end.clone().sub(start)
    quaternion.setFromUnitVectors(up, direction.clone().normalize())
    matrix.compose(start.add(end).multiplyScalar(0.5), quaternion, new THREE.Vector3(radius, direction.length(), radius))
    parts.push({ kind: 'cylinder', material: mat, matrix: matrix.clone() })
  }
  const line = (a, b) => linePoints.push(...a, ...b)

  const groundSamples = []
  for (let x = area.minX; x <= area.maxX; x += 6) {
    for (let z = area.minZ; z <= area.maxZ; z += 5) groundSamples.push(terrainHeight(x, z))
  }
  const floorY = Math.max(...groundSamples) + 0.35
  const bottomY = Math.min(...groundSamples) - 0.15
  const cx = (area.minX + area.maxX) / 2
  const cz = (area.minZ + area.maxZ) / 2
  const w = area.maxX - area.minX
  const d = area.maxZ - area.minZ

  // 站区地坪 + 碎石
  box(concrete, [cx, (floorY + bottomY) / 2, cz], [w, floorY - bottomY, d])
  box(gravel, [cx, floorY + 0.06, cz], [w - 0.6, 0.12, d - 0.6])

  const insulator = (x, y, z, height = 1.7) => {
    cylinder(steel, [x, y + height / 2, z], 0.16, height)
    for (let i = 0; i < 6; i++) cylinder(ceramic, [x, y + 0.18 + i * height / 6, z], 0.36, 0.13)
  }

  // 控制楼（贴城区一侧，南侧）
  const cbZ = area.minZ + 13
  box(wall, [cx + 28, floorY + 3, cbZ], [16, 6, 10])
  box(roof, [cx + 28, floorY + 6.25, cbZ], [16.8, 0.5, 10.8])
  for (const x of [cx + 23, cx + 27, cx + 31, cx + 35]) box(glass, [x, floorY + 3.1, cbZ - 5.2], [2.3, 1.8, 0.12])
  box(steel, [cx + 34, floorY + 1.5, cbZ - 5.2], [1.7, 3, 0.15])
  box(labelMaterial('大型变电站'), [cx + 28, floorY + 5, cbZ - 5.3], [14, 2.1, 0.08])

  // 两台主变压器：基础、散热片、油枕、三相高压套管
  for (const tz of [-14, 14]) {
    const tx = cx - 18
    box(concrete, [tx, floorY + 0.35, tz], [11, 0.7, 10])
    box(transformer, [tx, floorY + 2.4, tz], [7, 4.2, 6])
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) box(steel, [tx + side * 4.2, floorY + 2.5, tz - 2.6 + i * 0.65], [1.3, 3.8, 0.18])
    }
    cylinder(transformer, [tx, floorY + 5.1, tz + 1.8], 0.65, 6.4, [0, 0, Math.PI / 2])
    for (const x of [tx - 2.2, tx, tx + 2.2]) insulator(x, floorY + 4.5, tz - 1.3, 2)
    box(warning, [tx, floorY + 2.2, tz - 3.06], [1.4, 1, 0.08])
  }

  // 开关场：断路器、隔离开关及三相母线
  for (const bz of [-30, -14, 2, 18, 30]) {
    for (const bx of [cx + 6, cx + 10, cx + 14]) {
      box(concrete, [bx, floorY + 0.3, bz], [2.2, 0.6, 3])
      box(steel, [bx, floorY + 1.5, bz], [1.2, 2.2, 1.5])
      insulator(bx, floorY + 2.6, bz)
      beam([bx, floorY + 4.3, bz], [bx, floorY + 5.3, bz + 1.2], 0.1)
    }
  }
  for (const bx of [cx + 6, cx + 10, cx + 14]) {
    for (const bz of [-34, 34]) {
      cylinder(steel, [bx, floorY + 2.8, bz], 0.22, 5.6)
      insulator(bx, floorY + 5.6, bz, 1.4)
    }
    beam([bx, floorY + 7, -34], [bx, floorY + 7, 34], 0.13)
  }

  // 三相母排（沿 z 贯通开关场，三相位按 x 错开）
  const busPhaseX = [cx + 0.6, cx + 4, cx + 7.4]
  for (const bx of busPhaseX) beam([bx, floorY + 7, -34], [bx, floorY + 7, 34], 0.13)

  // 进线门架
  function gantry(x, z, angle, title) {
    const axis = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle))
    for (const side of [-1, 1]) {
      const px = x + axis.x * side * 5
      const pz = z + axis.z * side * 5
      box(concrete, [px, floorY + 0.3, pz], [2, 0.6, 2])
      cylinder(steel, [px, floorY + 5, pz], 0.2, 10)
    }
    beam([x - axis.x * 5.5, floorY + 10, z - axis.z * 5.5], [x + axis.x * 5.5, floorY + 10, z + axis.z * 5.5], 0.22)
    const sockets = [-3.4, 0, 3.4].map((offset) => {
      const px = x + axis.x * offset
      const pz = z + axis.z * offset
      insulator(px, floorY + 8.5, pz, 1.4)
      return [px, floorY + 8.5, pz]
    })
    box(labelMaterial(title), [x, floorY + 6.5, z - 0.22], [8, 1.7, 0.12])
    return sockets
  }
  const terminals = {
    wind: gantry(area.maxX - 10, 18, 0, '风火进线'),
    solar: gantry(area.maxX - 10, -18, 0, '光伏进线'),
    hydro: gantry(200, area.minZ + 12, 0, '水电进线')
  }

  function pylon(x, z, angle) {
    const y = terrainHeight(x, z)
    const rotate = (px, py, pz) => [x + px * Math.cos(angle) + pz * Math.sin(angle), y + py, z - px * Math.sin(angle) + pz * Math.cos(angle)]
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(concrete, rotate(sx * 2.4, 0.2, sz * 2.4), [1.5, 0.8, 1.5])
        beam(rotate(sx * 2.4, 0.6, sz * 2.4), rotate(sx * 0.65, 25, sz * 0.65), 0.18)
      }
    }
    for (let level = 0; level < 5; level++) {
      const y0 = 1 + level * 4.7
      const y1 = y0 + 4.7
      const w0 = 2.4 - level * 0.35
      const w1 = w0 - 0.35
      for (const side of [-1, 1]) {
        beam(rotate(-w0, y0, side * w0), rotate(w1, y1, side * w1), 0.08)
        beam(rotate(w0, y0, side * w0), rotate(-w1, y1, side * w1), 0.08)
        beam(rotate(side * w0, y0, -w0), rotate(side * w1, y1, w1), 0.08)
        beam(rotate(side * w0, y0, w0), rotate(side * w1, y1, -w1), 0.08)
      }
    }
    beam(rotate(-5.2, 24, 0), rotate(5.2, 24, 0), 0.2)
    beam(rotate(-5.2, 24, 0), rotate(0, 26, 0), 0.12)
    beam(rotate(5.2, 24, 0), rotate(0, 26, 0), 0.12)
    return [-3.4, 0, 3.4].map((offset) => {
      const pos = rotate(offset, 23, 0)
      insulator(pos[0], pos[1], pos[2], 1)
      return pos
    })
  }
  const cable = (a, b, radius = 0.095) => {
    const length = new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))
    const samples = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24
      return new THREE.Vector3(
        THREE.MathUtils.lerp(a[0], b[0], t),
        THREE.MathUtils.lerp(a[1], b[1], t) - Math.min(3.5, length * 0.045) * 4 * t * (1 - t),
        THREE.MathUtils.lerp(a[2], b[2], t)
      )
    })
    const curve = new THREE.CatmullRomCurve3(samples)
    wires.push(new THREE.TubeGeometry(curve, 24, radius, 5, false))
    return curve
  }

  // 门架 → 母排，主变 → 母排
  for (const [key, sockets] of Object.entries(terminals)) {
    const gz = key === 'wind' ? 18 : key === 'solar' ? -18 : -44
    sockets.forEach((socket, phase) => cable(socket, [busPhaseX[phase], floorY + 7, gz], 0.08))
  }
  for (const tz of [-14, 14]) {
    [-2.2, 0, 2.2].forEach((dx, phase) => cable([cx - 18 + dx, floorY + 6.5, tz - 1.3], [busPhaseX[phase], floorY + 7, tz], 0.08))
  }

  // 各路进线：主线只在转向和必要的长跨距处立塔。
  for (const route of EAST_GRID_ROUTES) {
    const routePhases = [0, 1, 2].map((phase) => ({ key: route.key, phase, segments: [], length: 0 }))
    const towerPoints = route.fixedTowers ? route.points.slice(0, -1) : []
    if (!route.fixedTowers) {
      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i]
        const b = route.points[i + 1]
        const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / route.towerSpacing)
        for (let j = 0; j < count; j++) towerPoints.push([lerp(a[0], b[0], j / count), lerp(a[1], b[1], j / count)])
      }
    }
    const sockets = towerPoints.map((point, i) => {
      const next = towerPoints[i + 1] ?? route.points.at(-1)
      return pylon(point[0], point[1], Math.atan2(next[0] - point[0], next[1] - point[1]))
    })
    sockets.push(terminals[route.key])
    if (route.key === 'wind') {
      const roofY = terrainHeight(windStationX, windStationZ) + 5
      box(steel, [windStationX, roofY + 0.2, windStationZ], [9, 0.4, 2])
      for (let phase = 0; phase < 3; phase++) {
        const x = windStationX + (phase - 1) * 3.4
        insulator(x, roofY + 0.4, windStationZ, 1.8)
        const curve = cable([x, roofY + 2.2, windStationZ], sockets[0][phase])
        const length = curve.getLength()
        routePhases[phase].segments.push({ curve, start: 0, length })
        routePhases[phase].length = length
      }
    }
    for (let i = 0; i < sockets.length - 1; i++) {
      for (let phase = 0; phase < 3; phase++) {
        const line = routePhases[phase]
        const curve = cable(sockets[i][phase], sockets[i + 1][phase])
        const length = curve.getLength()
        line.segments.push({ curve, start: line.length, length })
        line.length += length
      }
    }
    flowLines.push(...routePhases)
    if (route.key === 'wind') {
      // 火电贴地接入第二塔，后半段复用风电的实体导线与铁塔。
      const [x, z] = towerPoints[1]
      const y = terrainHeight(x, z)
      box(concrete, [x + 4, y + 0.2, z], [3.6, 0.6, 3.5])
      box(transformer, [x + 4, y + 1.7, z], [2.8, 2.8, 2.7])
      const feederStart = [thermal.minX + 8, thermal.maxZ - 12]
      const feeder = Array.from({ length: 17 }, (_, i) => {
        const t = i / 16
        const px = lerp(feederStart[0], x + 4, t)
        const pz = lerp(feederStart[1], z, t)
        return new THREE.Vector3(px, terrainHeight(px, pz) + 0.3, pz)
      })
      wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(feeder), 24, 0.12, 5, false))
      flowLines.push(...routePhases.map((line) => {
        let length = 0
        const segments = line.segments.slice(2).map((segment) => {
          const shared = { curve: segment.curve, start: length, length: segment.length }
          length += segment.length
          return shared
        })
        return { key: 'thermal', phase: line.phase, segments, length }
      }))
    }
    const [x, z] = route.points[0]
    const y = terrainHeight(x, z)
    if (route.key !== 'wind') {
      box(concrete, [x + 4, y + 0.2, z], [3.6, 0.6, 3.5])
      box(transformer, [x + 4, y + 1.7, z], [2.8, 2.8, 2.7])
    }
    const feederStart = route.key === 'solar' ? [solarStationX, solarStationZ + 5.7] : null
    if (feederStart) {
      // 电站厂房正面经贴地电缆接首塔集电柜，架空线不跨建筑。
      const points = Array.from({ length: 17 }, (_, i) => {
        const t = i / 16
        const px = lerp(feederStart[0], x + 4, t)
        const pz = lerp(feederStart[1], z, t)
        return new THREE.Vector3(px, terrainHeight(px, pz) + 0.3, pz)
      })
      wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.12, 5, false))
    }
  }

  // 站区围栏（南侧留门，朝向城区）
  const fenceSpan = (a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const count = Math.ceil(length / 3)
    for (let i = 0; i <= count; i++) {
      const x = THREE.MathUtils.lerp(a[0], b[0], i / count)
      const z = THREE.MathUtils.lerp(a[1], b[1], i / count)
      cylinder(steel, [x, floorY + 1.4, z], 0.09, 2.8)
    }
    for (const height of [0.4, 1, 1.6, 2.2, 2.7]) line([a[0], floorY + height, a[1]], [b[0], floorY + height, b[1]])
  }
  fenceSpan([area.minX, area.minZ], [area.maxX, area.minZ])
  fenceSpan([area.minX, area.maxZ], [area.maxX, area.maxZ])
  fenceSpan([area.minX, area.minZ], [area.minX, area.maxZ])
  fenceSpan([area.maxX, area.minZ], [area.maxX, area.maxZ])
  box(concrete, [cx, floorY - 0.1, area.minZ + 6], [8, 0.3, 4])

  const wireGeometry = mergeGeometries(wires)
  wires.forEach((geometry) => geometry.dispose())
  const fenceGeometry = new THREE.BufferGeometry()
  fenceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3))
  return { parts, wireGeometry, fenceGeometry, flowLines }
}
