import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CITY_ZONES, EAST_SITES } from '@/three/cityLayout'
import { terrainHeight } from '@/three/terrain'
import { getTurbineSpin } from '@/three/environments'
import { SOLAR_PANEL_TINT } from '@/three/solarFarm'
import SmokePlume from '@/components/SmokePlume'
import EastSubstation from '@/components/EastSubstation'

const box = new THREE.BoxGeometry(1, 1, 1)
const tower = new THREE.CylinderGeometry(0.38, 0.62, 1, 10)
const blade = new THREE.CylinderGeometry(0.05, 0.28, 1, 5)
const steel = new THREE.MeshStandardMaterial({ color: '#d7e1e6', metalness: 0.52, roughness: 0.42 })
const roof = new THREE.MeshStandardMaterial({ color: '#55748a', metalness: 0.35, roughness: 0.48 })
const wall = new THREE.MeshStandardMaterial({ color: '#c5d1d8', roughness: 0.68 })
const dark = new THREE.MeshStandardMaterial({ color: '#364855', roughness: 0.6 })
const padGrey = new THREE.MeshStandardMaterial({ color: '#a0a8a7', roughness: 0.94 })
const rooftopPanel = new THREE.MeshStandardMaterial({ color: SOLAR_PANEL_TINT, roughness: 0.16, metalness: 0.35 })
const mallStone = new THREE.MeshStandardMaterial({ color: '#c8c3b7', roughness: 0.62 })
const mallBronze = new THREE.MeshStandardMaterial({ color: '#806c54', metalness: 0.62, roughness: 0.37 })
const mallGlass = new THREE.MeshStandardMaterial({ color: '#315568', metalness: 0.42, roughness: 0.14 })
const mallGreen = new THREE.MeshStandardMaterial({ color: '#547451', roughness: 0.9 })
const stationWindow = new THREE.MeshStandardMaterial({ color: '#83b0c5', emissive: '#5e9db9', emissiveIntensity: 0.16, metalness: 0.42, roughness: 0.22 })
const mallWindow = new THREE.MeshStandardMaterial({ color: '#47616a', emissive: '#dfba7d', emissiveIntensity: 0.28, metalness: 0.38, roughness: 0.18 })
const mallLight = new THREE.MeshStandardMaterial({ color: '#ffe6b1', emissive: '#ffd28b', emissiveIntensity: 1.3, roughness: 0.4 })
const mallPaving = new THREE.MeshStandardMaterial({ color: '#979b96', roughness: 0.95 })

function Block({ x, y, z, w, h, d, material = wall }) {
  return <mesh geometry={box} material={material} position={[x, y + h / 2, z]} scale={[w, h, d]} castShadow receiveShadow />
}

function Sign({ name, x, y, z, width = 24, rotationY = 0 }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 160
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1d3d53'
    ctx.fillRect(0, 0, 1024, 160)
    ctx.strokeStyle = '#a5d7e7'
    ctx.lineWidth = 7
    ctx.strokeRect(5, 5, 1014, 150)
    ctx.fillStyle = '#f2f7fa'
    ctx.font = 'bold 100px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, 512, 82, 930)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [name])
  return <mesh position={[x, y, z]} rotation={[0, rotationY, 0]}><planeGeometry args={[width, width * 160 / 1024]} /><meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} /></mesh>
}

function Pad({ area, material = padGrey }) {
  const x = (area.minX + area.maxX) / 2
  const z = (area.minZ + area.maxZ) / 2
  const y = terrainHeight(x, z)
  return <Block x={x} y={y - 0.15} z={z} w={area.maxX - area.minX} h={0.35} d={area.maxZ - area.minZ} material={material} />
}

function FacadeWindows({ x, z, y, width, depth, height, frontRows = 1, material = stationWindow }) {
  const ref = useRef()
  const windows = useMemo(() => {
    const result = []
    const rows = Math.max(1, Math.floor((height - 2) / 3.2))
    const along = (span) => Math.max(2, Math.floor((span - 3) / 4.2))
    for (const side of [-1, 1]) {
      const cols = along(width)
      for (let row = 0; row < (side > 0 ? frontRows : rows); row++) {
        for (let col = 0; col < cols; col++) {
          result.push([x + (col - (cols - 1) / 2) * (width - 4) / cols, y + 2.2 + row * 3.2, z + side * (depth / 2 + 0.14), 0])
        }
      }
    }
    for (const side of [-1, 1]) {
      const cols = along(depth)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          result.push([x + side * (width / 2 + 0.14), y + 2.2 + row * 3.2, z + (col - (cols - 1) / 2) * (depth - 4) / cols, Math.PI / 2])
        }
      }
    }
    return result
  }, [x, z, y, width, depth, height, frontRows])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const scale = new THREE.Vector3(2.1, 1.35, 0.12)
    for (let i = 0; i < windows.length; i++) {
      const [wx, wy, wz, angle] = windows[i]
      position.set(wx, wy, wz)
      rotation.setFromAxisAngle(up, angle)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [windows])
  return <instancedMesh ref={ref} args={[box, material, windows.length]} />
}

