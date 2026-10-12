import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIRECTION } from '@/three/environments'

// 与 DayNightRig 里的主光（directionalLight）共用同一方向，保证「光照方向 = 太阳位置」
const SUN_DIR = new THREE.Vector3(...SUN_DIRECTION).normalize()
// 放得足够远，让太阳落在整片山川之外——否则会看着像悬在城边、
// 甚至比远处的山脊还低。球体与光晕尺寸按距离等比放大，保持张角不变。
const SUN_DIST = 160
const SUN_BODY_RADIUS = 4.2 // 张角约 3.0°
const SUN_GLOW_SCALE = 21 // 张角约 7.5°，刚好整圈留在画面上沿以内（垂直半视角 22.5°，太阳在中心上方 18°）

/** 太阳光晕贴图：中心暖白、向外淡出的径向渐变 */
function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.14, 'rgba(255,250,232,0.95)')
  g.addColorStop(0.34, 'rgba(255,226,158,0.5)')
  g.addColorStop(0.68, 'rgba(255,201,112,0.14)')
  g.addColorStop(1, 'rgba(255,190,90,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * 太阳：天空中的发光球体 + 光晕（billboard）。
 * 仅在「晴朗的白天」显示；切换时淡入淡出，不是硬切。
 *
 * 位置必须每帧跟着相机走：天空盒里画的太阳在「无穷远」，
 * 而网格球放得再远也是有限距离。相机拉到 maxDistance(150) 时，
 * 160 距离的视差会让网格太阳比贴图太阳低约 9°，看着就是两个太阳。
 */
export default function Sun({ visible = false }) {
  const groupRef = useRef()
  const bodyMat = useRef()
  const glowMat = useRef()
  const opacity = useRef(0)

  const glowTex = useMemo(() => makeGlowTexture(), [])

  useFrame((state, dt) => {
    if (groupRef.current) {
      groupRef.current.position.copy(state.camera.position).addScaledVector(SUN_DIR, SUN_DIST)
    }

    const target = visible ? 1 : 0
    opacity.current += (target - opacity.current) * Math.min(dt * 2.5, 1)
    const o = opacity.current

    if (groupRef.current) groupRef.current.visible = o > 0.01
    if (bodyMat.current) bodyMat.current.opacity = o
    if (glowMat.current) glowMat.current.opacity = o * 0.95
  })

  return (
    <group ref={groupRef}>
      {/* 太阳本体 */}
      <mesh>
        <sphereGeometry args={[SUN_BODY_RADIUS, 32, 32]} />
        <meshBasicMaterial
          ref={bodyMat}
          color="#fff7e0"
          transparent
          opacity={0}
          toneMapped={false}
          fog={false}
        />
      </mesh>

      {/* 光晕（sprite 总是朝向相机） */}
      <sprite scale={[SUN_GLOW_SCALE, SUN_GLOW_SCALE, 1]}>
        <spriteMaterial
          ref={glowMat}
          map={glowTex}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </sprite>
    </group>
  )
}
