import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pickTurbineSpots, terrainHeight } from './terrain'
import { CITY_EXPANSION } from './cityLayout'

export const GRID_OFFSET = { x: -CITY_EXPANSION, z: CITY_EXPANSION }
const groundHeight = (x, z) => terrainHeight(x + GRID_OFFSET.x, z + GRID_OFFSET.z)

// 大型光伏阵列的 -x 侧，即俯视截图中红框所在的城外空地。
export const SUBSTATION = { minX: -178, maxX: -124, minZ: 126, maxZ: 176 }
const windSpots = pickTurbineSpots()

// 线路沿城区及光伏阵列外缘布置，不把铁塔种在道路或组件上。
export const GRID_ROUTES = [
  // 山地风机在首塔处汇集，经三座塔接入变电站。
  { key: 'wind', points: [[-206, 16], [-204, 64], [-187, 106], [-152, 128]] },
  { key: 'solar-main', points: [[-108, 166], [-126, 150]] },
  { key: 'solar-roof', points: [[-109, 56], [-112, 104], [-135, 128]] }
]

function distanceToSpan(x, z, a, b) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1)
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)
}

export function isInsideEnergyGrid(x, z, margin = 3) {
  if (windSpots.some((spot) => Math.hypot(x - spot.x, z - spot.z) < 5 + margin)) return true
  x -= GRID_OFFSET.x
  z -= GRID_OFFSET.z
  const s = SUBSTATION
  if (x >= s.minX - margin && x <= s.maxX + margin && z >= s.minZ - margin && z <= s.maxZ + margin) return true
  return GRID_ROUTES.some(({ points }) => points.slice(1).some((b, i) => distanceToSpan(x, z, points[i], b) < 5 + margin))
}

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

