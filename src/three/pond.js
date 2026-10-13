import { CENTRAL_PARK } from './cityLayout'

export const POND = {
  x: (CENTRAL_PARK.minX + CENTRAL_PARK.maxX) / 2,
  z: CENTRAL_PARK.minZ + 24,
  radiusX: 14,
  radiusZ: 15,
  bank: 1.3,
  segments: 64
}

const shoreScale = (angle) => 1 + 0.06 * Math.sin(3 * angle + 0.4) + 0.04 * Math.cos(5 * angle)

/** 水面与岸带共用的闭合池塘轮廓。 */
export function pondOutline(band = 0) {
  return Array.from({ length: POND.segments }, (_, i) => {
    const angle = i * Math.PI * 2 / POND.segments
    const scale = shoreScale(angle)
    return [
      POND.x + (POND.radiusX + band) * Math.cos(angle) * scale,
      POND.z + (POND.radiusZ + band) * Math.sin(angle) * scale
    ]
  })
}

/** 树木避开水面和岸带。 */
export function pondContains(x, z, margin = 0) {
  const dx = (x - POND.x) / (POND.radiusX + margin)
  const dz = (z - POND.z) / (POND.radiusZ + margin)
  return Math.hypot(dx, dz) <= shoreScale(Math.atan2(dz, dx))
}
