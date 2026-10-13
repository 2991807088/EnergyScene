// ============================================================
//  树木系统：树种定义 + 布点 + 实例打包 + 逐帧摆动
//  - 几何全部来自真实模型（Kenney Nature Kit，CC0，见 three/treeModels.js）
//    烘成「高 = 1、树根在 y = 0」后，仍沿用「每棵树一个高度系数 s」的老约定
//  - 材质做成纯白，颜色一律走 instanceColor —— 模型自带的是 Kenney 的薄荷绿调色板，
//    和场景的深绿树色不搭；白底 + 实例色才能既保留轮廓又保住配色语言
//  - 布点：城市中心树阵（规则网格）+ 环城林带（成团撒点，落在真实地形高度上）
//  - 输出「实例批次」：一个批次一个 InstancedMesh，几百棵树只要十几次 draw call
// ============================================================
import * as THREE from 'three'
import { CITY_HALF, CENTRAL_PARK, EAST_SITES, PARK_AREAS, inArea, isInsideTrack, mulberry32 } from './cityLayout'
import { terrainHeight, TERRAIN_HALF, TERRAIN_SEGMENTS } from './terrain'
import { isInsideSolarFarm } from './solarFarm'
import { POND, pondContains } from './pond'
import { riverContains } from './river'

// ---------- 共享材质（颜色交给 instanceColor） ----------
export const TREE_MATERIALS = {
  bark: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0.02 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02 })
}

// ---------- 树种 ----------
// key 必须与 treeModels.js 的 TREE_MODEL_FILES 对齐（对不上会在 buildForest 里直接报错）
// height 是整棵树的实际高度（模型已归一化到高 = 1，所以这个值就是实例缩放系数）
const SPECIES = [
  {
    key: 'conifer',
    label: '针叶树',
    model: 'tree_pineDefaultA',
    height: [3.4, 6.4],
    leaf: '#31513a',
    swayPeriod: 1.15 // 摆动周期系数：越小越活泼
  },
  {
    key: 'broadleaf',
    label: '阔叶树',
    model: 'tree_oak',
    height: [3.0, 5.2],
    leaf: '#4c6f3f',
    swayPeriod: 1.7
  },
  {
    key: 'poplar',
    label: '钻天杨',
    model: 'tree_tall',
    height: [5.0, 7.4],
    leaf: '#69824a',
    swayPeriod: 2.3, // 又高又软，摆得慢而大
    swayScale: 1.35
  },
  {
    key: 'roundTree',
    label: '圆冠树',
    model: 'tree_fat',
    height: [2.8, 4.4],
    leaf: '#3d6036',
    swayPeriod: 1.9
  },
  {
    key: 'bush',
    label: '灌木',
    model: 'plant_bushDetailed',
    height: [1.0, 1.9],
    leaf: '#54744a',
    swayPeriod: 1.0,
    swayScale: 1.5
  }
]

const TRUNK_COLOR = new THREE.Color('#6a5039')

// 树种预解析成「线性空间颜色」，避免每棵树都 new 一次 Color
for (const sp of SPECIES) sp.leafLinear = new THREE.Color(sp.leaf)

const SPECIES_BY_KEY = Object.fromEntries(SPECIES.map((s) => [s.key, s]))

// 环城林带的树种权重（针叶/阔叶为主，杨树拉天际线，圆冠树和灌木做层次）
const WILD_POOL = [
  { key: 'conifer', weight: 3 },
  { key: 'broadleaf', weight: 4 },
  { key: 'poplar', weight: 2 },
  { key: 'roundTree', weight: 2 },
  { key: 'bush', weight: 2 }
]
const WILD_TOTAL = WILD_POOL.reduce((sum, w) => sum + w.weight, 0)

function pickWildSpecies(rand) {
  let r = rand() * WILD_TOTAL
  for (const w of WILD_POOL) {
    r -= w.weight
    if (r <= 0) return w.key
  }
  return WILD_POOL[0].key
}

// ---------- 布点 ----------