function RoofPanels({ x, z, y, width, depth }) {
  const ref = useRef()
  const cols = Math.floor((width - 4) / 5.6)
  const rows = Math.floor((depth - 5) / 4)
  const positions = useMemo(() => Array.from({ length: rows * cols }, (_, i) => ({
    x: x + (i % cols - (cols - 1) / 2) * 5.6,
    z: z + (Math.floor(i / cols) - (rows - 1) / 2) * 4
  })), [x, z, rows, cols])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 12, 0, 0))
    const scale = new THREE.Vector3(5.2, 0.1, 2.3)
    for (let i = 0; i < positions.length; i++) {
      matrix.compose(new THREE.Vector3(positions[i].x, y + 1, positions[i].z), rotation, scale)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [positions, y])
  return <instancedMesh ref={ref} args={[box, rooftopPanel, positions.length]} castShadow receiveShadow />
}

function Hall({ area, name, count = 2, solarRoof = false }) {
  const cx = (area.minX + area.maxX) / 2
  const cz = (area.minZ + area.maxZ) / 2
  const base = terrainHeight(cx, cz)
  const width = area.maxX - area.minX
  const depth = area.maxZ - area.minZ
  const hallW = (width - 18) / count - 4
  const h = name === '火力发电厂' ? 15 : name === '柴油发电站' ? 9 : 11
  return <>
    <Pad area={area} />
    {Array.from({ length: count }, (_, i) => {
      const x = area.minX + 11 + hallW / 2 + i * (hallW + 4)
      return <group key={i}>
        <Block x={x} y={base} z={cz} w={hallW} h={h} d={depth - 16} />
        <FacadeWindows x={x} y={base} z={cz} width={hallW} depth={depth - 16} height={h} />
        <Block x={x} y={base + h} z={cz} w={hallW + 1} h={0.6} d={depth - 15} material={roof} />
        {solarRoof && <RoofPanels x={x} z={cz} y={base + h} width={hallW} depth={depth - 16} />}
        {[-1, 1].map((side) => <Block key={side} x={x + side * hallW * 0.28} y={base + h * 0.42} z={area.maxZ - 7.8} w={hallW * 0.21} h={h * 0.42} d={0.2} material={dark} />)}
      </group>
    })}
    <Sign name={name} x={area.minX + 11 + hallW / 2} y={base + h * 0.73} z={area.maxZ - 7.55} width={Math.min(34, hallW * 0.8)} />
  </>
}

