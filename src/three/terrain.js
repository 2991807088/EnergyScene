// ============================================================
//  城郊地形
//  - 城区范围由 cityLayout 定义，城市地面保持水平
//  - 只有「一条扇区」成山（连绵山脊），扇区外是低缓起伏的平原
//  - 高度场是纯函数 terrainHeight(x, z)，地形网格与风机落位共用同一份，
//    保证风机一定踩在地面上，不会悬空或陷进山里
//  - 山脊高度与风机高度都受「仰角不超过太阳仰角」约束，避免出现
//    「太阳比山/风机还低」这种看着不合理的画面
// ============================================================
import * as THREE from 'three'
import { CITY_HALF, EAST_SITES, mulberry32 } from './cityLayout'
import { RIVER, riverCarve, riverContains, riverSample } from './river'

export const TERRAIN_HALF = 500
export const TERRAIN_SEGMENTS = 500 // 保持每格 2 单位的地形精度

/** 山脊带中心方位（与默认视线、太阳方位同向 → 山在正前方当背景） */
export const RANGE_AZIMUTH = -2.266
const RANGE_CORE = 1.05 // 1.05rad ≈ 60°：扇区内完全成山（总跨度约 120°）
const RANGE_HALF = 1.35 // 1.35rad ≈ 77°：再往外渐隐，避免出现整齐断口
const PLAIN_HEIGHT = 4 // 扇区外的低缓起伏（明确「不是山」）

export const PEAK_HEIGHT = 24 // 山脊基准高度（受形状系数影响，实际最高约 31）
export const SNOW_LINE = 17 // 雪线

const APRON_FADE = 32 // 出城多远后完全解除压制
const RISE_START = CITY_HALF + 30
const RISE_END = CITY_HALF + 100

const MAX_TIP_ELEVATION = (13 * Math.PI) / 180 // 风机叶尖的仰角上限

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 把角度折到 [-π, π] */
function wrapAngle(a) {
  let t = a
  while (t > Math.PI) t -= Math.PI * 2
  while (t < -Math.PI) t += Math.PI * 2
  return t
}

/** 2D 整数哈希 → [0, 1) */
function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** 双线性平滑插值的值噪声 */
function valueNoise(x, y, seed) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)

  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)

  const top = a + (b - a) * u
  const bottom = c + (d - c) * u
  return top + (bottom - top) * v
}

/** 分形叠加（多倍频） */
function fbm(x, y, seed, octaves) {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 131)
    norm += amp
    amp *= 0.5
    freq *= 2.03
  }
  return sum / norm
}

/**
 * 地形高度场。
 * @returns {number} 该点的地面高度（城区内恒为 0）
 */
const EAST_AREAS = [EAST_SITES.thermal, EAST_SITES.factoryNorth, EAST_SITES.factorySouth, EAST_SITES.factoryRow3, EAST_SITES.factoryRow4]
const EAST_AREAS_MIN_X = Math.min(...EAST_AREAS.map((site) => site.minX))

export function terrainHeight(x, z) {
  const h = naturalHeight(x, z)
  if (x < EAST_AREAS_MIN_X - 14) return riverCarve(x, z, h)
  // 厂房用地需要平整；风机和光伏阵列直接落在自然低丘上。
  let distance = Infinity
  for (const site of EAST_AREAS) {
    distance = Math.min(distance, Math.hypot(
      Math.max(site.minX - x, 0, x - site.maxX),
      Math.max(site.minZ - z, 0, z - site.maxZ)
    ))
  }
  return riverCarve(x, z, h * smoothstep(0, 14, distance))
}