const TREELINE = 13 // 雪线以下才长树
const MAX_SLOPE = 0.55 // 坡度上限，太陡不长树（也避免根部悬空）
const GROUND_SINK = 0.12 // 往下埋一点，保证「种」在地里而不是浮在地表

/** 该点的最大坡度（用中心差分估） */
function slopeAt(x, z) {
  const d = 1.5
  const gx = (terrainHeight(x + d, z) - terrainHeight(x - d, z)) / (2 * d)
  const gz = (terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d)
  return Math.hypot(gx, gz)
}

/**
 * 地形「网格实际表面」高度。
 * terrainHeight 是解析函数，真正渲染出来的却是 2 单位一格的三角面 ——
 * 两者在坡地上能差 0.5 个单位，树根又细，差一点就看得出悬空。
 * 这里按 PlaneGeometry 的真实三角划分（对角线是 (i,j)-(i+1,j+1)）精确插值。
 */
function meshGroundHeight(x, z) {
  const step = (TERRAIN_HALF * 2) / TERRAIN_SEGMENTS
  const fx = (x + TERRAIN_HALF) / step
  const fz = (z + TERRAIN_HALF) / step
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const u = fx - i
  const v = fz - j
  const at = (ii, jj) => terrainHeight(-TERRAIN_HALF + ii * step, -TERRAIN_HALF + jj * step)

  const h00 = at(i, j)
  const h10 = at(i + 1, j)
  const h01 = at(i, j + 1)
  const h11 = at(i + 1, j + 1)

  if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00)
  return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11)
}

function makeTree(rand, key, x, z, y) {
  const sp = SPECIES_BY_KEY[key]
  const [hMin, hMax] = sp.height
  const h = hMin + rand() * (hMax - hMin)
  // 叶色抖动：整体明暗 + 轻微冷暖偏移，让同一树种的树也不一样
  const lum = 0.86 + rand() * 0.4
  const warm = (rand() - 0.5) * 0.12
  const leaf = sp.leafLinear
  const tr = 0.92 + rand() * 0.22
  const tg = 0.9 + rand() * 0.2
  const tb = 0.86 + rand() * 0.18
  return {
    key,
    x,
    y,
    z,
    s: h, // 高度系数（模型已归一化到高 = 1）
    phase: rand() * Math.PI * 2,
    swayScale: (sp.swayScale ?? 1) * (0.78 + rand() * 0.5),
    swayPeriod: sp.swayPeriod,
    qTilt: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rand() * Math.PI * 2
    ),
    // 线性空间的最终颜色（材质是白的，实例色直接决定观感）
    leafTint: [leaf.r * lum * (1 + warm), leaf.g * lum, leaf.b * lum * (1 - warm * 0.6)],
    trunkTint: [TRUNK_COLOR.r * tr, TRUNK_COLOR.g * tg, TRUNK_COLOR.b * tb]
  }
}

/**
 * 全部树木落点：中心树阵（规则网格）+ 环城林带（成团撒点）。
 */
