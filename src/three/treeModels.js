// ============================================================
//  真实树木模型接入层
//  - 模型来源：Kenney「Nature Kit」(https://kenney.nl/assets/nature-kit)
//    授权 CC0 1.0（公共领域，可商用、无需署名）。文件已放进 public/models/trees/
//  - KayKit / Kenney 的模型都是「高 ≈ 1~2、树根在原点、Y 轴向上、无贴图纯色材质」
//  - bakeTreeModel 把 GLTF 场景烘成统一规格：
//      高 = 1、树根落在 y = 0、绕 Y 轴已对中
//    这样上层沿用「每棵树一个高度系数 s」的老约定，无需改布点逻辑
//  - 材质名 → 部件角色：woodBark* 算枝干，leafs*/grass 算叶子
//    （角色只决定用哪份材质与摆动层级，颜色由 instanceColor 决定）
// ============================================================
import * as THREE from 'three'

/**
 * 树种 → 模型文件名（不含扩展名）。
 * 选型依据是「归一化冠半径」与现程序化树的接近程度，以及彼此轮廓的区分度：
 *   conifer   针叶树   外层塔状枝层，冠半径 0.172   （原 0.210）
 *   broadleaf 阔叶树   浓密圆冠 + 露出的分枝，0.302 （原 0.330）
 *   poplar    钻天杨   细高柱状，0.137              （原 0.105）
 *   roundTree 圆冠树   宽圆冠 + 细树干，0.328       （原 0.460）
 *   bush      灌木     分层低矮丛，0.837             （原 0.480）
 */
export const TREE_MODEL_FILES = {
  conifer: 'tree_pineDefaultA',
  broadleaf: 'tree_oak',
  poplar: 'tree_tall',
  roundTree: 'tree_fat',
  bush: 'plant_bushDetailed'
}

/** 模型在 public/ 下的目录 */
export const TREE_MODEL_DIR = `${import.meta.env.BASE_URL}models/trees`

export const treeModelUrl = (key) => `${TREE_MODEL_DIR}/${TREE_MODEL_FILES[key]}.glb`

/** 全部树种的模型 URL（去重，供预加载用） */
export const ALL_TREE_MODEL_URLS = [...new Set(Object.keys(TREE_MODEL_FILES).map(treeModelUrl))]

const BARK_RE = /wood|bark|trunk|stem|log/
const LEAF_RE = /leaf|leaves|foliage|needle|grass|plant|bush/

/** 材质名 → 部件角色 */
export function roleOf(materialName = '') {
  const n = String(materialName).toLowerCase()
  if (BARK_RE.test(n)) return 'bark'
  if (LEAF_RE.test(n)) return 'leaf'
  return 'leaf' // 兜底：未知材质按叶子处理（Nature Kit 里只有 grass / _defaultMat 会走到这里）
}

/**
 * 把一个已加载的 GLTF 场景烘成「高 = 1、树根在 y = 0」的部件表。
 *
 * @param {THREE.Object3D} scene GLTF 的根对象
 * @returns {{ height:number, parts: Array<{ geometry:THREE.BufferGeometry, role:string, localMatrix:THREE.Matrix4, tris:number }> }}
 *   height 为模型原始高度（调试用）；parts 里的 localMatrix 已含「归一化 + 对齐树根」
 */
export function bakeTreeModel(scene) {
  scene.updateMatrixWorld(true)
  const rootInv = new THREE.Matrix4().copy(scene.matrixWorld).invert()

  // ---- 1) 收集全部网格：世界矩阵（相对场景根）+ 各自包围盒 ----
  const meshes = []
  const box = new THREE.Box3()
  const geomBox = new THREE.Box3()

  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const local = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld)
    geomBox.setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(local)
    box.union(geomBox)
    const src = Array.isArray(o.material) ? o.material[0] : o.material
    meshes.push({ geometry: o.geometry, local, role: roleOf(src?.name), sourceMaterial: src ?? null })
  })

  if (meshes.length === 0) throw new Error('bakeTreeModel: 场景里没有可用的网格')

  const height = box.max.y - box.min.y
  if (!(height > 1e-6)) throw new Error(`bakeTreeModel: 模型高度异常 (${height})`)

  // ---- 2) 归一化：先平移让树根落到 y = 0，再整体缩放 1/height ----
  const viaRoot = new THREE.Matrix4().makeTranslation(0, -box.min.y, 0)
  const norm = new THREE.Matrix4().makeScale(1 / height, 1 / height, 1 / height)
  const prep = new THREE.Matrix4().multiplyMatrices(norm, viaRoot)

  const parts = meshes.map((m) => ({
    geometry: m.geometry,
    role: m.role,
    sourceMaterial: m.sourceMaterial,
    tris: (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3,
    localMatrix: new THREE.Matrix4().multiplyMatrices(prep, m.local)
  }))

  return { height, parts }
}
