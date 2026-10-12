import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { createCityTexture } from '@/three/cityTexture'
import { GROUND_SIZE } from '@/three/cityLayout'

const lerp = (a, b, t) => a + (b - a) * t

/**
 * 城市地面：
 * - 程序化城市俯瞰纹理（街道网格 + 标线 + 人行道），**一张不重复的大图 1:1 铺满**
 *   （不用小 tile 平铺：街区边长 16、地面 200，200/16 = 12.5 不是整数，平铺接缝必然错位）
 * - MeshReflectorMaterial 实时镜面反射，做出微湿柏油质感
 * - appearance（粗糙度 / 金属度 / 反射强度）随昼夜环境平滑过渡
 */
export default function CityGround({ appearance }) {
  const matRef = useRef()

  const map = useMemo(() => createCityTexture(2048), [])

  useFrame((_, dt) => {
    const m = matRef.current
    if (!m || !appearance) return
    const k = 1 - Math.exp(-6 * dt)
    m.roughness = lerp(m.roughness, appearance.roughness, k)
    m.metalness = lerp(m.metalness, appearance.metalness, k)
    if (typeof m.mirror === 'number') {
      m.mirror = lerp(m.mirror, appearance.mirror, k)
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <MeshReflectorMaterial
        ref={matRef}
        map={map}
        resolution={1024}
        mixBlur={8}
        mixStrength={1.2}
        blur={[300, 100]}
        roughness={0.78}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        metalness={0.5}
        mirror={0.55}
        color="#ffffff"
      />
    </mesh>
  )
}
