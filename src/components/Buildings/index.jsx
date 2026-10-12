import { useMemo } from 'react'
import { generateCity } from '@/three/buildings'

/**
 * 城市建筑：住宅 / 商场 / 工厂 三类体量。
 * 布局与材质全部在 @/three/buildings 里生成，这里只负责渲染。
 */
export default function Buildings() {
  const { meshes, geometries } = useMemo(() => generateCity(), [])

  return (
    <group>
      {meshes.map((b, i) => (
        <mesh
          key={i}
          geometry={geometries[b.geoKey]}
          material={b.material}
          position={b.position}
          scale={b.scale}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}
