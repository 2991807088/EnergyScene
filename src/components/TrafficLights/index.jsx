import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SIGNAL_JUNCTIONS, verticalRoadX, horizontalRoadZ } from '@/three/cityLayout'
import { signalAt, intensityFor } from '@/three/traffic'

const LIGHT_COLORS = {
  green: '#57e07a',
  yellow: '#ffd23f',
  red: '#ff5a52'
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 倒计时数字（canvas 纹理；sprite 始终朝向相机，任何角度都能读到） */
const Countdown = forwardRef(function Countdown({ position }, ref) {
  const { canvas, ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 80
    const ctx = canvas.getContext('2d')
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return { canvas, ctx, texture }
  }, [])

  const last = useRef({ v: -1, s: '' })

  useImperativeHandle(
    ref,
    () => ({
      set(value, state) {
        if (value === last.current.v && state === last.current.s) return
        last.current = { v: value, s: state }

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = 'rgba(10,14,20,0.82)'
        roundRect(ctx, 6, 6, 116, 68, 16)
        ctx.fill()

        ctx.fillStyle = LIGHT_COLORS[state] ?? '#ffffff'
        ctx.font = 'bold 54px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(value), 64, 43)

        texture.needsUpdate = true
      }
    }),
    [canvas, ctx, texture]
  )

  return (
    <sprite position={position} scale={[1.05, 0.66, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  )
})

/**
 * 一个信号头（红黄绿 + 倒计时），服务某个方向的车流。
 * @param {'ns'|'ew'} direction 该信号对应的通行方向
 */
function SignalHead({ position, rotationY = 0, direction }) {
  const red = useRef()
  const yellow = useRef()
  const green = useRef()
  const countdown = useRef()

  useFrame((state) => {
    const sig = signalAt(state.clock.elapsedTime)
    const s = sig[direction]

    if (red.current) red.current.emissiveIntensity = intensityFor(s, 'red')
    if (yellow.current) yellow.current.emissiveIntensity = intensityFor(s, 'yellow')
    if (green.current) green.current.emissiveIntensity = intensityFor(s, 'green')
    if (countdown.current)
      countdown.current.set(Math.max(1, Math.ceil(sig.remain)), s)
  })

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 立杆 */}
      <mesh position={[0, 1.7, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 3.4, 10]} />
        <meshStandardMaterial color="#2f343b" roughness={0.7} metalness={0.4} />
      </mesh>

      {/* 灯箱 */}
      <mesh position={[0, 3.75, 0]} castShadow>
        <boxGeometry args={[0.34, 1.05, 0.26]} />
        <meshStandardMaterial color="#20252b" roughness={0.6} metalness={0.5} />
      </mesh>

      {/* 红 / 黄 / 绿 */}
      <mesh position={[0, 4.08, 0.15]}>
        <sphereGeometry args={[0.105, 16, 16]} />
        <meshStandardMaterial
          ref={red}
          color="#3a1010"
          emissive="#ff3b30"
          emissiveIntensity={0.1}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 3.75, 0.15]}>
        <sphereGeometry args={[0.105, 16, 16]} />
        <meshStandardMaterial
          ref={yellow}
          color="#3a3010"
          emissive="#ffcc00"
          emissiveIntensity={0.1}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 3.42, 0.15]}>
        <sphereGeometry args={[0.105, 16, 16]} />
        <meshStandardMaterial
          ref={green}
          color="#0f2a17"
          emissive="#34d058"
          emissiveIntensity={0.1}
          toneMapped={false}
        />
      </mesh>

      {/* 倒计时 */}
      <Countdown ref={countdown} position={[0, 4.78, 0.04]} />
    </group>
  )
}

/** 灯杆到路口中心的偏移（要落在沥青面之外、人行道内侧） */
const CORNER = 2.2

/**
 * 路口红绿灯：每个路口两组（南北 / 东西），相位互斥。
 * 灯杆摆在路口的两个对角上，灯面分别朝向对应方向的车流。
 */
export default function TrafficLights() {
  const junctions = SIGNAL_JUNCTIONS.map(([a, b]) => [verticalRoadX(a), horizontalRoadZ(b)])

  return (
    <group>
      {junctions.map(([x, z], i) => (
        <group key={i}>
          {/* 南北向信号，灯面朝 -z */}
          <SignalHead position={[x + CORNER, 0, z - CORNER]} rotationY={Math.PI} direction="ns" />
          {/* 东西向信号，灯面朝 +x */}
          <SignalHead position={[x - CORNER, 0, z + CORNER]} rotationY={Math.PI / 2} direction="ew" />
        </group>
      ))}
    </group>
  )
}