export function buildSubstation() {
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
  const s = SUBSTATION
  const groundSamples = []
  for (let x = s.minX; x <= s.maxX; x += 6) {
    for (let z = s.minZ; z <= s.maxZ; z += 5) groundSamples.push(groundHeight(x, z))
  }
  const floorY = Math.max(...groundSamples) + 0.35
  const bottomY = Math.min(...groundSamples) - 0.15
  const cx = (s.minX + s.maxX) / 2
  const cz = (s.minZ + s.maxZ) / 2
  box(concrete, [cx, (floorY + bottomY) / 2, cz], [54, floorY - bottomY, 50])
  box(gravel, [cx, floorY + 0.06, cz], [53.4, 0.12, 49.4])

  // 控制楼、门窗及面向城区的站名牌。
  box(wall, [-167, floorY + 3, 136], [14, 6, 9])
  box(roof, [-167, floorY + 6.25, 136], [14.8, 0.5, 9.8])
  for (const x of [-172, -168, -164]) box(glass, [x, floorY + 3.1, 131.45], [2.3, 1.8, 0.12])
  box(steel, [-161, floorY + 1.5, 131.4], [1.7, 3, 0.15])
  box(labelMaterial('新能源变电站'), [-167, floorY + 5, 131.32], [12.5, 2.1, 0.08])

  const insulator = (x, y, z, height = 1.7) => {
    cylinder(steel, [x, y + height / 2, z], 0.16, height)
    for (let i = 0; i < 6; i++) cylinder(ceramic, [x, y + 0.18 + i * height / 6, z], 0.36, 0.13)
  }

  // 两台主变压器：基础、散热片、油枕和三相高压套管。
  for (const z of [145, 161]) {
    box(concrete, [-152, floorY + 0.35, z], [11, 0.7, 10])
    box(transformer, [-152, floorY + 2.4, z], [7, 4.2, 6])
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) box(steel, [-152 + side * 4.2, floorY + 2.5, z - 2.6 + i * 0.65], [1.3, 3.8, 0.18])
    }
    cylinder(transformer, [-152, floorY + 5.1, z + 1.8], 0.65, 6.4, [0, 0, Math.PI / 2])
    for (const x of [-154.2, -152, -149.8]) insulator(x, floorY + 4.5, z - 1.3, 2)
    box(warning, [-152, floorY + 2.2, z - 3.06], [1.4, 1, 0.08])
  }

  // 开关场：断路器、隔离开关及三相母线。
  for (const z of [138, 150, 162]) {
    for (const x of [-140, -135, -130]) {
      box(concrete, [x, floorY + 0.3, z], [2.2, 0.6, 3])
      box(steel, [x, floorY + 1.5, z], [1.2, 2.2, 1.5])
      insulator(x, floorY + 2.6, z)
      beam([x, floorY + 4.3, z], [x, floorY + 5.3, z + 1.2], 0.1)
    }
  }
  for (const x of [-140, -135, -130]) {
    for (const z of [134, 168]) {
      cylinder(steel, [x, floorY + 2.8, z], 0.22, 5.6)
      insulator(x, floorY + 5.6, z, 1.4)
    }
    beam([x, floorY + 7, 134], [x, floorY + 7, 168], 0.13)
  }

  // 站区围栏：东侧留出朝向城区的大门。
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
  fenceSpan([s.minX, s.minZ], [s.maxX, s.minZ])
  fenceSpan([s.minX, s.maxZ], [s.maxX, s.maxZ])
  fenceSpan([s.minX, s.minZ], [s.minX, s.maxZ])
  fenceSpan([s.maxX, s.minZ], [s.maxX, 138])
  fenceSpan([s.maxX, 147], [s.maxX, s.maxZ])
  box(concrete, [-112, floorY - 0.1, 142.5], [24, 0.3, 9])

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
    wind: gantry(-152, 128, 0, '风电进线'),
    'solar-main': gantry(-126, 150, Math.PI / 2, '光伏进线'),
    'solar-roof': gantry(-135, 128, 0, '屋顶光伏')
  }

  function pylon(x, z, angle) {
    const y = groundHeight(x, z)
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
    wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(samples), 24, radius, 5, false))
  }
  for (const [key, sockets] of Object.entries(terminals)) {
    const busZ = key === 'solar-main' ? 150 : 134
    sockets.forEach((socket, phase) => cable(socket, [-140 + phase * 5, floorY + 7, busZ], 0.08))
  }
  for (const z of [145, 161]) {
    [-154.2, -152, -149.8].forEach((x, phase) => cable([x, floorY + 6.5, z - 1.3], [-140 + phase * 5, floorY + 7, z], 0.08))
  }
  for (const route of GRID_ROUTES) {
    const towerPoints = []
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i]
      const b = route.points[i + 1]
      const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 55)
      for (let j = 0; j < count; j++) towerPoints.push([THREE.MathUtils.lerp(a[0], b[0], j / count), THREE.MathUtils.lerp(a[1], b[1], j / count)])
    }
    const sockets = towerPoints.map((point, i) => {
      const next = towerPoints[i + 1] ?? route.points.at(-1)
      return pylon(point[0], point[1], Math.atan2(next[0] - point[0], next[1] - point[1]))
    })
    sockets.push(terminals[route.key])
    for (let i = 0; i < sockets.length - 1; i++) {
      for (let phase = 0; phase < 3; phase++) cable(sockets[i][phase], sockets[i + 1][phase])
    }
    const [x, z] = route.points[0]
    const y = groundHeight(x, z)
    box(concrete, [x + 4, y + 0.2, z], [3.6, 0.6, 3.5])
    box(transformer, [x + 4, y + 1.7, z], [2.8, 2.8, 2.7])
  }
  // 发电设备先汇入集电柜，再由架空三相线路进入变电站。
  const groundCable = (start, end) => {
    const points = Array.from({ length: 16 }, (_, j) => {
      const x = THREE.MathUtils.lerp(start[0], end[0], j / 15)
      const z = THREE.MathUtils.lerp(start[1], end[1], j / 15)
      return new THREE.Vector3(x, groundHeight(x, z) + 0.3, z)
    })
    wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.14, 5, false))
  }
  groundCable([-100, 166], GRID_ROUTES.find((route) => route.key === 'solar-main').points[0])
  groundCable([-94, 56], GRID_ROUTES.find((route) => route.key === 'solar-roof').points[0])

  const wireGeometry = mergeGeometries(wires)
  wires.forEach((geometry) => geometry.dispose())
  const fenceGeometry = new THREE.BufferGeometry()
  fenceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3))
  return { parts, wireGeometry, fenceGeometry }
}