function TaikooSign({ x, y, z }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1a2225'
    ctx.fillRect(0, 0, 1024, 256)
    ctx.strokeStyle = '#bca57b'
    ctx.lineWidth = 9
    ctx.strokeRect(12, 12, 1000, 232)
    ctx.fillStyle = '#f3e8cd'
    ctx.font = 'bold 170px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('太古里', 512, 132)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [])
  return <mesh position={[x, y, z]}><planeGeometry args={[19, 4.75]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
}

// 圆角体量共用单位几何；挤出方向转为向上，底面位于 y=0。
const mallRounded = (() => {
  const shape = new THREE.Shape()
  const r = 0.12
  shape.moveTo(-0.5 + r, -0.5)
  shape.lineTo(0.5 - r, -0.5)
  shape.quadraticCurveTo(0.5, -0.5, 0.5, -0.5 + r)
  shape.lineTo(0.5, 0.5 - r)
  shape.quadraticCurveTo(0.5, 0.5, 0.5 - r, 0.5)
  shape.lineTo(-0.5 + r, 0.5)
  shape.quadraticCurveTo(-0.5, 0.5, -0.5, 0.5 - r)
  shape.lineTo(-0.5, -0.5 + r)
  shape.quadraticCurveTo(-0.5, -0.5, -0.5 + r, -0.5)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 6 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
})()

function MallVolume({ x, y, z, w, h, d, material }) {
  return <mesh geometry={mallRounded} material={material} position={[x, y, z]} scale={[w, h, d]} castShadow receiveShadow />
}

function MallPavilion({ x, y, z, floors, terraceSide }) {
  const w = 19
  const d = 12
  return <>
    {Array.from({ length: floors }, (_, floor) => {
      // 上层向外侧退台，将绿化露台朝向中央步行街。
      const inset = floor === 2 ? 2.6 : floor * 0.65
      const cx = x + terraceSide * inset * 0.4
      const width = w - inset
      const depth = d - inset * 0.7
      const base = y + 0.3 + floor * 3.5
      return <group key={floor}>
        <MallVolume x={cx} y={base} z={z} w={width} h={3.2} d={depth} material={mallWindow} />
        <MallVolume x={cx} y={base + 2.85} z={z} w={width + 0.8} h={0.3} d={depth + 0.8} material={mallStone} />
        <MallVolume x={cx} y={base + 3.15} z={z} w={width + 0.75} h={0.09} d={depth + 0.75} material={mallLight} />
        <MallVolume x={cx} y={base + 3.24} z={z} w={width + 0.9} h={0.26} d={depth + 0.9} material={mallStone} />
        {[-1, 1].map((side) => <group key={side}>
          {[-6, -2, 2, 6].map((dx) => <Block key={dx} x={cx + dx * width / w} y={base} z={z + side * (depth / 2 - 0.1)} w={0.16} h={2.85} d={0.22} material={mallBronze} />)}
          <Block x={cx + side * (width / 2 - 0.1)} y={base} z={z} w={0.22} h={2.85} d={0.18} material={mallBronze} />
        </group>)}
      </group>
    })}
    <MallVolume x={x + terraceSide} y={y + 0.3 + floors * 3.5} z={z} w={12} h={0.18} d={7} material={mallGreen} />
    <MallVolume x={x + terraceSide * 2} y={y + 0.5 + floors * 3.5} z={z - 1} w={6} h={0.5} d={4} material={mallBronze} />
    <MallVolume x={x + terraceSide * 2} y={y + 1 + floors * 3.5} z={z - 1} w={5.5} h={0.16} d={3.5} material={mallGlass} />
    {/* 内街一侧的二层花槽及入口雨棚。 */}
    <Block x={x - terraceSide * 8.6} y={y + 3.8} z={z} w={0.9} h={0.5} d={7} material={mallBronze} />
    <Block x={x - terraceSide * 8.6} y={y + 4.3} z={z} w={0.75} h={0.35} d={6.7} material={mallGreen} />
    <MallVolume x={x - terraceSide * 9} y={y + 2.8} z={z + 2} w={3.2} h={0.15} d={3} material={mallBronze} />
  </>
}

function TaikooLi() {
  const area = CITY_ZONES.mall
  const x = (area.minX + area.maxX) / 2
  const z = (area.minZ + area.maxZ) / 2
  const y = terrainHeight(x, z)
  return <group name="taikoo-li-pedestrian-quarter">
    <Pad area={area} material={mallStone} />
    {/* 六栋独立商铺，中央十米主街与两条横巷贯通至四周人行道。 */}
    <Block x={x} y={y + 0.21} z={z} w={10} h={0.04} d={56} material={mallPaving} />
    {[-9, 9].map((dz) => <Block key={dz} x={x} y={y + 0.21} z={z + dz} w={56} h={0.04} d={5} material={mallPaving} />)}
    {[-1, 1].flatMap((side) => [-18, 0, 18].map((dz, row) =>
      <MallPavilion key={`${side}-${row}`} x={x + side * 15} y={y} z={z + dz} floors={(side === -1 && row !== 1) || (side === 1 && row === 1) ? 3 : 2} terraceSide={side} />
    ))}
    {/* 两端二层连桥留出下方通行净空，中央广场保持露天。 */}
    {[-18, 18].map((dz) => <group key={dz}>
      <Block x={x} y={y + 3.65} z={z + dz} w={12} h={0.3} d={2.8} material={mallStone} />
      {[-1, 1].map((side) => <group key={side}>
        <Block x={x} y={y + 3.95} z={z + dz + side * 1.3} w={12} h={0.8} d={0.12} material={mallGlass} />
        <Block x={x} y={y + 4.75} z={z + dz + side * 1.3} w={12} h={0.08} d={0.16} material={mallLight} />
      </group>)}
    </group>)}
    {/* 中央口袋广场与沿街树池，保持主街中线畅通。 */}
    {[-1, 1].flatMap((side) => [-9, 9, 25].map((dz) => <group key={`${side}-${dz}`}>
      <MallVolume x={x + side * 3.6} y={y + 0.25} z={z + dz} w={1.8} h={0.55} d={2.8} material={mallBronze} />
      <MallVolume x={x + side * 3.6} y={y + 0.8} z={z + dz} w={1.6} h={0.18} d={2.6} material={mallGreen} />
      <Block x={x + side * 3.6} y={y + 0.9} z={z + dz} w={0.22} h={2.5} d={0.22} material={mallBronze} />
      <mesh position={[x + side * 3.6, y + 3.9, z + dz]} material={mallGreen} castShadow><sphereGeometry args={[1.15, 10, 8]} /></mesh>
    </group>))}
    {[-1, 1].map((side) => <Block key={side} x={x + side * 3.6} y={y + 0.25} z={z} w={0.8} h={0.55} d={4} material={mallBronze} />)}
    <TaikooSign x={x + 15} y={y + 5} z={z + 24.3} />
  </group>
}

// ---------- 火力发电厂：双曲线冷却塔 + 红白烟囱 + 主厂房群 ----------
// 参照实景照片：两座双曲线冷却塔（塔身略收腰、顶部蓝带、「冷却水塔」字样、
// 底部绿环）冒白色蒸汽；东侧一根细高烟囱、顶部刷红白色带；中央是厂房群
// ——南侧长条汽轮机房（挂厂名）、中间高锅炉房（外露钢柱）、四周小附房和储罐。

const COOLING_TOWER = { h: 31, rWaist: 5.2, waistY: 0.68, curve: 12.5 }

let _towerGeo = null
/** 双曲线母线：r(y) = rWaist·√(1+((y−喉部高)/curve)²)，底部约 2× 喉部、顶部约 1.3× */
function coolingTowerGeometry() {
  if (_towerGeo) return _towerGeo
  const { h, rWaist, waistY, curve } = COOLING_TOWER
  const y0 = h * waistY
  const points = []
  const N = 18
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * h
    points.push(new THREE.Vector2(rWaist * Math.sqrt(1 + ((y - y0) / curve) ** 2), y))
  }
  _towerGeo = new THREE.LatheGeometry(points, 36)
  return _towerGeo
}

