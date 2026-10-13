import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
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
import { CAR_SPECS, ALL_CAR_MODEL_URLS, bakeCarModel } from '@/three/carModels'

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

/** 车型按权重混排：轿车为主，货车/公交点缀（权重和不必为 1） */
const TYPE_WEIGHTS = [
  ['sedan', 3],
  ['sedanSports', 1.5],
  ['suv', 2.5],
  ['suvLuxury', 1.5],
  ['van', 1.5],
  ['taxi', 1.5],
  ['delivery', 1],
  ['deliveryFlat', 1],
  ['truck', 1],
  ['truckFlat', 1],
  ['bus', 0.8]
]
const TYPE_TOTAL = TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0)

/** 按权重随机选一个车型 key */
function pickCarType(rand) {
  let x = rand() * TYPE_TOTAL
  for (const [key, w] of TYPE_WEIGHTS) {
    if ((x -= w) < 0) return key
  }
  return TYPE_WEIGHTS[0][0]
}

/** 一次性加载全部车型并烘成模板（每种车型只烘一次，实例间共享几何/材质） */
function useCarTemplates() {
  const gltfs = useGLTF(ALL_CAR_MODEL_URLS)
  return useMemo(() => {
    const templates = {}
    Object.keys(CAR_SPECS).forEach((key, i) => {
      templates[key] = bakeCarModel(gltfs[i].scene, CAR_SPECS[key])
    })
    return templates
  }, [gltfs])
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

    if (n !== CORE_ROAD_LINES[1]) { // 公园内中断的横路不通车
      const hz = horizontalRoadZ(n)
      lanes.push({ axis: 'x', fixed: hz + LANE_OFF, dir: 1 })
      lanes.push({ axis: 'x', fixed: hz - LANE_OFF, dir: -1 })
    }
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

      const type = pickCarType(rand)
      cars.push({
        ...lane,
        along,
        position: lane.axis === 'x' ? [along, 0, lane.fixed] : [lane.fixed, 0, along],
        rotationY,
        type,
        speed: (5 + rand() * 5) * CAR_SPECS[type].speed
      })
    }
  }
  return cars
}

/**
 * 车流：所有车共用一个 useFrame 统一驱动，并遵守红绿灯。
 * 模型来自 public/models/cars/（Kenney Car Kit + Poly Pizza 公交，见 three/carModels.js），
 * 加载期间本组件整体挂起，不阻塞场景其余部分。
 */
function CarsInner() {
  const refs = useRef([])
  const templates = useCarTemplates()
  const cars = useMemo(() => {
    // 模板就绪后再实例化：clone 共享几何与材质，每辆车只有独立变换
    return generateCars().map((car) => ({ ...car, obj: templates[car.type].clone() }))
  }, [templates])

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
          <primitive object={car.obj} />
        </group>
      ))}
    </group>
  )
}

export default function Cars() {
  return (
    <Suspense fallback={null}>
      <CarsInner />
    </Suspense>
  )
}

// 提前发起全部车型模型的加载
useGLTF.preload(ALL_CAR_MODEL_URLS)
