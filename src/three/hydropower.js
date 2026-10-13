// ============================================================
//  长江水电站：横跨长江中游的坝式电站
//
//  布局（沿 x 从西到东，坝轴在 z = HYDRO.z）：
//    · 西岸非溢流坝段 —— 插进西岸台地
//    · 溢流段 —— 4 孔泄洪闸，弧形闸门抬起，闸下泄水（见 SPILLS）
//    · 厂房坝段 + 坝后式厂房 —— 主厂房骑在尾水上，下游立面上挂站名
//    · 东岸非溢流坝段 —— 接东岸台地
//    · 坝顶公路 + 栏杆 + 灯柱，两岸下游侧另设开关站与出线塔
//
//  尺寸全部由 river.js 的河道参数推出（河中心/河宽/河床），
//  所以河道一调，坝自动跟着走；东侧构件另用绝对坐标，
//  保证不压到城区西边界（x = -250）。
// ============================================================
import * as THREE from 'three'
import { HYDRO, RIVER, riverBedY, riverCenterX, riverHalfWidth } from './river'
import { terrainHeight } from './terrain'

const AZ = HYDRO.z
const AX = riverCenterX(AZ)
const HW = riverHalfWidth(AZ)
const CREST = HYDRO.crest
const BASE = riverBedY(AZ) - 2.4 // 坝基埋入河床
const THICK = HYDRO.depth
const WEIR_DROP = 1.4 // 溢流堰顶比坝顶低

/** 坝轴各区段的世界坐标（x） */
export const DAM_SPAN = {
  west: AX - HYDRO.westSpan,
  spillWest: AX - HYDRO.spillWest,
  spillEast: AX + HYDRO.spillEast,
  houseEast: AX + HYDRO.houseEast,
  east: AX + HYDRO.eastSpan
}

/** 厂房（坝后式）与开关站的定位 */
export const POWERHOUSE = {
  minX: AX + 12,
  maxX: AX + 40,
  minZ: AZ + THICK / 2,
  maxZ: AZ + THICK / 2 + 18,
  base: -12,
  top: 11
}

export const SWITCHYARD = { minX: -276, maxX: -256, minZ: 92, maxZ: 118, pad: 0.35 }
export const OUTLINE_TOWER = { x: -266, z: 128 }

/** 泄洪水舌：闸门抬起后在孔口下方垂下的水帘，交给组件做半透明网格 */
export const SPILLS = (() => {
  const bays = HYDRO.spillBays
  const span = DAM_SPAN.spillEast - DAM_SPAN.spillWest
  const pier = 1.44
  const opening = (span - pier * (bays + 1)) / bays
  const list = []
  for (let i = 0; i < bays; i++) {
    const x0 = DAM_SPAN.spillWest + pier + i * (opening + pier)
    list.push({
      x: x0 + opening / 2,
      width: opening,
      topY: CREST - WEIR_DROP,
      topZ: AZ + THICK / 2 - 1,
      bottomY: RIVER.lowerLevel - 0.6,
      bottomZ: AZ + THICK / 2 + 9
    })
  }
  return list
})()

/** 坝下消力池（交给水面材质渲染白沫） */
export const PLUNGE_POOL = {
  z: AZ + THICK / 2 + 4,
  reach: 26,
  strength: 0.95
}

// ---------------- 材质 ----------------

function concrete(hex = '#b6babb', roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: 0.04 })
}

let cache = null
function materials() {
  if (cache) return cache
  cache = {
    dam: concrete('#b3b8bb', 0.88),
    damDark: concrete('#9ba1a5', 0.9),
    deck: concrete('#8d9295', 0.82),
    steel: new THREE.MeshStandardMaterial({ color: '#6f7a85', roughness: 0.42, metalness: 0.72 }),
    gate: new THREE.MeshStandardMaterial({ color: '#7d8b98', roughness: 0.35, metalness: 0.78 }),
    glass: new THREE.MeshStandardMaterial({ color: '#264b66', roughness: 0.18, metalness: 0.45 }),
    roof: new THREE.MeshStandardMaterial({ color: '#57626e', roughness: 0.6, metalness: 0.22 }),
    wall: concrete('#cfd3d3', 0.8),
    fence: new THREE.MeshStandardMaterial({ color: '#98a3ad', roughness: 0.4, metalness: 0.6 }),
    gravel: concrete('#8b8c7e', 0.96),
    warning: new THREE.MeshStandardMaterial({ color: '#d9ac3a', roughness: 0.6 })
  }
  return cache
}

// ---------------- 组装 ----------------

/**
 * 生成水电站全部静态部件。
 * @returns {{ boxes: Array, signs: Array, spills: Array, switchyard: object }}
 */
