import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SPACING = 16
const SPEED = 16
const glowPixels = new Uint8Array(16 * 16 * 4)
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 16; x++) {
    const radius = Math.hypot(x - 7.5, y - 7.5) / 7.5
    const index = (y * 16 + x) * 4
    glowPixels[index] = 255
    glowPixels[index + 1] = 255
    glowPixels[index + 2] = 255
    glowPixels[index + 3] = Math.round(255 * Math.max(0, 1 - radius) ** 1.4)
  }
}
const glowMap = new THREE.DataTexture(glowPixels, 16, 16, THREE.RGBAFormat)
glowMap.needsUpdate = true
const point = new THREE.Vector3()

export default function PowerFlow({ lines }) {
  const material = useMemo(() => new THREE.PointsMaterial({
    color: '#86eaff',
    map: glowMap,
    size: 2.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }), [])
  const { geometry, particles } = useMemo(() => {
    const particles = lines.flatMap((line) =>
      Array.from({ length: Math.ceil(line.length / SPACING) }, (_, i) => ({
        line,
        distance: i * SPACING + line.phase * SPACING / 3
      }))
    )
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particles.length * 3), 3))
    return { geometry, particles }
  }, [lines])

  useFrame(({ clock }) => {
    const position = geometry.attributes.position
    const traveled = clock.elapsedTime * SPEED
    particles.forEach(({ line, distance }, i) => {
      const along = (distance + traveled) % line.length
      const segment = line.segments.find(({ start, length }) => along <= start + length) ?? line.segments.at(-1)
      segment.curve.getPointAt(Math.max(0, Math.min(1, (along - segment.start) / segment.length)), point)
      position.setXYZ(i, point.x, point.y + 0.18, point.z)
    })
    position.needsUpdate = true
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
