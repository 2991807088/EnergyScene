// ============================================================
//  真实楼宇模型接入层
//  - 模型来源：Quaternius「Downtown City MegaKit」预拼示例楼
//    (https://quaternius.com/packs/downtowncitymegakit.html)
//    授权 CC0 1.0（公共领域，可商用、无需署名）。
//  - 波士顿/纽约风街区楼：真实比例、PBR 贴图、带「假内景」窗（窗内是
//    烘焙的房间贴图），观感为写实城市楼，替换掉原先的 Kenney 卡通低模。
//  - 文件在 public/models/buildings/quat/ 下；三栋楼共享同一套贴图
//    （Textures/*.png，gltf 内以相对路径引用），贴图浏览器只下载一次。
//  - bakeBuildingModel 把 GLTF 场景烘成统一规格：
//      底面 y=0、x/z 居中、缩放取「目标高度」与「最大占地」双约束的较小值，
//      保证楼体不压到道路（16m 格扣除两侧路缘后，模型占地上限 9.2m）。
//  - 窗光：FakeInterior 材质的 map 本身就是「亮灯内景/暗内景」贴图，
//    直接用它做 emissiveMap —— 亮内景窗夜间发光，暗内景贴图本身近黑，
//    发光后依然近黑，无需区分处理（强度由 Buildings 组件按 lightLevel 调）。
//  - 朝向：楼体方正，任意 90° 旋转都对齐街区网格。
// ============================================================
import * as THREE from 'three'

/**
 * key → { file, dir, height, footprint }
 *   file      public/models/buildings/<dir>/ 下的 gltf 文件名（不带扩展名）
 *   height    归一化后的目标楼高（米）
 *   footprint 目标最大占地（米），实际缩放取 height 与 footprint 双约束较小者
 *
 * 原始规格（glTF 顶点包围盒，单位米）：
 *   Building_Large_2      20.6 × 28.0 × 16.6，21.3k 三角
 *   Building_Medium_2_001 15.1 × 25.0 × 13.1，13.6k 三角
 *   Building_Small_1      12.5 × 17.0 × 14.5， 9.3k 三角
 */
export const BUILDING_MODELS = {
  quatLarge: { file: 'Building_Large_2', dir: 'quat', height: 24, footprint: 9.2 },
  quatMedium: { file: 'Building_Medium_2_001', dir: 'quat', height: 21, footprint: 9.2 },
  quatSmall: { file: 'Building_Small_1', dir: 'quat', height: 15, footprint: 9.2 }
}

export const BUILDING_MODEL_DIR = `${import.meta.env.BASE_URL}models/buildings`

export const buildingModelUrl = (key) =>
  `${BUILDING_MODEL_DIR}/${BUILDING_MODELS[key].dir}/${BUILDING_MODELS[key].file}.gltf`

/** 全部楼宇模型 URL（供预加载 / useGLTF 数组调用） */
export const ALL_BUILDING_MODEL_URLS = Object.keys(BUILDING_MODELS).map(buildingModelUrl)

/**
 * 判断一个材质是否为「亮灯内景」窗材质（夜里应发光）。
 * 套件里窗材质统一叫 MI_FakeInterior_*，map 即内景贴图
 * （T_lit_interior_* 亮 / T_dark_interior 暗——暗贴图发光后依然近黑，无需排除）。
 */
export function isFakeInteriorMaterial(material) {
  return /FakeInterior/i.test(material.name ?? '') && !!material.map
}

/**
 * 把一个已加载的 GLTF 场景包成统一规格的模板 Object3D。
 * 返回的节点 clone(true) 后可直接挂进场景：几何与材质共享，变换独立。
 *
 * @param {THREE.Object3D} srcScene GLTF 的根对象
 * @param {{ height:number, footprint:number }} spec 楼宇规格
 * @returns {THREE.Object3D} 模板（底面 y=0、x/z 居中）
 */
export function bakeBuildingModel(srcScene, spec) {
  const root = new THREE.Object3D()
  root.add(srcScene.clone(true))
  root.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  if (!(size.y > 1e-6)) throw new Error('bakeBuildingModel: 模型高度异常')

  const scale = Math.min(spec.height / size.y, spec.footprint / Math.max(size.x, size.z))
  root.scale.setScalar(scale)
  root.updateMatrixWorld(true)

  const scaled = new THREE.Box3().setFromObject(root)
  const center = scaled.getCenter(new THREE.Vector3())
  root.position.set(-center.x, -scaled.min.y, -center.z)
  root.updateMatrixWorld(true)

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return root
}