let _towerTex = null
function coolingTowerTexture() {
  if (_towerTex) return _towerTex
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')
  // 混凝土塔身 + 环向施工缝
  g.fillStyle = '#d9d5ca'
  g.fillRect(0, 0, 512, 256)
  g.fillStyle = 'rgba(120,114,104,0.12)'
  for (let y = 14; y < 240; y += 18) g.fillRect(0, y, 512, 1.4)
  // 底部绿环（塔底绿化/围护）
  g.fillStyle = '#2e5c3c'
  g.fillRect(0, 244, 512, 12)
  // 顶部蓝带 + 上下白边（照片里塔顶那道醒目的蓝圈）
  g.fillStyle = '#1e5fa8'
  g.fillRect(0, 34, 512, 22)
  g.fillStyle = 'rgba(255,255,255,0.9)'
  g.fillRect(0, 31, 512, 3)
  g.fillRect(0, 56, 512, 3)
  // 圆形厂标 + 「冷却水塔」字样（贴图横向重复 4 次，绕塔一圈都能看到）
  g.strokeStyle = '#2b6cb0'
  g.lineWidth = 5
  g.beginPath()
  g.arc(256, 112, 16, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#2b6cb0'
  g.font = 'bold 36px "PingFang SC", "Microsoft YaHei", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('冷却水塔', 256, 160)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(4, 1)
  t.anisotropy = 8
  _towerTex = t
  return t
}

let _towerMat = null
function coolingTowerMaterial() {
  if (!_towerMat) {
    _towerMat = new THREE.MeshStandardMaterial({
      map: coolingTowerTexture(),
      color: '#e8e3d8', // 整体略微压暖压灰，别在阳光下泛纯白
      roughness: 0.88,
      metalness: 0.04,
      side: THREE.DoubleSide
    })
  }
  return _towerMat
}

let _stackTex = null
function stackTexture() {
  if (_stackTex) return _stackTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#d3d7d7'
  g.fillRect(0, 0, 128, 512)
  // 顶部航空色带：红白相间
  g.fillStyle = '#c0392b'
  g.fillRect(0, 0, 128, 34)
  g.fillStyle = '#f3f5f5'
  g.fillRect(0, 34, 128, 22)
  g.fillStyle = '#c0392b'
  g.fillRect(0, 56, 128, 30)
  g.fillStyle = '#f3f5f5'
  g.fillRect(0, 86, 128, 10)
  // 竖向微纹理
  g.fillStyle = 'rgba(110,115,118,0.10)'
  for (let x = 0; x < 128; x += 16) g.fillRect(x, 96, 1, 416)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  _stackTex = t
  return t
}

function CoolingTower({ x, z, base }) {
  const geometry = useMemo(coolingTowerGeometry, [])
  const material = useMemo(coolingTowerMaterial, [])
  return (
    <group position={[x, base, z]}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {/* 塔口内侧压暗：从上方俯视时不会看到亮蓝色内壁 */}
      <mesh position={[0, COOLING_TOWER.h - 2.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.4, 32]} />
        <meshStandardMaterial color="#4c5257" roughness={1} />
      </mesh>
    </group>
  )
}

// ---------- 火电厂建筑外立面：工业墙板贴图 ----------
// 汽轮机房＝浅灰墙板 + 中部横条窗带；锅炉房＝通高竖向百叶 + 上部高窗带。
// 贴图横向一个重复 = 一个开间（WALL_BAY 米），按墙面长度折算 repeat。
const WALL_BAY = 5.5

const _wallCanvasCache = {}
function wallCanvas(variant) {
  if (_wallCanvasCache[variant]) return _wallCanvasCache[variant]
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  const hJoints = (color, step, w) => {
    g.strokeStyle = color
    g.lineWidth = w
    for (let y = step; y < 236; y += step) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(256, y)
      g.stroke()
    }
  }
  const glazing = (top, bottom) => {
    g.fillStyle = '#7aa2b8'
    g.fillRect(0, top, 256, bottom - top)
    g.strokeStyle = '#4b565e'
    g.lineWidth = 3
    for (let x = 0; x <= 256; x += 32) {
      g.beginPath()
      g.moveTo(x, top)
      g.lineTo(x, bottom)
      g.stroke()
    }
    g.beginPath()
    g.moveTo(0, top)
    g.lineTo(256, top)
    g.stroke()
    g.beginPath()
    g.moveTo(0, bottom)
    g.lineTo(256, bottom)
    g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.16)'
    g.fillRect(0, top + 2, 256, Math.min(12, (bottom - top) * 0.16))
  }
  if (variant === 'boiler') {
    g.fillStyle = '#c6cdd2'
    g.fillRect(0, 0, 256, 256)
    // 通高竖向百叶
    g.strokeStyle = 'rgba(78,88,96,0.30)'
    g.lineWidth = 2
    for (let x = 5; x < 256; x += 9) {
      g.beginPath()
      g.moveTo(x, 88)
      g.lineTo(x, 236)
      g.stroke()
    }
    glazing(27, 81)
    g.fillStyle = '#b5bdc3'
    g.fillRect(0, 0, 256, 8)
    hJoints('rgba(80,90,100,0.25)', 26, 1.6)
    g.fillStyle = '#98a1a7'
    g.fillRect(0, 236, 256, 20)
  } else {
    g.fillStyle = '#cdd3d8'
    g.fillRect(0, 0, 256, 256)
    hJoints('rgba(92,102,112,0.22)', 26, 1.6)
    glazing(81, 169)
    // 窗上沿一道蓝灰色装饰带
    g.fillStyle = 'rgba(96,136,160,0.55)'
    g.fillRect(0, 74, 256, 5)
    // 檐口
    g.fillStyle = '#b9c1c7'
    g.fillRect(0, 0, 256, 9)
    g.fillStyle = 'rgba(70,80,90,0.22)'
    g.fillRect(0, 9, 256, 2)
    g.fillStyle = '#9ba4aa'
    g.fillRect(0, 236, 256, 20)
  }
  _wallCanvasCache[variant] = c
  return c
}