/** 自然地形高度（未施加城北厂区平整） */
function naturalHeight(x, z) {
  const sq = Math.max(Math.abs(x), Math.abs(z))
  if (sq <= CITY_HALF) return 0 // 城区：保持水平

  const fade = smoothstep(CITY_HALF, CITY_HALF + APRON_FADE, sq)
  if (fade <= 0) return 0
  const rise = smoothstep(RISE_START, RISE_END, Math.hypot(x, z))
  if (rise <= 0) return 0

  const base = rise * fade

  // 扇区遮罩：只有这条带子成山，其余是低缓平原
  const offset = Math.abs(wrapAngle(Math.atan2(z, x) - RANGE_AZIMUTH))
  const sector = 1 - smoothstep(RANGE_CORE, RANGE_HALF, offset)

  // 扇区外的起伏（一直算出来，用于和山体在扇区边缘平滑混合）
  const soft = clamp01((fbm(x * 0.012, z * 0.012, 4242, 3) - 0.32) / 0.36)
  const plain = PLAIN_HEIGHT * base * soft

  if (sector <= 0) return plain

  // 折脊噪声：|2n-1| 取反，做出连绵的山脊线而不是圆包
  const n = clamp01((fbm(x * 0.02, z * 0.02, 1337, 5) - 0.28) / 0.44)
  const ridge = 1 - Math.abs(n * 2 - 1)
  const detail = fbm(x * 0.06, z * 0.06, 5150, 3)

  const mountain = PEAK_HEIGHT * base * sector * Math.pow(ridge, 1.5) * (0.55 + 0.75 * detail)
  return mountain + plain * (1 - sector)
}

// ---- 配色：低地 → 岩壁 → 雪线 ----
const COLOR_LOW = new THREE.Color('#41503a')
const COLOR_ROCK = new THREE.Color('#5b574d')
const COLOR_SNOW = new THREE.Color('#dbe4ee')
// 河道：水下泥沙 → 水边砾石（长江的河床与河滩）
const COLOR_BED = new THREE.Color('#6f6a55')
const COLOR_SHORE = new THREE.Color('#968f80')

/**
 * 生成地形网格（顶点按高度场位移 + 按高度/坡度上色）。
 */
export function generateTerrain() {
  const geo = new THREE.PlaneGeometry(
    TERRAIN_HALF * 2,
    TERRAIN_HALF * 2,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS
  )
  geo.rotateX(-Math.PI / 2) // 摊平到 XZ 平面，法线朝上

  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)))
  }
  geo.computeVertexNormals()

  const normal = geo.attributes.normal
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i)
    const slope = clamp01(1 - normal.getY(i)) // 0 = 平地，1 = 垂直峭壁

    c.copy(COLOR_LOW).lerp(COLOR_ROCK, smoothstep(0.12, 0.5, h / PEAK_HEIGHT))
    if (h > SNOW_LINE - 5) {
      c.lerp(COLOR_SNOW, smoothstep(SNOW_LINE - 5, SNOW_LINE + 7, h))
    }
    // 陡坡露岩（雪也挂不住）
    c.lerp(COLOR_ROCK, clamp01(slope * 1.35) * 0.75)

    // 长江河槽：水面以下是泥沙河床，水线附近是砾石河滩
    const pz = pos.getZ(i)
    if (pz >= RIVER.zFrom && pz <= RIVER.zTo) {
      const { centerX, halfWidth, water } = riverSample(pz)
      if (Math.abs(pos.getX(i) - centerX) < halfWidth * 1.55) {
        const depth = water - h
        if (depth > 0.12) {
          c.lerp(COLOR_BED, clamp01(depth / 2.2))
        } else {
          c.lerp(COLOR_SHORE, clamp01(1 - (h - water) / 1.8))
        }
      }
    }

    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/** 在山脊扇区内分散布置风机，保持足够间距。 */
export function pickTurbineSpots(count = 48, seed = 777) {
  const rand = mulberry32(seed)
  const spots = []
  let attempts = 0
  while (spots.length < count && attempts++ < 8000) {
    const angle = RANGE_AZIMUTH + (rand() - 0.5) * 2 * RANGE_CORE
    const radius = CITY_HALF + 75 + rand() * 120
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const h = terrainHeight(x, z)

    const towerH = 8 + rand() * 2.4
    const bladeLen = 4 + rand() * 1.6
    const total = towerH + bladeLen

    if (h < 6) continue // 谷地不放风机
    if (riverContains(x, z, 12)) continue // 河槽与河岸坡上不放风机
    if (Math.atan2(h + total, radius) > MAX_TIP_ELEVATION) continue // 别高过太阳
    if (spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 22)) continue

    spots.push({
      x,
      z,
      // 网格是三角面插值出来的，比解析高度略低，往下埋 0.5 保证「种」在地上
      baseY: Math.max(0, h - 0.5),
      towerH,
      bladeLen,
      speedFactor: 0.75 + rand() * 0.5
    })
  }

  return spots
}
