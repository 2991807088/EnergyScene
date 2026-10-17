import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { createCityTexture } from '@/three/cityTexture'
import { GROUND_SIZE, CITY_DEPTH, CITY_EXTENSION_Z } from '@/three/cityLayout'

const lerp = (a, b, t) => a + (b - a) * t

/**
 * 城市地面：
 * - 分层道路、标线、人行道与绿地，一张不重复的纹理覆盖城区
 * - 天气控制路面粗糙度和反射，晴天干燥、雨天湿润
 * - appearance（粗糙度 / 金属度 / 反射强度）随昼夜环境平滑过渡
 */
export default function CityGround({ appearance }) {
  const matRef = useRef()

  const map = useMemo(() => createCityTexture(4096), [])

  useFrame((_, dt) => {
    const m = matRef.current
    if (!m || !appearance) return
    const k = 1 - Math.exp(-6 * dt)
    m.roughness = lerp(m.roughness, appearance.roughness, k)
    m.metalness = lerp(m.metalness, appearance.metalness, k)
    m.mixStrength = lerp(m.mixStrength, appearance.mirror, k)
    if (typeof m.mirror === 'number') {
      m.mirror = lerp(m.mirror, appearance.mirror, k)
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, CITY_EXTENSION_Z / 2]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, CITY_DEPTH]} />
      <MeshReflectorMaterial
        ref={matRef}
        map={map}
        resolution={1024}
        mixBlur={1}
        mixStrength={0.08}
        blur={[300, 100]}
        roughness={0.86}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        metalness={0.04}
        mirror={0.08}
        color="#ffffff"
      />
    </mesh>
  )
}
