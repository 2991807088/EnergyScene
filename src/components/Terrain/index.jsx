import { useMemo } from 'react'
import { generateTerrain } from '@/three/terrain'

/**
 * 城郊山川：一整块覆盖城区及外围山脊的地形网格。
 * 城区范围内高度恒为 0，所以整块往下压 0.06 藏到城市地面之下，避免共面 z-fighting。
 */
export default function Terrain() {
  const geometry = useMemo(() => generateTerrain(), [])

  return (
    <mesh geometry={geometry} position={[0, -0.06, 0]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.96} metalness={0.02} />
    </mesh>
  )
}
