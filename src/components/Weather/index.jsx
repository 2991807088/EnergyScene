import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GROUND_SIZE } from '@/three/cityLayout'

// 粒子分布范围。城区从 120×120 放大到 200×200 后同步外扩，
// 否则拉远看全城时，雨雪只盖住中间一小块。
const AREA = GROUND_SIZE + 40
const HEIGHT = 44 // 粒子分布的高度

/** 雨丝贴图：一条上下淡出的竖线 */
function makeRainTexture() {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 32
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 32)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.95)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(3, 0, 2, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 雪花贴图：柔边圆点 */
function makeSnowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(32, 32, 32, 0, Math.PI * 2)
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 雨：快速下落 + 受风力影响的横向漂移，落到底部后循环回顶部 */
function Rain({ wind = 0, count = 6000 }) {
  const geomRef = useRef()
  const drift = useRef(0)

  const { pos, speed } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const speed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * AREA
      pos[i * 3 + 1] = Math.random() * HEIGHT
      pos[i * 3 + 2] = (Math.random() - 0.5) * AREA
      speed[i] = 24 + Math.random() * 16
    }
    return { pos, speed }
  }, [count])

  const tex = useMemo(() => makeRainTexture(), [])

  useFrame((_, dt) => {
    const g = geomRef.current
    if (!g) return
    const d = Math.min(dt, 0.05)
    const targetDrift = 0.5 + wind * 0.55
    drift.current += (targetDrift - drift.current) * Math.min(d * 3, 1)

    const arr = g.attributes.position.array
    for (let i = 0; i < count; i++) {
      const yi = i * 3 + 1
      arr[yi] -= speed[i] * d
      arr[i * 3] += drift.current * d
      if (arr[yi] < 0) {
        arr[yi] += HEIGHT
        arr[i * 3] = (Math.random() - 0.5) * AREA
        arr[i * 3 + 2] = (Math.random() - 0.5) * AREA
      }
    }
    g.attributes.position.needsUpdate = true
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        color="#c3d8ff"
        size={0.6}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </points>
  )
}

/** 雪：缓慢飘落 + 左右摇摆，受风力影响 */
function Snow({ wind = 0, count = 3200 }) {
  const geomRef = useRef()

  const { pos, speed, phase } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const speed = new Float32Array(count)
    const phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * AREA
      pos[i * 3 + 1] = Math.random() * HEIGHT
      pos[i * 3 + 2] = (Math.random() - 0.5) * AREA
      speed[i] = 0.9 + Math.random() * 1.6
      phase[i] = Math.random() * Math.PI * 2
    }
    return { pos, speed, phase }
  }, [count])

  const tex = useMemo(() => makeSnowTexture(), [])

  useFrame((state, dt) => {
    const g = geomRef.current
    if (!g) return
    const d = Math.min(dt, 0.05)
    const t = state.clock.elapsedTime
    const sway = 0.4 + wind * 0.15
    const fall = 1 + wind * 0.05

    const arr = g.attributes.position.array
    for (let i = 0; i < count; i++) {
      const yi = i * 3 + 1
      arr[yi] -= speed[i] * fall * d
      arr[i * 3] += Math.sin(t * 0.8 + phase[i]) * sway * d
      arr[i * 3 + 2] += Math.cos(t * 0.6 + phase[i]) * sway * 0.6 * d
      if (arr[yi] < 0) {
        arr[yi] += HEIGHT
        arr[i * 3] = (Math.random() - 0.5) * AREA
        arr[i * 3 + 2] = (Math.random() - 0.5) * AREA
      }
    }
    g.attributes.position.needsUpdate = true
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        color="#ffffff"
        size={0.4}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  )
}

/**
 * 天气粒子总入口。
 * - 雨 / 雪：粒子系统
 * - 晴 / 雾：无粒子（雾由 scene.fog 体积雾实现，见 weather.js + Scene 的 DayNightRig）
 */
export default function Weather({ weather = 'clear', wind = 0 }) {
  if (weather === 'rain') return <Rain wind={wind} />
  if (weather === 'snow') return <Snow wind={wind} />
  return null
}
