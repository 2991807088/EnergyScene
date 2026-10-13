// ============================================================
//  真实车辆模型接入层
//  - 车队：Kenney「Car Kit」(https://kenney.nl/assets/car-kit)
//    授权 CC0 1.0（公共领域，可商用、无需署名）。文件在 public/models/cars/，
//    贴图按 glb 内相对路径引用（Textures/colormap.png），目录结构不能拆。
//  - 公交：Poly Pizza「Bus」by jeremy (https://poly.pizza/m/bsvS0E1eo4R)
//    授权 CC-BY 3.0 —— 本注释即署名，请勿删除。
//  - Kenney 的模型统一规格：Y 轴向上、车底在 y=0、长轴沿 z、单张 colormap 图集
//    （颜色烘在贴图里，所以不再走程序化换色，多样性靠车型混排）。
//  - bakeCarModel 把 GLTF 场景整理成统一规格：
//      车头朝 +X、车底落在 y = 0、x/z 居中、横向宽度缩放到 spec.width
//    上层沿用「每辆车一个 rotationY（车头 +X 为 0）」的老约定，车流逻辑零改动。
//  - facing 记录每个模型的原始车头朝向；渲染验证时如果某款车反了，只改这里。
// ============================================================
import * as THREE from 'three'

/**
 * 车型规格：
 *   file   glb 文件名（不含扩展名）
 *   width  归一化后的横向宽度（旋转对齐后垂直于行进方向的尺寸），是缩放基准。
 *          场景车道宽 2.0（ASPHALT=4 双向），轿车取 ~1.2、公交 1.8。
 *   facing 模型原始车头朝向（作者建模方向不统一，见 YAW_FOR）
 *   speed  相对速度系数：大车慢、跑车快
 */
export const CAR_SPECS = {
  sedan: { file: 'sedan', width: 1.2, facing: '+z', speed: 1.0 },
  sedanSports: { file: 'sedan-sports', width: 1.15, facing: '+z', speed: 1.1 },
  suv: { file: 'suv', width: 1.25, facing: '+z', speed: 1.0 },
  suvLuxury: { file: 'suv-luxury', width: 1.25, facing: '+z', speed: 1.0 },
  van: { file: 'van', width: 1.25, facing: '+z', speed: 0.95 },
  taxi: { file: 'taxi', width: 1.25, facing: '+z', speed: 1.0 },
  delivery: { file: 'delivery', width: 1.3, facing: '+z', speed: 0.9 },
  deliveryFlat: { file: 'delivery-flat', width: 1.3, facing: '+z', speed: 0.9 },
  truck: { file: 'truck', width: 1.3, facing: '+z', speed: 0.85 },
  truckFlat: { file: 'truck-flat', width: 1.3, facing: '+z', speed: 0.85 },
  bus: { file: 'city-bus', width: 1.8, facing: '+z', speed: 0.8 }
}

export const CAR_MODEL_DIR = `${import.meta.env.BASE_URL}models/cars`

export const carModelUrl = (key) => `${CAR_MODEL_DIR}/${CAR_SPECS[key].file}.glb`

/** 全部车型模型 URL（供预加载 / useGLTF 数组调用） */
export const ALL_CAR_MODEL_URLS = Object.keys(CAR_SPECS).map(carModelUrl)

/** 原始车头朝向 → 绕 Y 旋转角（转到 +X） */
const YAW_FOR = { '+x': 0, '-x': Math.PI, '+z': Math.PI / 2, '-z': -Math.PI / 2 }

/**
 * 把一个已加载的 GLTF 场景包成统一规格的模板 Object3D。
 * 返回的节点 clone(true) 后可直接挂进场景：几何与材质共享，变换独立。
 *
 * @param {THREE.Object3D} srcScene GLTF 的根对象
 * @param {{ width:number, facing:string }} spec 车型规格
 * @returns {THREE.Object3D} 模板（车头 +X、车底 y=0、x/z 居中）
 */
export function bakeCarModel(srcScene, spec) {
  const root = new THREE.Object3D()
  const inner = srcScene.clone(true)
  inner.rotation.y = YAW_FOR[spec.facing] ?? 0
  root.add(inner)
  root.updateMatrixWorld(true)

  // 第一次量：旋转后的包围盒 → 按横向宽度定缩放
  const b1 = new THREE.Box3().setFromObject(root)
  const size = b1.getSize(new THREE.Vector3())
  const lateral = Math.min(size.x, size.z) // 旋转后长轴必沿 x，横向取较小边
  if (!(lateral > 1e-6)) throw new Error('bakeCarModel: 模型包围盒异常')
  root.scale.setScalar(spec.width / lateral)
  root.updateMatrixWorld(true)

  // 第二次量：缩放后的包围盒 → 车底落地、x/z 居中
  const b2 = new THREE.Box3().setFromObject(root)
  const center = b2.getCenter(new THREE.Vector3())
  root.position.set(-center.x, -b2.min.y, -center.z)
  root.updateMatrixWorld(true)

  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return root
}
