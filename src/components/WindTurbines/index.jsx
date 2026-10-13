import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pickTurbineSpots } from '@/three/terrain'
import { getTurbineSpin } from '@/three/environments'

// 三类零件各建一份，所有风机共用（含叶片，转的是各自的分组）
const TOWER_GEO = new THREE.CylinderGeometry(0.34, 0.62, 1, 12) // 单位高，靠 scale.y 拉成塔筒
const NACELLE_GEO = new THREE.BoxGeometry(1, 1, 1)
const BLADE_GEO = new THREE.CylinderGeometry(0.055, 0.3, 1, 4) // 上细下粗 → 叶片
BLADE_GEO.rotateY(Math.PI / 4) // 四棱转 45°，得到「宽而薄」的叶片截面

const TOWER_MAT = new THREE.MeshStandardMaterial({
  color: '#c8ccd2',
  roughness: 0.5,
  metalness: 0.34
})
const NACELLE_MAT = new THREE.MeshStandardMaterial({
  color: '#b3bac2',
  roughness: 0.48,
  metalness: 0.4
})
const BLADE_MAT = new THREE.MeshStandardMaterial({
  color: '#e6e9ee',
  roughness: 0.56,
  metalness: 0.1
})

const SPIN_SMOOTH = 2.2 // 转速变化的平滑系数：拖动滑块时转速是渐变，不是硬跳

/**
 * 山上风机：塔筒 + 机舱 + 三叶片转子。
 * 转速由「风力」滑块决定（getTurbineSpin：切入风速以下停转，之后按曲线加速）。
 */
export default function WindTurbines({ wind = 2, count = 48 }) {
  const spots = useMemo(() => pickTurbineSpots(count), [count])
  const rotors = useRef([])
  const spinRef = useRef(0) // 当前实际角速度，逐帧向目标值靠拢

  const targetSpin = getTurbineSpin(wind)

  // 单个 useFrame 统一驱动全部转子，避免每台风机一个回调
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
    // 拖动滑块时平滑过渡，避免转速瞬间跳变
    spinRef.current += (targetSpin - spinRef.current) * Math.min(step * SPIN_SMOOTH, 1)
    const spin = spinRef.current

    for (let i = 0; i < rotors.current.length; i++) {
      const rotor = rotors.current[i]
      if (rotor) rotor.rotation.z -= spin * spots[i].speedFactor * step
    }
  })

  return (
    <group>
      {spots.map((s, i) => (
        <group key={i} position={[s.x, s.baseY, s.z]}>
          {/* 塔筒 */}
          <mesh
            geometry={TOWER_GEO}
            material={TOWER_MAT}
            position={[0, s.towerH / 2, 0]}
            scale={[1, s.towerH, 1]}
          />
          {/* 机舱 */}
          <mesh
            geometry={NACELLE_GEO}
            material={NACELLE_MAT}
            position={[0, s.towerH + 0.1, 0.25]}
            scale={[1.1, 1.05, 2.3]}
          />
          {/* 转子：绕自身 z 轴旋转，三片叶子间隔 120° */}
          <group
            ref={(el) => {
              rotors.current[i] = el
            }}
            position={[0, s.towerH + 0.1, 1.5]}
          >
            {[0, 1, 2].map((b) => (
              <group key={b} rotation={[0, 0, (b * Math.PI * 2) / 3]}>
                <mesh
                  geometry={BLADE_GEO}
                  material={BLADE_MAT}
                  position={[0, s.bladeLen / 2, 0]}
                  scale={[1, s.bladeLen, 0.42]}
                />
              </group>
            ))}
          </group>
        </group>
      ))}
    </group>
  )
}
