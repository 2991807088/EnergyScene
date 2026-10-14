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
const mallWindow = new THREE.MeshStandardMaterial({ color: '#b8d1ce', emissive: '#e4c58d', emissiveIntensity: 0.16, metalness: 0.38, roughness: 0.18 })

function Block({ x, y, z, w, h, d, material = wall }) {
  return <mesh geometry={box} material={material} position={[x, y + h / 2, z]} scale={[w, h, d]} castShadow receiveShadow />
}

function Sign({ name, x, y, z, width = 24 }) {
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
  return <mesh position={[x, y, z]}><planeGeometry args={[width, width * 160 / 1024]} /><meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} /></mesh>
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

function TaikooLi() {
  const area = CITY_ZONES.mall
  const x = (area.minX + area.maxX) / 2
  const z = (area.minZ + area.maxZ) / 2
  const y = terrainHeight(x, z)
  return <>
    <Pad area={area} material={mallStone} />
    {/* 三座低层体量围合入口广场，玻璃店面朝向步行空间。 */}
    <Block x={x} y={y} z={z - 17} w={44} h={12} d={18} material={mallStone} />
    <Block x={x} y={y + 1.2} z={z - 7.85} w={41} h={8.2} d={0.3} material={mallGlass} />
    <FacadeWindows x={x} y={y} z={z - 17} width={44} depth={18.8} height={12} frontRows={2} material={mallWindow} />
    <Block x={x} y={y + 12} z={z - 17} w={45} h={0.7} d={19} material={mallBronze} />
    {[-13, 0, 13].map((dx) => <group key={dx}>
      <Block x={x + dx} y={y + 12.7} z={z - 17} w={9} h={0.18} d={10} material={mallStone} />
      <Block x={x + dx} y={y + 12.88} z={z - 17} w={8} h={0.2} d={9} material={mallGlass} />
    </group>)}
    {[-20, 20].map((dx) => <group key={dx}>
      <Block x={x + dx} y={y} z={z + 4} w={13} h={9} d={28} material={mallStone} />
      <FacadeWindows x={x + dx} y={y} z={z + 4} width={13} depth={28} height={9} frontRows={2} material={mallWindow} />
      <Block x={x + dx - Math.sign(dx) * 6.65} y={y + 1} z={z + 4} w={0.3} h={6.8} d={24} material={mallGlass} />
      <Block x={x + dx} y={y + 9} z={z + 4} w={13.5} h={0.65} d={28.5} material={mallBronze} />
      <Block x={x + dx} y={y + 9.7} z={z + 4} w={8} h={0.25} d={18} material={mallGreen} />
      <Block x={x + dx} y={y + 8} z={z + 18.3} w={13.5} h={0.7} d={3.8} material={mallBronze} />
    </group>)}
    {Array.from({ length: 9 }, (_, i) => <Block key={i} x={x - 20 + i * 5} y={y + 1.2} z={z - 7.55} w={0.2} h={8.2} d={0.25} material={mallBronze} />)}
    <Block x={x} y={y + 0.02} z={z + 12} w={25} h={0.08} d={18} material={mallBronze} />
    {[-14, 14].map((dx) => <Block key={dx} x={x + dx} y={y} z={z + 22} w={1.4} h={11} d={1.4} material={mallBronze} />)}
    <Block x={x} y={y + 8.4} z={z + 22} w={30} h={2.8} d={1.8} material={mallBronze} />
    <TaikooSign x={x} y={y + 9.8} z={z + 23} />
    {[-10, 10].map((dx) => <group key={dx}>
      <Block x={x + dx} y={y} z={z + 12} w={3.5} h={0.75} d={3.5} material={mallBronze} />
      <Block x={x + dx} y={y + 0.75} z={z + 12} w={2.6} h={1.3} d={2.6} material={mallGreen} />
    </group>)}
  </>
}

function PowerBuildings({ wind, thermalGenerating }) {
  const thermal = EAST_SITES.thermal
  const diesel = CITY_ZONES.diesel
  // 两根烟囱随火电厂场区移动，分别落在两栋厂房屋面内。
  const cx = (thermal.minX + thermal.maxX) / 2
  const cz = (thermal.minZ + thermal.maxZ) / 2
  const stackZ = cz - 15
  const sy = terrainHeight(cx, cz)
  const stacks = [cx - 10, cx + 10]
  return <>
    <Hall area={thermal} name="火力发电厂" count={2} />
    {stacks.map((x) => <mesh key={x} position={[x, sy + 21, stackZ]} castShadow><cylinderGeometry args={[2.2, 2.7, 42, 12]} /><meshStandardMaterial color="#aab5ba" roughness={0.75} /></mesh>)}
    {thermalGenerating && <SmokePlume mouths={stacks.map((x) => ({ x, y: sy + 42, z: stackZ, radius: 2.2 }))} wind={wind} />}
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
    <Block x={-32} y={0} z={-100} w={22} h={5} d={0.4} material={dark} />
    <Sign name="新能源充电站" x={-32} y={3} z={-99.7} width={19} />
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
