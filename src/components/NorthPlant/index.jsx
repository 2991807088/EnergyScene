import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  buildNorthPlant,
  buildNorthRoad,
  northPlantUnitBox,
  northPlantTankGeometry,
  northPlantPanelMaterial,
  stackMouths
} from '@/three/northPlant'
import SmokePlume from '@/components/SmokePlume'

// 方盒几何与地面电站 / 城内厂房园区保持一致（尺寸全部烘进实例矩阵）
const BOX_GEO = northPlantUnitBox()
const TANK_GEO = northPlantTankGeometry()

function WallSign({ name, position, width, height }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 160
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#233b51'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#d5e3e9'
    ctx.lineWidth = 8
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 104px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 72)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    return map
  }, [name])

  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

/**
 * 城北电站：两座厂房、墙面标注、围栏、储罐、烟囱及连接道路。
 * 选址与地形平整见 three/northSite.js。
 */
export default function NorthPlant({ wind = 0 }) {
  const { boxes, tanks, fence, panels, signs } = useMemo(() => buildNorthPlant(), [])
  const road = useMemo(() => buildNorthRoad(), [])
  const panelMat = useMemo(() => northPlantPanelMaterial(), [])
  const panelsRef = useRef()
  const mouths = useMemo(() => stackMouths(), [])

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
    <group>
      {boxes.map((b, i) => (
        <mesh
          key={`b${i}`}
          geometry={BOX_GEO}
          material={b.material}
          position={b.position}
          scale={b.scale}
          castShadow
          receiveShadow
        />
      ))}

      {signs.map((sign) => <WallSign key={sign.name} {...sign} />)}

      {tanks.map((t, i) => (
        <mesh
          key={`t${i}`}
          geometry={TANK_GEO}
          material={t.material}
          position={t.position}
          scale={t.scale}
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

      <mesh geometry={road.geometry} material={road.material} receiveShadow />

      {/* 火电站烟囱的烟，风力等级越大越被吹平 */}
      <SmokePlume mouths={mouths} wind={wind} />
    </group>
  )
}