export function pickTreeSpots(seed = 20261013) {
  const rand = mulberry32(seed)
  const trees = []

  // ---- 1) 中央绿地的树阵（绿地占四个格子，±13.2） ----
  // 绿地边界取 ±13.2 = 16 − 路宽一半 2.8，也就是一直铺到路缘，把 x/z = ±16 那四条
  // 主干道围住的 2×2 街区填满。树按 6×6 均匀网格铺开、覆盖到 ±11：
  //   到最近道路中线 16 的净距 16 − 11 = 5，减去路宽一半 2.8 还剩 2.2；
  //   两种树的树冠半径（见下方 SPECIES 与模型实测半宽）是
  //   针叶树 0.1721×6.4 = 1.101、阔叶树 0.3016×5.2 = 1.568，
  //   余量 2.2 − 1.568 = 0.632，树冠不会伸到马路上。
  // 池塘、跑道范围（含岸带和树冠余量）不种树。
  //   这里仍然照常调用 makeTree、只是有条件地丢弃结果 —— rand() 的消耗与从前
  //   逐棵一致（6×6×9 = 324 次），所以绿地以外的树仍逐棵保持原位。
  const CENTRAL_OFFSETS = [-11, -6.6, -2.2, 2.2, 6.6, 11]
  for (const ox of CENTRAL_OFFSETS) {
    for (const oz of CENTRAL_OFFSETS) {
      // 中心树阵只用两种高树，保持"整齐"的观感
      const x = (CENTRAL_PARK.minX + CENTRAL_PARK.maxX) / 2 + ox * 2.2
      const z = (CENTRAL_PARK.minZ + CENTRAL_PARK.maxZ) / 2 + oz * 5
      const tree = makeTree(rand, rand() < 0.58 ? 'conifer' : 'broadleaf', x, z, 0)
      if (pondContains(x, z, POND.bank + 1.5) || isInsideTrack(x, z, 1.8)) continue
      trees.push(tree)
    }
  }

  // ---- 2) 环城林带：先撒"树丛中心"再成团，比均匀撒点自然 ----
  for (const park of PARK_AREAS) {
    for (let i = 0; i < 28; i++) {
      const x = park.minX + 4 + rand() * (park.maxX - park.minX - 8)
      const z = park.minZ + 4 + rand() * (park.maxZ - park.minZ - 8)
      if (Math.abs(x - (park.minX + park.maxX) / 2) < 2 || Math.abs(z - (park.minZ + park.maxZ) / 2) < 2) continue
      trees.push(makeTree(rand, pickWildSpecies(rand), x, z, -GROUND_SINK))
    }
  }

  const GROVES = 120
  for (let g = 0; g < GROVES; g++) {
    const angle = rand() * Math.PI * 2
    const radius = CITY_HALF + 8 + rand() * 150
    const cx = Math.cos(angle) * radius
    const cz = Math.sin(angle) * radius
    const count = 3 + Math.floor(rand() * 5) // 每丛 3~7 棵

    for (let k = 0; k < count; k++) {
      const x = cx + (rand() - 0.5) * 20
      const z = cz + (rand() - 0.5) * 20
      if (Math.max(Math.abs(x), Math.abs(z)) <= CITY_HALF) continue // 别进城，避开建筑和道路
      const y = terrainHeight(x, z)
      if (y > TREELINE) continue // 雪线以上不长树
      if (slopeAt(x, z) > MAX_SLOPE) continue // 陡坡不长树
      // 底座取「网格真实表面」再下移地形网格自身的 0.06 偏移与埋深
      const ground = meshGroundHeight(x, z) - 0.06 - GROUND_SINK
      const tree = makeTree(rand, pickWildSpecies(rand), x, z, ground)
      // 光伏阵列占地内不长树，否则会有树从面板中间穿出来。
      // 判定必须放在 makeTree 之后：makeTree 自己会消耗 8 个随机数，
      // 提前 continue 会把整条随机流推移，后面几十棵树会全部换位置。
      if (isInsideSolarFarm(tree.x, tree.z)) continue
      if (Object.values(EAST_SITES).some((site) => inArea(tree.x, tree.z, site, 7))) continue
      // 长江水面与河滩上不长树（判定同样要放在 makeTree 之后）
      if (riverContains(tree.x, tree.z, 7)) continue
      trees.push(tree)
    }
  }

  return trees
}

// ---------- 实例打包 ----------

/**
 * 把散点整理成实例批次：一个批次 = 一个 InstancedMesh（一份几何 + 一份材质）。
 * 批次内所有实例共用同一份「部件局部矩阵」（来自模型烘焙），
 * 差别只在树的世界位置、朝向、缩放与摆动相位。
 *
 * @param {Record<string, {parts: Array}>} models 树种 → bakeTreeModel 的产物
 * @param {number} seed
 */
