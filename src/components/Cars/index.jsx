import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  verticalRoadX,
  horizontalRoadZ,
  ROAD_MIN,
  ROAD_MAX,
  ROAD_LINES,
  CORE_ROAD_LINES,
  ROAD_WIDTH,
  ASPHALT,
  mulberry32
} from '@/three/cityLayout'
import { signalAt } from '@/three/traffic'

/**
 * 两轴上的路口网格坐标（车到路口前据此判断是否该停）。
 * 只列真正铺了路的那几条网格线：路都删了，车就不该在空地中间空等红灯。
 * 沿 z 走的车（在竖路上）要看横向路的位置 → JUNCTIONS_Z；
 * 沿 x 走的车（在横路上）要看竖向路的位置 → JUNCTIONS_X。
 */
const JUNCTIONS_X = ROAD_LINES.map((n) => verticalRoadX(n))
const JUNCTIONS_Z = ROAD_LINES.map((n) => horizontalRoadZ(n))

/** 停止线距路口中心的距离 */
const STOP_DIST = ROAD_WIDTH / 2 + 2.4

/** 车道中心距道路中心线的横向偏移（右侧通行） */
const LANE_OFF = ASPHALT / 4

/** 跑车的道路（网格线序号）—— 正好是中心广场四角那四条 */
const LANE_LINES = CORE_ROAD_LINES

const CAR_COLORS = [
  '#e2483d',
  '#2f6fd0',
  '#e8e8ea',
  '#26282c',
  '#37a86b',
  '#e0a52f'
]

/** 静态车模型（车头朝 +x） */
function CarModel({ color }) {
  return (
    <group>
      {/* 车身 */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[1.8, 0.44, 0.86]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.5} />
      </mesh>
      {/* 座舱 */}
      <mesh position={[-0.08, 0.82, 0]} castShadow>
        <boxGeometry args={[0.95, 0.4, 0.78]} />
        <meshStandardMaterial color="#1b1e22" roughness={0.2} metalness={0.6} />
      </mesh>
      {/* 车轮 */}
      {[
        [0.55, 0.45],
        [0.55, -0.45],
        [-0.55, 0.45],
        [-0.55, -0.45]
      ].map(([wx, wz], i) => (
        <mesh
          key={i}
          position={[wx, 0.18, wz]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.18, 0.18, 0.14, 12]} />
          <meshStandardMaterial color="#141517" roughness={0.9} />
        </mesh>
      ))}
      {/* 前照灯 */}
      {[0.26, -0.26].map((z) => (
        <mesh key={`f${z}`} position={[0.91, 0.44, z]}>
          <boxGeometry args={[0.06, 0.14, 0.2]} />
          <meshStandardMaterial
            color="#fff6d5"
            emissive="#fff1c0"
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* 尾灯 */}
      {[-0.26, 0.26].map((z) => (
        <mesh key={`b${z}`} position={[-0.91, 0.44, z]}>
          <boxGeometry args={[0.06, 0.12, 0.18]} />
          <meshStandardMaterial
            color="#7a1414"
            emissive="#ff2b2b"
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * 生成车流。
 * axis = 行驶轴，fixed = 另一轴上的车道坐标（= 道路中心线 + 车道偏移），dir = 行驶方向。
 * 右侧通行：朝 +z 走的车靠 -x 一侧，朝 +x 走的车靠 +z 一侧。
 */
function generateCars() {
  const rand = mulberry32(8899)
  const lanes = []

  for (const n of LANE_LINES) {
    const vx = verticalRoadX(n)
    lanes.push({ axis: 'z', fixed: vx - LANE_OFF, dir: 1 })
    lanes.push({ axis: 'z', fixed: vx + LANE_OFF, dir: -1 })

    const hz = horizontalRoadZ(n)
    lanes.push({ axis: 'x', fixed: hz + LANE_OFF, dir: 1 })
    lanes.push({ axis: 'x', fixed: hz - LANE_OFF, dir: -1 })
  }

  const cars = []
  for (const lane of lanes) {
    const count = 2 + Math.floor(rand() * 2)
    for (let i = 0; i < count; i++) {
      const along = ROAD_MIN + rand() * (ROAD_MAX - ROAD_MIN)
      const rotationY =
        lane.axis === 'x'
          ? lane.dir > 0
            ? 0
            : Math.PI
          : lane.dir > 0
            ? -Math.PI / 2
            : Math.PI / 2

      cars.push({
        ...lane,
        along,
        position: lane.axis === 'x' ? [along, 0, lane.fixed] : [lane.fixed, 0, along],
        rotationY,
        speed: 5 + rand() * 5,
        color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]
      })
    }
  }
  return cars
}

/** 车流：所有车共用一个 useFrame 统一驱动，并遵守红绿灯 */
export default function Cars() {
  const refs = useRef([])
  const cars = useMemo(() => generateCars(), [])

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05)
    const sig = signalAt(state.clock.elapsedTime)

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i]
      const el = refs.current[i]
      if (!el) continue

      const axis = car.axis
      const dir = car.dir
      const pos = el.position[axis]
      const lightState = axis === 'x' ? sig.ew : sig.ns
      const junctions = axis === 'x' ? JUNCTIONS_X : JUNCTIONS_Z

      // 找前方最近的路口
      let junc = null
      for (let k = 0; k < junctions.length; k++) {
        const j = junctions[k]
        if (dir > 0 ? j > pos + 0.02 : j < pos - 0.02) {
          if (junc === null || Math.abs(j - pos) < Math.abs(junc - pos)) junc = j
        }
      }

      let next = pos + car.speed * dir * d

      // 非绿灯且尚未越过停止线 → 停在停止线前
      if (junc !== null && lightState !== 'green') {
        const stopLine = junc - dir * STOP_DIST
        const beforeLine = dir > 0 ? pos <= stopLine : pos >= stopLine
        if (beforeLine) {
          next = dir > 0 ? Math.min(next, stopLine) : Math.max(next, stopLine)
        }
      }

      // 出界循环
      if (next > ROAD_MAX) next = ROAD_MIN
      else if (next < ROAD_MIN) next = ROAD_MAX

      el.position[axis] = next
    }
  })

  return (
    <group>
      {cars.map((car, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          position={car.position}
          rotation={[0, car.rotationY, 0]}
        >
          <CarModel color={car.color} />
        </group>
      ))}
    </group>
  )
}