const _wallTexCache = new Map()
function wallTexture(variant, repeatX) {
  const key = `${variant}|${repeatX}`
  if (_wallTexCache.has(key)) return _wallTexCache.get(key)
  const t = new THREE.CanvasTexture(wallCanvas(variant))
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(repeatX, 1)
  t.anisotropy = 8
  _wallTexCache.set(key, t)
  return t
}

const _wallMatCache = new Map()
function wallMaterial(variant, lenUnits) {
  // 开间数取 0.5 的整数倍，窗格节奏不落在半格上
  const repeatX = Math.max(2, Math.round((lenUnits / WALL_BAY) * 2) / 2)
  const key = `${variant}|${repeatX}`
  if (_wallMatCache.has(key)) return _wallMatCache.get(key)
  const m = new THREE.MeshStandardMaterial({
    map: wallTexture(variant, repeatX),
    roughness: 0.8,
    metalness: 0.05
  })
  _wallMatCache.set(key, m)
  return m
}

const plantRoof = new THREE.MeshStandardMaterial({ color: '#6e7d88', roughness: 0.72, metalness: 0.15 })
const plantSteel = new THREE.MeshStandardMaterial({ color: '#9fb0ba', roughness: 0.45, metalness: 0.5 })

/** 火电厂整体：坐标写死在厂区（x∈[330,472]，z∈[166,276]）内，与阵列式厂房无关 */
function ThermalPlant({ base, wind, generating }) {
  const towerSpots = [
    [352, 199],
    [385, 199]
  ]
  const steamMouths = towerSpots.map(([x, z]) => ({
    x,
    y: base + COOLING_TOWER.h + 0.6,
    z,
    radius: 6,
    size: 1.7 // 冷却塔口径大，蒸汽更饱满
  }))
  // 六面材质数组顺序：[+x, -x, +y, -y, +z, -z]，上下两面用屋面板
  const hallMats = [
    wallMaterial('hall', 30), wallMaterial('hall', 30), plantRoof, plantRoof,
    wallMaterial('hall', 66), wallMaterial('hall', 66)
  ]
  const boilerMats = [
    wallMaterial('boiler', 28), wallMaterial('boiler', 28), plantRoof, plantRoof,
    wallMaterial('boiler', 34), wallMaterial('boiler', 34)
  ]
  const auxAMats = [
    wallMaterial('hall', 20), wallMaterial('hall', 20), plantRoof, plantRoof,
    wallMaterial('hall', 20), wallMaterial('hall', 20)
  ]
  const auxBMats = [
    wallMaterial('hall', 16), wallMaterial('hall', 16), plantRoof, plantRoof,
    wallMaterial('hall', 14), wallMaterial('hall', 14)
  ]
  const auxCMats = [
    wallMaterial('hall', 12), wallMaterial('hall', 12), plantRoof, plantRoof,
    wallMaterial('hall', 18), wallMaterial('hall', 18)
  ]
  return (
    <>
      <Pad area={EAST_SITES.thermal} />
      {towerSpots.map(([x, z]) => <CoolingTower key={x} x={x} z={z} base={base} />)}
      {/* 高烟囱：细长塔身 + 顶部红白色带 + 深色塔帽（立在汽轮机房东侧） */}
      <mesh position={[466, base + 19, 208]} castShadow>
        <cylinderGeometry args={[1.5, 1.8, 38, 16]} />
        <meshStandardMaterial map={stackTexture()} roughness={0.72} metalness={0.08} />
      </mesh>
      <mesh position={[466, base + 38.6, 208]} castShadow>
        <cylinderGeometry args={[1.65, 1.65, 1.4, 16]} />
        <meshStandardMaterial color="#53595e" roughness={0.6} metalness={0.25} />
      </mesh>
      {/* 汽轮机房：条窗墙板 + 壁柱 + 入口雨棚 + 屋顶通风帽，南立面挂厂名 */}
      <mesh geometry={box} material={hallMats} position={[430, base + 6.75, 209]} scale={[66, 13.5, 30]} castShadow receiveShadow />
      {Array.from({ length: 11 }, (_, i) => (
        <group key={i}>
          <Block x={402.5 + i * 5.5} y={base} z={193.85} w={0.4} h={13.5} d={0.4} material={plantSteel} />
          <Block x={402.5 + i * 5.5} y={base} z={224.15} w={0.4} h={13.5} d={0.4} material={plantSteel} />
        </group>
      ))}
      <Block x={430} y={base + 13.5} z={209} w={67} h={0.6} d={31} material={plantRoof} />
      {[408, 420, 440, 452].map((x) => (
        <Block key={x} x={x} y={base + 14.1} z={209} w={2.6} h={1.2} d={2.6} material={plantSteel} />
      ))}
      <Block x={430} y={base} z={193.75} w={8} h={3.8} d={0.4} material={dark} />
      <Block x={430} y={base + 4.7} z={192.3} w={11} h={0.35} d={3.2} material={plantRoof} />
      {[426, 434].map((x) => (
        <Block key={x} x={x} y={base} z={191} w={0.35} h={4.7} d={0.35} material={plantSteel} />
      ))}
      <Sign name="火力发电厂" x={430} y={base + 8.6} z={193.4} width={22} rotationY={Math.PI} />
      {/* 锅炉房：通高百叶墙 + 外露钢柱钢梁 + 屋顶排气管 */}
      <mesh geometry={box} material={boilerMats} position={[422, base + 9.5, 246]} scale={[34, 19, 28]} castShadow receiveShadow />
      {[234, 240, 246, 252, 258].map((z) => (
        <group key={z}>
          <Block x={404.7} y={base} z={z} w={0.6} h={19} d={0.6} material={plantSteel} />
          <Block x={439.3} y={base} z={z} w={0.6} h={19} d={0.6} material={plantSteel} />
        </group>
      ))}
      {[6.5, 12.5, 18.5].map((y) => (
        <group key={y}>
          <Block x={404.7} y={base + y} z={246} w={0.5} h={0.5} d={28.6} material={plantSteel} />
          <Block x={439.3} y={base + y} z={246} w={0.5} h={0.5} d={28.6} material={plantSteel} />
        </group>
      ))}
      <Block x={422} y={base + 19} z={246} w={35} h={0.7} d={29} material={plantRoof} />
      {[414, 430].map((x) => (
        <mesh key={x} position={[x, base + 21.2, 251]} castShadow>
          <cylinderGeometry args={[1.15, 1.15, 3, 12]} />
          <meshStandardMaterial color="#aeb7bd" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      <Block x={422} y={base + 19.7} z={238} w={5} h={1.7} d={4} material={plantSteel} />
      {/* 蒸汽管：锅炉房 → 汽轮机房 */}
      {[414, 421, 428].map((x) => (
        <mesh key={x} position={[x, base + 10.6, 228]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.62, 0.62, 8.4, 12]} />
          <meshStandardMaterial color="#b9c2c8" roughness={0.38} metalness={0.55} />
        </mesh>
      ))}
      {/* 输煤栈桥：煤场斜上到锅炉房，含支撑柱与头部转运间 */}
      <mesh geometry={box} position={[380.5, base + 8, 240]} rotation={[0, 0, Math.atan2(13.4, 48.2)]} scale={[50, 2.3, 3]} castShadow receiveShadow>
        <meshStandardMaterial color="#b6bec4" roughness={0.7} metalness={0.2} />
      </mesh>
      {[[362, 1.7], [374, 5.0], [386, 8.3], [398, 11.7]].map(([x, h]) => (
        <Block key={x} x={x} y={base} z={240} w={0.5} h={h} d={0.5} material={plantSteel} />
      ))}
      <Block x={406} y={base + 12.7} z={240} w={4.5} h={5.2} d={5} material={plantRoof} />
      {/* 煤场：暗色煤堆 */}
      <mesh position={[344, base + 1.65, 238]} scale={[1.2, 0.55, 1]} castShadow>
        <coneGeometry args={[7.5, 6, 12]} />
        <meshStandardMaterial color="#2f3437" roughness={1} />
      </mesh>
      {/* 升压站：主变压器 + 门型构架 */}
      {[[450, 252], [458, 257]].map(([x, z]) => (
        <group key={x}>
          <Block x={x} y={base} z={z} w={4.2} h={3.2} d={2.6} material={dark} />
          <Block x={x} y={base + 3.2} z={z} w={4.4} h={0.3} d={2.8} material={plantSteel} />
          {[-1.3, 0, 1.3].map((dx) => (
            <mesh key={dx} position={[x + dx, base + 4.1, z]} castShadow>
              <cylinderGeometry args={[0.14, 0.14, 1.5, 8]} />
              <meshStandardMaterial color="#d3dade" roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
      {[447, 463].map((x) => (
        <group key={x}>
          <Block x={x - 4} y={base} z={266} w={0.55} h={8.5} d={0.55} material={plantSteel} />
          <Block x={x + 4} y={base} z={266} w={0.55} h={8.5} d={0.55} material={plantSteel} />
          <Block x={x} y={base + 8.5} z={266} w={9.3} h={0.55} d={0.55} material={plantSteel} />
        </group>
      ))}
      {/* 附属建筑（同款墙板）与储罐 */}
      <mesh geometry={box} material={auxAMats} position={[352, base + 3.5, 260]} scale={[20, 7, 20]} castShadow receiveShadow />
      <Block x={352} y={base + 7} z={260} w={20.6} h={0.4} d={20.6} material={plantRoof} />
      <mesh geometry={box} material={auxBMats} position={[461, base + 4.5, 187]} scale={[14, 9, 16]} castShadow receiveShadow />
      <Block x={461} y={base + 9} z={187} w={14.6} h={0.4} d={16.6} material={plantRoof} />
      <mesh geometry={box} material={auxCMats} position={[421, base + 3, 184]} scale={[18, 6, 12]} castShadow receiveShadow />
      <Block x={421} y={base + 6} z={184} w={18.6} h={0.4} d={12.6} material={plantRoof} />
      {[447, 454].map((x) => (
        <mesh key={x} position={[x, base + 3.5, 232]} castShadow>
          <cylinderGeometry args={[2.2, 2.2, 7, 16]} />
          <meshStandardMaterial color="#dfe4e6" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {generating && <SmokePlume mouths={steamMouths} wind={wind} />}
    </>
  )
}

function PowerBuildings({ wind, thermalGenerating }) {
  const thermal = EAST_SITES.thermal
  const diesel = CITY_ZONES.diesel
  // 火电厂整体坐在场区中心标高上（与 Pad 顶面一致）
  const cx = (thermal.minX + thermal.maxX) / 2
  const cz = (thermal.minZ + thermal.maxZ) / 2
  const sy = terrainHeight(cx, cz)
  return <>
    <ThermalPlant base={sy} wind={wind} generating={thermalGenerating} />
    <Hall area={diesel} name="柴油发电站" count={2} />
    {[112, 128, 144].map((x) => <mesh key={x} position={[x, 7, 88]} castShadow><cylinderGeometry args={[3.4, 3.4, 14, 16]} /><meshStandardMaterial color="#768992" metalness={0.45} roughness={0.47} /></mesh>)}
  </>
}

const windSpots = Array.from({ length: 5 }, (_, col) =>
  Array.from({ length: 4 }, (_, row) => [EAST_SITES.wind.minX + 18 + col * 34, EAST_SITES.wind.minZ + 32 + row * 34])
).flat()
function EastWindFarm({ wind }) {
  const rotors = useRef([])
  const spin = getTurbineSpin(wind)
  const buildingX = EAST_SITES.wind.minX + 10
  const buildingZ = EAST_SITES.wind.minZ + 10
  useFrame((_, dt) => {
    for (const rotor of rotors.current) if (rotor) rotor.rotation.z -= spin * Math.min(dt, 0.05)
  })
  return <>
    <Block x={buildingX} y={terrainHeight(buildingX, buildingZ)} z={buildingZ} w={20} h={5} d={12} />
    <FacadeWindows x={buildingX} y={terrainHeight(buildingX, buildingZ)} z={buildingZ} width={20} depth={12} height={5} frontRows={0} />
    <Sign name="风力电站" x={buildingX} y={terrainHeight(buildingX, buildingZ) + 3} z={buildingZ + 6.15} width={16} />
    {windSpots.map(([x, z], i) => {
      const base = terrainHeight(x, z)
      return <group key={i} position={[x, base, z]}>
        <mesh geometry={tower} material={steel} position={[0, 15, 0]} scale={[1, 30, 1]} castShadow />
        <Block x={0} y={29.7} z={0.7} w={1.3} h={1.1} d={2.4} material={steel} />
        <group ref={(el) => { rotors.current[i] = el }} position={[0, 30.2, 2]}>
          {[0, 1, 2].map((n) => <group key={n} rotation={[0, 0, n * Math.PI * 2 / 3]}>
            <mesh geometry={blade} material={steel} position={[0, 5, 0]} scale={[1, 10, 0.5]} castShadow />
          </group>)}
        </group>
      </group>
    })}
  </>
}

export default function PlannedFacilities({ wind = 0, thermalGenerating = true, hydroGenerating = true }) {
  const solarBuildingX = EAST_SITES.solar.minX + 8
  const solarBuildingZ = EAST_SITES.solar.minZ + 6
  return <>
    <PowerBuildings wind={wind} thermalGenerating={thermalGenerating} />
    <EastSubstation wind={wind} thermalGenerating={thermalGenerating} hydroGenerating={hydroGenerating} />
    <TaikooLi />
    <Hall area={EAST_SITES.factoryNorth} name="工业厂房 A" count={3} solarRoof />
    <Hall area={EAST_SITES.factorySouth} name="工业厂房 B" count={3} solarRoof />
    <Hall area={EAST_SITES.factoryRow3} name="工业厂房 C" count={3} solarRoof />
    <Hall area={EAST_SITES.factoryRow4} name="工业厂房 D" count={3} solarRoof />
    <Block x={solarBuildingX} y={terrainHeight(solarBuildingX, solarBuildingZ)} z={solarBuildingZ} w={14} h={5} d={11} />
    <FacadeWindows x={solarBuildingX} y={terrainHeight(solarBuildingX, solarBuildingZ)} z={solarBuildingZ} width={14} depth={11} height={5} frontRows={0} />
    <Sign name="光伏电站" x={solarBuildingX} y={terrainHeight(solarBuildingX, solarBuildingZ) + 3} z={solarBuildingZ + 5.65} width={12} />
    <EastWindFarm wind={wind} />
  </>
}
