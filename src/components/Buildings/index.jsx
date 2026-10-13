import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { generateCity } from '@/three/buildings'
import { BUILDING_MODELS, ALL_BUILDING_MODEL_URLS, bakeBuildingModel } from '@/three/buildingModels'

function BuildingBatch({ batch }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4()
    const rotation = new THREE.Quaternion()
    batch.meshes.forEach((mesh, i) => {
      rotation.setFromEuler(new THREE.Euler(...(mesh.rotation ?? [0, 0, 0])))
      matrix.compose(new THREE.Vector3(...mesh.position), rotation, new THREE.Vector3(...mesh.scale))
      ref.current.setMatrixAt(i, matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [batch])
  return <instancedMesh ref={ref} args={[batch.geometry, batch.material, batch.meshes.length]} castShadow receiveShadow />
}

/** 模型楼窗光基准强度（Kenney 图集无独立发光通道，用贴图本身兼作 emissiveMap；
 *  强度取低值 —— 只求夜里楼体隐约可辨，避免白墙整面发光像「鬼楼」） */
const MODEL_GLOW = 0.06

/**
 * 真实楼宇模型：渲染 generateCity 划出的 modelSites（部分住宅街区）。
 * 走 Suspense：模型加载期间只挂起这一层，程序化建筑照常显示。
 */
function ModelBuildings({ sites, lightLevel }) {
  const gltfs = useGLTF(ALL_BUILDING_MODEL_URLS)
  const { objects, materials } = useMemo(() => {
    // 每款烘一次模板，站点实例 clone(true) 共享几何与材质
    const templates = {}
    Object.keys(BUILDING_MODELS).forEach((key, i) => {
      templates[key] = bakeBuildingModel(gltfs[i].scene, BUILDING_MODELS[key])
    })

    // 每款收集一份发光材质克隆：emissiveMap 复用图集，夜晚窗户泛光随 lightLevel 调节
    const materials = []
    for (const tpl of Object.values(templates)) {
      tpl.traverse((o) => {
        if (!o.isMesh) return
        const src = Array.isArray(o.material) ? o.material[0] : o.material
        const m = src.clone()
        m.emissive = new THREE.Color('#ffffff')
        m.emissiveMap = src.map ?? null
        m.emissiveIntensity = MODEL_GLOW * lightLevel
        o.material = m
        materials.push(m)
      })
    }

    const objects = sites.map((s, i) => {
      const obj = templates[s.key].clone()
      obj.position.set(s.x, 0, s.z)
      obj.rotation.y = s.rotationY
      return obj
    })
    return { objects, materials }
  }, [gltfs, sites, lightLevel])

  useEffect(() => {
    for (const m of materials) m.emissiveIntensity = MODEL_GLOW * lightLevel
  }, [materials, lightLevel])

  return (
    <group>
      {objects.map((obj, i) => <primitive key={i} object={obj} />)}
    </group>
  )
}

/**
 * 城市建筑：住宅 / 商场 / 工厂及中心区特色高层。
 * 布局与材质全部在 @/three/buildings 里生成，这里只负责渲染。
 * 部分住宅街区由 generateCity 划给真实楼宇模型（见 three/buildingModels.js）。
 */
export default function Buildings({ lightLevel = 1 }) {
  const { meshes, geometries, lightMaterials, modelSites } = useMemo(() => generateCity(), [])
  const batches = useMemo(() => {
    const result = []
    for (const mesh of meshes) {
      const geometry = geometries[mesh.geoKey]
      let batch = result.find((b) => b.geometry === geometry && b.material === mesh.material)
      if (!batch) {
        batch = { geometry, material: mesh.material, meshes: [] }
        result.push(batch)
      }
      batch.meshes.push(mesh)
    }
    return result
  }, [meshes, geometries])

  useEffect(() => {
    for (const { material, baseIntensity } of lightMaterials) {
      material.emissiveIntensity = baseIntensity * lightLevel
    }
  }, [lightMaterials, lightLevel])

  return (
    <group>
      {batches.map((batch, i) => <BuildingBatch key={i} batch={batch} />)}
      <Suspense fallback={null}>
        <ModelBuildings sites={modelSites} lightLevel={lightLevel} />
      </Suspense>
    </group>
  )
}

// 提前发起全部楼宇模型的加载
useGLTF.preload(ALL_BUILDING_MODEL_URLS)
