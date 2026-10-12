import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { layoutAllFarms, SOLAR_MATERIALS, SOLAR_TABLE } from '@/three/solarFarm'

// 单位几何，所有阵列共用；尺寸与倾角全部烘进实例矩阵
const PANEL_GEO = new THREE.BoxGeometry(1, 1, 1)
const LEG_GEO = new THREE.CylinderGeometry(
  SOLAR_TABLE.legRadius,
  SOLAR_TABLE.legRadius,
  1,
  6
)

/**
 * 光伏电站。目前两片，合并成同一组 InstancedMesh：
 *
 * - 小阵列：位置来自用户截图里红箭头尖端的反投影（见 three/solarFarm.js 顶部注释）
 * - 城市 +z 边电站：位置来自用户第二张俯视截图里红框的单应反解，宽度 = 城市宽度
 *
 * - 面板一律朝太阳倾斜（小阵列朝向由 SUN_DIRECTION 推出，不写死方位）
 * - 面板颜色走 instanceColor，材质只有一份
 * - 面板 + 立柱 = 2 次 draw call 画完整片电站
 */
export default function SolarFarm() {
  const layout = useMemo(() => layoutAllFarms(), [])
  const { panelMatrices, legMatrices, tones, panelCount, legCount } = layout

  const panelsRef = useRef()
  const legsRef = useRef()

  // 用 useLayoutEffect 赶在第一帧渲染前写入，否则材质会多编译一次
  useLayoutEffect(() => {
    const mesh = panelsRef.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    for (let i = 0; i < panelCount; i++) {
      matrix.fromArray(panelMatrices, i * 16)
      mesh.setMatrixAt(i, matrix)
      color.setRGB(tones[i * 3], tones[i * 3 + 1], tones[i * 3 + 2])
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [panelCount, panelMatrices, tones])

  useLayoutEffect(() => {
    const mesh = legsRef.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < legCount; i++) {
      matrix.fromArray(legMatrices, i * 16)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [legCount, legMatrices])

  return (
    <group>
      <instancedMesh
        ref={panelsRef}
        args={[PANEL_GEO, SOLAR_MATERIALS.panel, panelCount]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={legsRef}
        args={[LEG_GEO, SOLAR_MATERIALS.leg, legCount]}
        castShadow
        frustumCulled={false}
      />
    </group>
  )
}
