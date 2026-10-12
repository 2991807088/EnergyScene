import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  buildFactoryCampus,
  campusUnitBox,
  campusPanelMaterial,
  CAMPUS,
  CAMPUS_OFFSET
} from '@/three/factoryCampus'
import { SOLAR_TABLE } from '@/three/solarFarm'

// 面板几何与地面电站保持一致（尺寸全部烘进实例矩阵）
const PANEL_GEO = campusUnitBox()

/**
 * 厂房园区：连续四排厂房 + 屋顶铺满光伏 + 四周围栏 + 一个出入口。
 *
 * 布局参数与选址依据见 three/factoryCampus.js 顶部注释（红框反投影得到
 * x ∈ [-96,-16]、z ∈ [+16,+96]，四条边正好压在城市仅有的四条干道上）。
 *
 * 渲染分两块：
 *   · 静态方盒（厂房本体 / 女儿墙 / 场院 / 大门 / 门卫房）—— 共用一份单位立方体，靠 scale 变形
 *   · 围栏段 —— 每段自己的重复贴图，单独材质
 *   · 屋顶光伏 —— 一个 InstancedMesh，颜色走 instanceColor
 */
export default function FactoryCampus() {
  const { boxes, fence, panels } = useMemo(() => buildFactoryCampus(), [])
  const panelMat = useMemo(() => campusPanelMaterial(), [])
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
    <group position={[CAMPUS_OFFSET.x, 0, CAMPUS_OFFSET.z]}>
      {boxes.map((b, i) => (
        <mesh
          key={`b${i}`}
          geometry={PANEL_GEO}
          material={b.material}
          position={b.position}
          scale={b.scale}
          castShadow
          receiveShadow
        />
      ))}

      {fence.map((f, i) => (
        <mesh
          key={`f${i}`}
          geometry={PANEL_GEO}
          material={f.material}
          position={f.position}
          scale={f.scale}
          castShadow
        />
      ))}

      <instancedMesh
        ref={panelsRef}
        args={[PANEL_GEO, panelMat, panels.count]}
        castShadow
        receiveShadow
        frustumCulled={false}
        scale={[1, 1, 1]}
      />
    </group>
  )
}

// 便于其它模块引用时保持一致的参数（列数等）
export const CAMPUS_INFO = CAMPUS
export const CAMPUS_PANEL_TABLE = SOLAR_TABLE
