import { useMemo } from 'react'
import * as THREE from 'three'
import { POND, pondOutline } from '../../three/pond'

function buildPondGeometry() {
  const outline = pondOutline()
  const positions = [POND.x, 0.05, POND.z]
  const uvs = [0.5, 0.5]
  const indices = []
  for (const [x, z] of outline) {
    positions.push(x, 0.05, z)
    uvs.push(0.5 + (x - POND.x) / (POND.radiusX * 2.3), 0.5 + (z - POND.z) / (POND.radiusZ * 2.3))
  }
  for (let i = 0; i < outline.length; i++) indices.push(0, (i + 1) % outline.length + 1, i + 1)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export default function Pond() {
  const geometry = useMemo(buildPondGeometry, [])
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#32607f" roughness={0.21} metalness={0.17} transparent opacity={0.94} envMapIntensity={1.1} />
    </mesh>
  )
}