export function buildForest(models, seed = 20261013) {
  const trees = pickTreeSpots(seed)
  const batches = []
  const byKey = new Map()

  for (let ti = 0; ti < trees.length; ti++) {
    const tree = trees[ti]
    const baked = models[tree.key]
    if (!baked) throw new Error(`buildForest: 树种 "${tree.key}" 没有对应的模型（treeModels.js 的 TREE_MODEL_FILES 漏了？）`)

    for (let pi = 0; pi < baked.parts.length; pi++) {
      const part = baked.parts[pi]
      const isBark = part.role === 'bark'
      const bkey = `${tree.key}#${pi}`
      let batch = byKey.get(bkey)

      if (!batch) {
        batch = {
          key: bkey,
          geometry: part.geometry,
          material: isBark ? TREE_MATERIALS.bark : TREE_MATERIALS.leaf,
          localMatrix: part.localMatrix,
          sway: isBark ? 0 : 1, // 0 = 枝干层（跟随小），1 = 树冠层（摆得大）
          count: 0,
          treeIndex: [],
          tint: [],
          mesh: null
        }
        byKey.set(bkey, batch)
        batches.push(batch)
      }

      batch.treeIndex.push(ti)
      batch.tint.push(isBark ? tree.trunkTint : tree.leafTint)
      batch.count++
    }
  }

  for (const b of batches) {
    b.treeIndex = Int32Array.from(b.treeIndex)
  }

  return { trees, batches }
}

// 树冠最大摆角（弧度）。
// 模型树的枝干和树冠是连在一起的 —— 摆幅一旦失控，枝干会从树冠里穿出来，
// 所以对每棵树的摆角做 tanh 软饱和：小风近似线性，大风趋近上限而不越界。
const CROWN_SWAY_MAX = 0.44
// 枝干层跟随树冠的比例。相差越小，枝干与树冠越不容易脱开。
// 0.78 是实测量出来的：最大风力下两层的最大分离约 0.04 × 树高，
// 远小于树冠半径，枝干不会从树冠里穿出来。
const BARK_FOLLOW = 0.78

/**
 * 建一个「逐帧写入实例矩阵」的更新函数。
 * 内部持有可复用的临时对象与每棵树的两级摆动四元数，避免每帧产生垃圾。
 */
export function createForestAnimator(trees, batches) {
  const euler = new THREE.Euler()
  const stem = trees.map(() => new THREE.Quaternion()) // 枝干层
  const crown = trees.map(() => new THREE.Quaternion()) // 树冠层
  const matrix = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  let gust = 0

  /**
   * @param {number} time     累计秒数
   * @param {number} windNorm 风力归一化 0~1
   * @param {number} delta    帧间隔（秒）
   */
  return function update(time, windNorm, delta) {
    // 阵风：低频起伏叠在风力上，让摆动不是机械等幅
    gust += (Math.sin(time * 0.6) * 0.5 + Math.sin(time * 1.7 + 1.3) * 0.5 - gust) * Math.min(delta * 1.5, 1)
    const strength = windNorm * (1 + gust * 0.35)
    const baseFreq = 0.9 + windNorm * 2.4

    // 1) 先为每棵树算好两级摆动四元数（外层是摆动，内层是朝向 → 摆动方向全场一致）
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i]
      const w = (time * baseFreq) / t.swayPeriod + t.phase
      const raw = strength * 0.52 * t.swayScale * (Math.sin(w) * 0.7 + Math.sin(w * 2.3) * 0.3)
      const a = CROWN_SWAY_MAX * Math.tanh(raw / CROWN_SWAY_MAX)
      const lean = a * 0.26 // 轻微的前后倾，避免只剩单轴的机械摆动

      crown[i].setFromEuler(euler.set(lean, 0, a, 'XYZ')).multiply(t.qTilt)
      stem[i].setFromEuler(euler.set(lean * BARK_FOLLOW, 0, a * BARK_FOLLOW, 'XYZ')).multiply(t.qTilt)
    }

    // 2) 再按批次写实例矩阵
    for (const batch of batches) {
      const mesh = batch.mesh
      if (!mesh) continue
      const { localMatrix, sway, treeIndex, count } = batch

      for (let k = 0; k < count; k++) {
        const ti = treeIndex[k]
        const t = trees[ti]
        pos.set(t.x, t.y, t.z)
        scale.set(t.s, t.s, t.s)
        matrix.compose(pos, sway === 1 ? crown[ti] : stem[ti], scale)
        matrix.multiply(localMatrix)
        mesh.setMatrixAt(k, matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }
}

export { SPECIES as TREE_SPECIES, SPECIES_BY_KEY }
