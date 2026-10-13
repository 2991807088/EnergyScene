import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  buildChargingStation,
  chargingUnitBox,
  chargingPanelMaterial,
  chargingMaterials,
  chargingCableMaterial,
  chargingCable,
  stationSignTexture,
  CHARGING,
  CHARGING_OFFSET
} from '@/three/chargingStation'

// 单位立方体几何（所有方盒 / 面板共用，尺寸烘进实例矩阵）
const BOX_GEO = chargingUnitBox()
const ARRIVAL_TIME = 11
const CYCLE_TIME = 30
const NORTH_AISLE_Z = CHARGING.canopy.maxZ + 4
const CAR_PATH = new THREE.CatmullRomCurve3([
  new THREE.Vector3(CHARGING.minX - 3.5, 0, CHARGING.gate.z),
  new THREE.Vector3(CHARGING.minX + 5.5, 0, CHARGING.gate.z),
  new THREE.Vector3(CHARGING.minX + 6, 0, NORTH_AISLE_Z),
  new THREE.Vector3(CHARGING.bay.x0 + CHARGING.bay.w / 2, 0, NORTH_AISLE_Z),
  new THREE.Vector3(CHARGING.bay.x0 + CHARGING.bay.w / 2, 0, CHARGING.bay.rowCenterZ[2])
])

/** 驶入车辆最终停进的车位（棚下北排 0 号位） */
const ARRIVE_BAY = { row: 2, i: 0 }
const ARRIVE_CABLE = chargingCable(ARRIVE_BAY.row, ARRIVE_BAY.i)

/** 门楣站名招牌（canvas 贴图平面，做法同厂区 / 规划区标牌） */
function StationSign({ position, rotationY, width, height }) {
  const texture = useMemo(() => stationSignTexture(), [])
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

function ArrivingCar() {
  const car = useRef()
  const led = useRef()
  const cable = useRef()
  const position = useMemo(() => new THREE.Vector3(), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const { car: size } = CHARGING
  const M = useMemo(chargingMaterials, [])
  const cableMat = useMemo(chargingCableMaterial, [])
  // 停车位置固定，线缆走线一次性建好（停稳后才显示）
  const cableGeo = useMemo(
    () =>
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(...ARRIVE_CABLE.start),
          new THREE.Vector3(...ARRIVE_CABLE.control),
          new THREE.Vector3(...ARRIVE_CABLE.end)
        ),
        14,
        0.045,
        6,
        false
      ),
    []
  )

  useFrame(({ clock }) => {
    const time = clock.elapsedTime % CYCLE_TIME
    const arriving = time < ARRIVAL_TIME
    const progress = arriving ? time / ARRIVAL_TIME : 1
    CAR_PATH.getPointAt(progress, position)
    CAR_PATH.getTangentAt(Math.min(progress, 0.999), tangent)
    car.current.position.copy(position)
    car.current.rotation.y = Math.atan2(tangent.x, tangent.z)
    led.current.emissiveIntensity = arriving ? 0.1 : 1.2 + Math.sin(time * 5) * 0.7
    cable.current.visible = !arriving
  })

  return (
    <>
      <group ref={car} position={CAR_PATH.points[0]}>
        <mesh geometry={BOX_GEO} position={[0, size.bodyH / 2, 0]} scale={[size.bodyW, size.bodyH, size.len]} castShadow>
          <meshStandardMaterial color="#d7e5eb" roughness={0.35} metalness={0.45} />
        </mesh>
        <mesh geometry={BOX_GEO} position={[0, size.bodyH + size.cabinH / 2 - 0.06, -0.25]} scale={[size.bodyW - 0.16, size.cabinH, size.cabinLen]} castShadow>
          <meshStandardMaterial color="#2b3a4a" roughness={0.18} metalness={0.5} />
        </mesh>
        {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
          <mesh key={`${x}:${z}`} geometry={BOX_GEO} position={[x * (size.bodyW / 2 - 0.05), 0.33, z * 1.45]} scale={[0.26, 0.62, 0.62]} castShadow>
            <meshStandardMaterial color="#20262c" roughness={0.95} />
          </mesh>
        )))}
        <mesh geometry={BOX_GEO} position={[0, 0.86, size.len / 2 - 0.08]} scale={[0.34, 0.09, 0.05]}>
          <meshStandardMaterial ref={led} color="#1f7a45" emissive="#28c06a" emissiveIntensity={0.1} />
        </mesh>
      </group>
      {/* 停稳后从充电桩接出充电线：桩上枪座 -> 车头充电口 */}
      <group ref={cable} visible={false}>
        <mesh geometry={cableGeo} material={cableMat} castShadow />
        <mesh geometry={BOX_GEO} material={M.charger} position={ARRIVE_CABLE.gun} scale={[0.18, 0.22, 0.3]} />
        <mesh geometry={BOX_GEO} material={M.ledOn} position={ARRIVE_CABLE.tip} scale={[0.09, 0.09, 0.08]} />
      </group>
    </>
  )
}