export function buildHydropower() {
  const M = materials()
  const boxes = []
  const add = (material, position, scale, rotation) =>
    boxes.push({ material, position, scale, rotation })

  const zUp = AZ - THICK / 2
  const zDown = AZ + THICK / 2

  // ---- 1) 坝体四段 ----
  const damSection = (x0, x1, topY, material) =>
    add(material, [(x0 + x1) / 2, (BASE + topY) / 2, AZ], [x1 - x0, topY - BASE, THICK])

  damSection(DAM_SPAN.west, DAM_SPAN.spillWest, CREST, M.dam)
  damSection(DAM_SPAN.spillWest, DAM_SPAN.spillEast, CREST - WEIR_DROP, M.damDark)
  damSection(DAM_SPAN.spillEast, DAM_SPAN.houseEast, CREST, M.dam)
  damSection(DAM_SPAN.houseEast, DAM_SPAN.east, CREST, M.dam)

  // 溢流段下游面做成台阶，避免一片光面看起来像挡土墙
  add(M.damDark, [(DAM_SPAN.spillWest + DAM_SPAN.spillEast) / 2, (BASE + CREST) / 2, zDown + 1.6], [
    DAM_SPAN.spillEast - DAM_SPAN.spillWest,
    CREST - BASE,
    3.2
  ])

  // ---- 2) 坝顶公路 + 压顶 ----
  const deckW = DAM_SPAN.east - DAM_SPAN.west
  const deckMid = (DAM_SPAN.west + DAM_SPAN.east) / 2
  add(M.deck, [deckMid, CREST + 0.2, AZ], [deckW, 0.4, THICK - 0.6])
  add(M.damDark, [deckMid, CREST + 0.55, zUp + 0.2], [deckW, 0.7, 0.5])
  add(M.damDark, [deckMid, CREST + 0.55, zDown - 0.2], [deckW, 0.7, 0.5])

  // 栏杆（下游侧）：立柱 + 两道横杆
  for (let x = DAM_SPAN.west + 3; x <= DAM_SPAN.east - 3; x += 8) {
    add(M.steel, [x, CREST + 1.15, zDown - 0.2], [0.22, 1.2, 0.22])
  }
  add(M.steel, [deckMid, CREST + 1.7, zDown - 0.2], [deckW - 2, 0.12, 0.12])
  add(M.steel, [deckMid, CREST + 1.15, zDown - 0.2], [deckW - 2, 0.1, 0.1])

  // 灯柱（上游侧）
  for (let x = DAM_SPAN.west + 8; x <= DAM_SPAN.east - 4; x += 17) {
    add(M.steel, [x, CREST + 2.4, zUp + 0.4], [0.28, 4.6, 0.28])
    add(M.warning, [x, CREST + 4.8, zUp + 0.4], [1.2, 0.35, 0.8])
  }

  // ---- 3) 溢流闸墩与抬起的弧形闸门 ----
  const bays = HYDRO.spillBays
  const span = DAM_SPAN.spillEast - DAM_SPAN.spillWest
  const pierW = 1.44
  const opening = (span - pierW * (bays + 1)) / bays
  for (let i = 0; i <= bays; i++) {
    const x = DAM_SPAN.spillWest + pierW / 2 + i * (opening + pierW)
    add(M.dam, [x, (BASE + CREST + 2.2) / 2, AZ], [pierW, CREST + 2.2 - BASE, THICK + 1.2])
    add(M.damDark, [x, CREST + 2.5, AZ], [pierW + 0.5, 0.5, THICK + 1.6])
  }
  for (let i = 0; i < bays; i++) {
    const cx = DAM_SPAN.spillWest + pierW + opening / 2 + i * (opening + pierW)
    // 门叶（抬起状态，门底让开泄水口）
    add(M.gate, [cx, CREST + 2.6, zUp + 1.4], [opening, 4.6, 0.45])
    // 门顶横梁与支铰
    add(M.steel, [cx, CREST + 4.9, zUp + 1.4], [opening + 0.6, 0.5, 1.1])
    add(M.steel, [cx - opening / 2 - 0.6, CREST + 4.9, zUp + 1.4], [0.8, 1.4, 1.4])
    add(M.steel, [cx + opening / 2 + 0.6, CREST + 4.9, zUp + 1.4], [0.8, 1.4, 1.4])
  }

  // ---- 4) 坝后式厂房 ----
  const H = POWERHOUSE
  const hw = H.maxX - H.minX
  const hd = H.maxZ - H.minZ
  const hx = (H.minX + H.maxX) / 2
  const hz = (H.minZ + H.maxZ) / 2
  add(M.wall, [hx, (H.base + H.top) / 2, hz], [hw, H.top - H.base, hd])
  add(M.roof, [hx, H.top + 0.3, hz], [hw + 0.8, 0.6, hd + 0.8])
  add(M.damDark, [hx, H.top + 1.1, hz], [hw + 1.2, 0.9, hd + 1.2])
  // 窗带（下游立面与两端）
  add(M.glass, [hx, H.top - 4.2, H.maxZ + 0.06], [hw - 3.4, 4.4, 0.2])
  add(M.glass, [H.maxX + 0.06, H.top - 4.2, hz], [0.2, 4.4, hd - 4])
  add(M.glass, [H.minX - 0.06, H.top - 4.2, hz], [0.2, 4.4, hd - 4])
  // 进厂大门与雨棚
  add(M.steel, [H.minX + 6, H.top - 6.4, H.maxZ + 0.1], [6, 3.4, 0.3])
  add(M.damDark, [H.minX + 6, H.top - 4.6, H.maxZ + 1.1], [7, 0.4, 2.4])
  // 屋顶通风口
  for (const t of [0.25, 0.75]) {
    add(M.steel, [H.minX + hw * t, H.top + 1.6, hz], [4.4, 2.2, 5])
  }
  // 尾水平台 + 栏杆
  add(M.deck, [hx, 3.4, H.maxZ + 2.6], [hw, 0.6, 5.2])
  add(M.steel, [hx, 4.5, H.maxZ + 5], [hw, 0.12, 0.12])
  for (let x = H.minX + 2; x <= H.maxX - 2; x += 6) {
    add(M.steel, [x, 4.05, H.maxZ + 5], [0.16, 1.1, 0.16])
  }

  // ---- 5) 开关站（东岸下游侧空地） ----
  const S = SWITCHYARD
  const sw = S.maxX - S.minX
  const sd = S.maxZ - S.minZ
  const sx = (S.minX + S.maxX) / 2
  const sz = (S.minZ + S.maxZ) / 2
  add(M.gravel, [sx, S.pad, sz], [sw, 0.5, sd])
  const fenceH = 2.2
  add(M.fence, [sx, S.pad + fenceH / 2, S.minZ], [sw, fenceH, 0.16])
  add(M.fence, [sx, S.pad + fenceH / 2, S.maxZ], [sw, fenceH, 0.16])
  add(M.fence, [S.minX, S.pad + fenceH / 2, sz], [0.16, fenceH, sd])
  add(M.fence, [S.maxX, S.pad + fenceH / 2, sz], [0.16, fenceH, sd])
  // 主变
  for (const t of [0.32, 0.68]) {
    const tx = S.minX + sw * t
    add(M.damDark, [tx, S.pad + 0.6, sz - 3], [7, 1.2, 7.6])
    add(M.steel, [tx, S.pad + 3, sz - 3], [6, 3.6, 6.6])
  }
  // 门型架 + 出线
  for (const t of [0.22, 0.5, 0.78]) {
    const gx = S.minX + sw * t
    add(M.steel, [gx, S.pad + 5.5, S.maxZ - 4], [0.4, 10, 0.4])
    add(M.steel, [gx + 3.2, S.pad + 5.5, S.maxZ - 4], [0.4, 10, 0.4])
    add(M.steel, [gx + 1.6, S.pad + 10.2, S.maxZ - 4], [4.4, 0.35, 0.35])
  }
  // 继保楼
  add(M.wall, [S.maxX - 5, S.pad + 2.4, S.minZ + 6], [8, 4.4, 7])
  add(M.roof, [S.maxX - 5, S.pad + 4.9, S.minZ + 6], [8.6, 0.5, 7.6])

  // 出线塔（格构式，往城区方向送电）
  const T = OUTLINE_TOWER
  const ty = terrainHeight(T.x, T.z)
  add(M.steel, [T.x - 2.2, ty + 9, T.z], [0.6, 18, 0.6])
  add(M.steel, [T.x + 2.2, ty + 9, T.z], [0.6, 18, 0.6])
  add(M.steel, [T.x - 2.2, ty + 9, T.z + 2.2], [0.55, 18, 0.55])
  add(M.steel, [T.x + 2.2, ty + 9, T.z + 2.2], [0.55, 18, 0.55])
  for (const y of [6, 11, 16]) {
    add(M.steel, [T.x, ty + y, T.z + 1.1], [5.4, 0.3, 2.8])
  }
  add(M.steel, [T.x, ty + 19, T.z + 1.1], [9, 0.42, 0.42])
  add(M.steel, [T.x, ty + 21.6, T.z + 1.1], [7, 0.36, 0.36])

  // ---- 6) 标牌 ----
  const signs = [
    {
      text: '长江水电站',
      position: [hx, H.top - 1.6, H.maxZ + 0.12],
      width: Math.min(22, hw * 0.8),
      height: 4,
      rotation: [0, 0, 0],
      style: 'station'
    },
    {
      text: '长江',
      position: [riverCenterX(150) + riverHalfWidth(150) + 11, terrainHeight(riverCenterX(150) + riverHalfWidth(150) + 11, 150) + 6.4, 150],
      width: 12,
      height: 4.4,
      rotation: [0, Math.PI / 2, 0],
      style: 'river'
    }
  ]

  return { boxes, signs, spills: SPILLS, switchyard: SWITCHYARD, tower: OUTLINE_TOWER }
}

/** 单位立方体：坝体、厂房、开关站共用同一份几何 */
export function hydropowerUnitBox() {
  return new THREE.BoxGeometry(1, 1, 1)
}
