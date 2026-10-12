import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { generateCity } from '@/three/buildings'

function BuildingBatch({ batch }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4()
    const rotation = new THREE.Quaternion()
    batch.meshes.forEach((mesh, i) => {
      matrix.compose(new THREE.Vector3(...mesh.position), rotation, new THREE.Vector3(...mesh.scale))
      ref.current.setMatrixAt(i, matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [batch])
  return <instancedMesh ref={ref} args={[batch.geometry, batch.material, batch.meshes.length]} castShadow receiveShadow />
}

/**
 * 城市建筑：住宅 / 商场 / 工厂 三类体量。
 * 布局与材质全部在 @/three/buildings 里生成，这里只负责渲染。
 */
export default function Buildings({ lightLevel = 1 }) {
  const { meshes, geometries, lightMaterials } = useMemo(() => generateCity(), [])
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
    </group>
  )
}
