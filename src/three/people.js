import { ATHLETICS_TRACK, mulberry32 } from './cityLayout'
import { CITY_ROADS } from './cityTexture'

/** 支撑期脚掌向后匀速移动，摆动期抬脚回收；两段腿骨反解关节角，避免滑步和反折。 */
export function sampleGait(time, speed, running, phase, pose) {
  const cycle = running ? 0.66 - (speed - 2.5) * 0.045 : 0.98 - (speed - 0.85) * 0.25
  const t = time / cycle + phase / (Math.PI * 2)
  const stance = running ? 0.4 : 0.62
  const wave = Math.sin(t * Math.PI * 2)
  pose.hipHeight = running
    ? 0.65 + 0.065 * (0.5 - 0.5 * Math.cos(t * Math.PI * 4))
    : 0.705 + 0.014 * Math.cos(t * Math.PI * 4)
  pose.sway = wave * (running ? 0.012 : 0.022)
  pose.twist = wave * (running ? 0.09 : 0.045)
  pose.lean = (running ? -0.13 : -0.025) + Math.sin(t * Math.PI * 4) * 0.012
  for (let side = 0; side < 2; side++) {
    const p = ((t + side * 0.5) % 1 + 1) % 1
    const leg = pose.legs[side]
    const halfStep = speed * cycle * stance / 2
    let z, lift, pitch
    if (p < stance) {
      const contact = p / stance
      z = halfStep - speed * cycle * p
      lift = 0
      // 脚跟着地、全脚掌承重、脚尖蹬离，过渡连续。
      pitch = -0.16 * Math.max(0, 1 - contact / 0.22) ** 2 +
        0.3 * Math.max(0, (contact - 0.7) / 0.3) ** 2
    } else {
      const swing = (p - stance) / (1 - stance)
      const ease = swing * swing * (3 - 2 * swing)
      z = halfStep * (2 * ease - 1)
      lift = (running ? 0.29 : 0.13) * Math.sin(Math.PI * swing) ** 2
      pitch = 0.3 * (1 - ease) - 0.16 * ease
    }
    // 鞋底随脚掌角度抬高，鞋跟和鞋尖都不穿地。
    const ankle = 0.05 * Math.cos(pitch) + 0.15 * Math.abs(Math.sin(pitch)) + 0.055
    const y = ankle + lift - pose.hipHeight
    const distance = Math.min(0.699, Math.hypot(y, z))
    leg.hip = Math.atan2(-z, -y) - Math.acos(Math.max(-1, Math.min(1,
      (0.36 ** 2 + distance ** 2 - 0.34 ** 2) / (2 * 0.36 * distance))))
    leg.knee = Math.PI - Math.acos(Math.max(-1, Math.min(1,
      (0.36 ** 2 + 0.34 ** 2 - distance ** 2) / (2 * 0.36 * 0.34))))
    leg.ankle = pitch - leg.hip - leg.knee
    leg.arm = z / halfStep * (running ? 0.65 : 0.32)
    leg.elbow = (running ? -1.35 : -0.22) + Math.sin((p + 0.12) * Math.PI * 2) * (running ? 0.2 : 0.09)
  }
  return pose
}

/** 胶囊形路线，按路程匀速采样；朝向与切线一致，直道和弯道连续。 */
export function sampleRoute(route, distance, target) {
  const { radius: r, straight: s } = route
  const arc = Math.PI * r
  const length = 4 * s + 2 * arc
  let d = ((distance % length) + length) % length
  let x, z, angle
  if (d < 2 * s) {
    x = r; z = -s + d; angle = 0
  } else if ((d -= 2 * s) < arc) {
    const a = d / r
    x = r * Math.cos(a); z = s + r * Math.sin(a); angle = -a
  } else if ((d -= arc) < 2 * s) {
    x = -r; z = s - d; angle = Math.PI
  } else {
    const a = (d - 2 * s) / r + Math.PI
    x = r * Math.cos(a); z = -s + r * Math.sin(a); angle = -a
  }
  const rotation = route.rotation ?? 0
  target.position.set(
    route.x + x * Math.cos(rotation) + z * Math.sin(rotation),
    0.03,
    route.z - x * Math.sin(rotation) + z * Math.cos(rotation)
  )
  target.rotation.y = angle + rotation
}

export function generatePeople() {
  const rand = mulberry32(7016)
  const people = []
  const add = (route, running, offset) => people.push({
    route, running, offset,
    speed: running ? 2.5 + rand() * 1.2 : 0.85 + rand() * 0.45,
    phase: rand() * Math.PI * 2,
    shirt: ['#e25b46', '#f4c95d', '#4da9cc', '#e9e8dc', '#9274bd', '#55a88b'][people.length % 6],
    skin: ['#e3b28d', '#b67c57', '#81563f'][people.length % 3],
    trousers: running ? '#293b52' : ['#354d69', '#5b514b', '#333940'][people.length % 3]
  })
  for (let i = 0; i < 10; i++) {
    add({
      x: ATHLETICS_TRACK.x, z: ATHLETICS_TRACK.z,
      radius: ATHLETICS_TRACK.halfWidth - (1 + (i % 4) * 1.4),
      straight: ATHLETICS_TRACK.halfLength - ATHLETICS_TRACK.halfWidth
    }, true, i * 15)
  }

  // 用真实道路及其断口生成路线，逐街区留出路口距离，避免穿过车流和场站。
  for (const road of CITY_ROADS) {
    if (Math.abs(road.coordinate) > 100) continue
    const crossings = CITY_ROADS.filter((other) => other.axis !== road.axis &&
      other.segments.some(([lo, hi]) => road.coordinate >= lo && road.coordinate <= hi))
      .map((other) => other.coordinate).sort((a, b) => a - b)
    for (const [lo, hi] of road.segments) {
      const cuts = [lo, ...crossings.filter((v) => v > lo && v < hi), hi]
      for (let i = 0; i < cuts.length - 1; i++) {
        const start = cuts[i] + road.width / 2 + 1.5
        const end = cuts[i + 1] - road.width / 2 - 1.5
        if (end - start < 12 || Math.abs((start + end) / 2) > 110) continue
        const side = rand() > 0.5 ? 1 : -1
        const fixed = road.coordinate + side * (road.asphalt + road.width) / 4
        const center = (start + end) / 2
        const route = {
          x: road.axis === 'z' ? fixed : center,
          z: road.axis === 'z' ? center : fixed,
          radius: 0.12, straight: (end - start) / 2,
          rotation: road.axis === 'z' ? 0 : Math.PI / 2
        }
        add(route, false, rand() * (end - start) * 2)
      }
    }
  }
  return people
}