/**
 * 储能充电站：光伏顶棚 + 棚下充电车位 + 新能源车充电 + 集装箱储能。
 *
 * 选址与布局参数见 three/chargingStation.js 顶部注释（由第二张斜俯视截图
 * 反解相机位姿 -> 反投红框 -> 世界范围 x ∈ [16,96]、z ∈ [-96,-32]）。
 *
 * 渲染包括：
 *   · 静态方盒（场院 / 顶棚钢构 / 车位划线 / 充电桩 / 储能柜 / 车辆 / 管理房）—— 共用单位立方体
 *   · 围栏段 —— 每段自己的重复贴图，单独材质
 *   · 顶棚光伏 —— 一个 InstancedMesh，颜色走 instanceColor
 *   · 充电线 —— 每台在充电的车一条，从充电桩枪座垂到车头充电口（TubeGeometry 贝塞尔下垂）
 *   · 门楣站名招牌 —— 「新能源超级充电站」，朝站外 / 站内各一面
 *   · 驶入车辆 —— 沿站内通道开进空车位，停稳后点亮充电指示并接出充电线
 */
export default function ChargingStation() {
  const { boxes, fence, panels, cables, sign } = useMemo(() => buildChargingStation(), [])
  const panelMat = useMemo(() => chargingPanelMaterial(), [])
  const cableMat = useMemo(chargingCableMaterial, [])
  const cableGeos = useMemo(
    () =>
      cables.map(
        (c) =>
          new THREE.TubeGeometry(
            new THREE.QuadraticBezierCurve3(
              new THREE.Vector3(...c.start),
              new THREE.Vector3(...c.control),
              new THREE.Vector3(...c.end)
            ),
            14,
            0.045,
            6,
            false
          )
      ),
    [cables]
  )
  const panelsRef = useRef()

  useLayoutEffect(() => {
    const mesh = panelsRef.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    for (let i = 0; i < panels.count; i++) {
      m.fromArray(panels.matrices, i * 16)
      mesh.setMatrixAt(i, m)
      c.setRGB(panels.tones[i * 3], panels.tones[i * 3 + 1], panels.tones[i * 3 + 2])
      mesh.setColorAt(i, c)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [panels])

  return (
    <group position={[CHARGING_OFFSET.x, 0, CHARGING_OFFSET.z]}>
      {boxes.map((b, i) => (
        <mesh
          key={`b${i}`}
          geometry={BOX_GEO}
          material={b.material}
          position={b.position}
          scale={b.scale}
          rotation={b.rotation ?? undefined}
          castShadow
          receiveShadow
        />
      ))}

      {fence.map((f, i) => (
        <mesh
          key={`f${i}`}
          geometry={BOX_GEO}
          material={f.material}
          position={f.position}
          scale={f.scale}
          castShadow
        />
      ))}

      <instancedMesh
        ref={panelsRef}
        args={[BOX_GEO, panelMat, panels.count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />

      {/* 充电线：每台在充电的车一条（枪座 -> 车头充电口） */}
      {cables.map((c, i) => (
        <mesh key={`cable${i}`} geometry={cableGeos[i]} material={cableMat} castShadow />
      ))}

      {/* 门楣站名招牌：朝站外 / 站内各一面 */}
      {Object.values(sign).map((s, i) => (
        <StationSign key={`sign${i}`} position={s.position} rotationY={s.rotationY} width={s.width} height={s.height} />
      ))}

      <ArrivingCar />
    </group>
  )
}

export const CHARGING_INFO = CHARGING
