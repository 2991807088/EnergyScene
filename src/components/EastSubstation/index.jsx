import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildEastSubstation } from '@/three/eastSubstation'
import { getTurbineSpin } from '@/three/environments'
import PowerFlow from './PowerFlow'

const GEOMETRIES = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8)
}
const WIRE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#29343c', roughness: 0.65, metalness: 0.6 })
const FENCE_MATERIAL = new THREE.LineBasicMaterial({ color: '#8d9b9e' })

function EquipmentBatch({ batch }) {
  const ref = useRef()
  useLayoutEffect(() => {
    batch.matrices.forEach((matrix, i) => ref.current.setMatrixAt(i, matrix))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [batch])
  return <instancedMesh ref={ref} args={[GEOMETRIES[batch.kind], batch.material, batch.matrices.length]} castShadow receiveShadow />
}

export default function EastSubstation({ wind = 0, thermalGenerating = true, hydroGenerating = true }) {
  const { batches, wireGeometry, fenceGeometry, flowLines } = useMemo(() => {
    const { parts, ...geometry } = buildEastSubstation()
    const batches = []
    for (const part of parts) {
      let batch = batches.find((b) => b.kind === part.kind && b.material === part.material)
      if (!batch) {
        batch = { kind: part.kind, material: part.material, matrices: [] }
        batches.push(batch)
      }
      batch.matrices.push(part.matrix)
    }
    return { batches, ...geometry }
  }, [])
  const solarFlow = useMemo(() => flowLines.filter((line) => line.key === 'solar'), [flowLines])
  const windFlow = useMemo(() => flowLines.filter((line) => line.key === 'wind'), [flowLines])
  const thermalFlow = useMemo(() => flowLines.filter((line) => line.key === 'thermal'), [flowLines])
  const hydroFlow = useMemo(() => flowLines.filter((line) => line.key === 'hydro'), [flowLines])
  const windActive = getTurbineSpin(wind) > 0
  return (
    <group>
      {batches.map((batch, i) => <EquipmentBatch key={i} batch={batch} />)}
      <mesh geometry={wireGeometry} material={WIRE_MATERIAL} />
      <PowerFlow lines={solarFlow} />
      {windActive && <PowerFlow lines={windFlow} />}
      {thermalGenerating && !windActive && <PowerFlow lines={thermalFlow} />}
      {hydroGenerating && <PowerFlow lines={hydroFlow} />}
      <lineSegments geometry={fenceGeometry} material={FENCE_MATERIAL} />
    </group>
  )
}
