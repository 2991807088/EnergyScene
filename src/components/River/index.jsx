import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  HYDRO,
  RIVER,
  buildRiverSurface,
  createRiverMaterial,
  tickRiverMaterial
} from '@/three/river'
import { PLUNGE_POOL, buildHydropower, hydropowerUnitBox } from '@/three/hydropower'

const UNIT_BOX = hydropowerUnitBox()
const HALF_DAM = HYDRO.depth / 2

/** 泄洪水帘：从闸门底垂下的抛物线水面，落到消力池里 */
function buildSpillGeometry(spill, rows = 12) {
  const positions = []
  const uvs = []
  const indices = []
  const halfW = spill.width / 2
  const dz = spill.bottomZ - spill.topZ
  const dy = spill.bottomY - spill.topY

  for (let i = 0; i <= rows; i++) {
    const t = i / rows
    // 先平后陡：闸门出流初速水平，之后被重力拉下去
    const y = spill.topY + dy * Math.pow(t, 1.45)
    const z = spill.topZ + dz * t
    positions.push(spill.x - halfW, y, z, spill.x + halfW, y, z)
    uvs.push(0, t * 2.4, 1, t * 2.4)
  }
  for (let i = 0; i < rows; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** 水帘贴图：竖向流水条纹 */
function spillTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 64, 128)
  for (let i = 0; i < 260; i++) {
    const v = 200 + Math.floor(Math.random() * 55)
    ctx.fillStyle = `rgba(${v},${v + 4},${255},${0.35 + Math.random() * 0.5})`
    ctx.fillRect(Math.random() * 64, Math.random() * 128, 1, 2 + Math.random() * 16)
  }
  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.colorSpace = THREE.SRGBColorSpace
  return map
}

/** 坝下水雾：从消力池升起的白色水花 */
function PlungeSpray({ spills }) {
  const pointsRef = useRef()
  const COUNT = 220

  const { seeds, positions } = useMemo(() => {
    const xs = spills.length ? spills.map((s) => s.x) : [0]
    const seedList = new Float32Array(COUNT * 4)
    for (let i = 0; i < COUNT; i++) {
      seedList[i * 4] = xs[Math.floor(Math.random() * xs.length)] + (Math.random() - 0.5) * 14
      seedList[i * 4 + 1] = PLUNGE_POOL.z + (Math.random() - 0.5) * 16
      seedList[i * 4 + 2] = Math.random()
      seedList[i * 4 + 3] = 3 + Math.random() * 6
    }
    return { seeds: seedList, positions: new Float32Array(COUNT * 3) }
  }, [spills])

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: '#eef7fb',
        size: 2.6,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
      }),
    []
  )

  useFrame((state) => {
    const mesh = pointsRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    const base = RIVER.lowerLevel + 0.4
    for (let i = 0; i < COUNT; i++) {
      const x0 = seeds[i * 4]
      const z0 = seeds[i * 4 + 1]
      const phase = seeds[i * 4 + 2]
      const rise = seeds[i * 4 + 3]
      const p = ((t * 0.32 + phase) % 1 + 1) % 1
      const spread = Math.pow(p, 0.75)
      positions[i * 3] = x0 + (x0 > 0 ? 1 : -1) * spread * 3.2
      positions[i * 3 + 1] = base + rise * p
      positions[i * 3 + 2] = z0 + spread * 5.5
    }
    mesh.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pointsRef} material={material} renderOrder={3}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
    </points>
  )
}

/** 中文标牌（canvas 贴图，与城北电站墙面标牌同一套做法） */
function Sign({ text, position, width, height, rotation = [0, 0, 0], style = 'station' }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = style === 'river' ? 384 : 200
    const ctx = canvas.getContext('2d')
    const bg = style === 'river' ? '#12496e' : '#233b51'
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = style === 'river' ? '#cfe6f5' : '#d5e3e9'
    ctx.lineWidth = 10
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${style === 'river' ? 190 : 116}px "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 80)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    return map
  }, [text, style])

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

/**
 * 长江：上游水库段 + 坝下游急流段两张水面，中间夹水电站。
 *
 * 水面用 MeshStandardMaterial + onBeforeCompile 注入流动法线与白沫，
 * 因此昼夜灯光、天空盒反射、雾效都自动跟场景走。
 */
export default function River() {
  const { boxes, signs, spills } = useMemo(() => buildHydropower(), [])

  const upstreamGeo = useMemo(
    () => buildRiverSurface({ fromZ: RIVER.zFrom, toZ: HYDRO.z - HALF_DAM, step: 4 }),
    []
  )
  const downstreamGeo = useMemo(
    () => buildRiverSurface({ fromZ: HYDRO.z + HALF_DAM, toZ: RIVER.zTo, step: 4 }),
    []
  )

  // 水库水面平静、反射强；坝下流速快、波碎、白沫多
  const upstreamMat = useMemo(
    () =>
      createRiverMaterial({
        color: '#123f57',
        opacity: 0.93,
        roughness: 0.14,
        envMapIntensity: 0.75,
        flowSpeed: 0.5,
        waveAmp: 0.09,
        waveScale: 0.3,
        normalStrength: 0.8,
        shoreFoam: 0.2
      }),
    []
  )
  const downstreamMat = useMemo(
    () =>
      createRiverMaterial({
        color: '#0f3448',
        opacity: 0.95,
        roughness: 0.19,
        envMapIntensity: 0.7,
        flowSpeed: 1.7,
        waveAmp: 0.26,
        waveScale: 0.85,
        normalStrength: 1,
        shoreFoam: 0.34,
        plungeZ: PLUNGE_POOL.z,
        plungeReach: 20,
        plungeStrength: 0.72
      }),
    []
  )

  const spillMap = useMemo(spillTexture, [])
  const spillGeo = useMemo(() => spills.map((s) => buildSpillGeometry(s)), [spills])
  const spillMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: spillMap,
        color: '#dcecf5',
        transparent: true,
        opacity: 0.72,
        roughness: 0.25,
        metalness: 0,
        emissive: '#8fb9cf',
        emissiveIntensity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false
      }),
    [spillMap]
  )

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    tickRiverMaterial(upstreamMat, t)
    tickRiverMaterial(downstreamMat, t)
    spillMap.offset.y -= dt * 0.75
  })

  return (
    <group>
      <mesh geometry={upstreamGeo} material={upstreamMat} receiveShadow renderOrder={1} />
      <mesh geometry={downstreamGeo} material={downstreamMat} receiveShadow renderOrder={1} />

      {boxes.map((box, i) => (
        <mesh
          key={`hp-${i}`}
          geometry={UNIT_BOX}
          material={box.material}
          position={box.position}
          rotation={box.rotation}
          scale={box.scale}
          castShadow
          receiveShadow
        />
      ))}

      {spillGeo.map((geo, i) => (
        <mesh key={`spill-${i}`} geometry={geo} material={spillMat} renderOrder={2} />
      ))}

      {signs.map((sign) => (
        <Sign key={sign.text} {...sign} />
      ))}

      <PlungeSpray spills={spills} />
    </group>
  )
}
