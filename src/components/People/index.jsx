import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { generatePeople, sampleRoute, sampleGait } from '@/three/people'

function createPerson(person) {
  const root = new THREE.Group()
  const boxes = []
  const part = (parent, position, scale, color) => {
    const object = new THREE.Object3D()
    object.position.set(...position)
    object.scale.set(...scale)
    parent.add(object)
    boxes.push({ object, color: new THREE.Color(color) })
    return object
  }
  const pivot = (parent, position) => {
    const joint = new THREE.Group()
    joint.position.set(...position)
    parent.add(joint)
    return joint
  }
  const hips = pivot(root, [0, 0, 0])
  const torso = pivot(hips, [0, 0.86, 0])
  part(torso, [0, 0.28, 0], [0.4, 0.55, 0.24], person.shirt)
  part(hips, [0, 0.82, 0], [0.34, 0.18, 0.23], person.trousers)
  const neck = pivot(torso, [0, 0.65, 0])
  const head = new THREE.Object3D()
  head.position.set(0, 0.14, 0)
  head.scale.set(0.18, 0.22, 0.18)
  neck.add(head)
  part(neck, [0, 0.3, -0.015], [0.3, 0.1, 0.29], '#302b29')
  const arms = [], elbows = [], legs = [], knees = [], ankles = []
  for (const side of [-1, 1]) {
    const arm = pivot(torso, [side * 0.27, 0.51, 0])
    part(arm, [0, -0.14, 0], [0.14, 0.3, 0.15], person.shirt)
    const elbow = pivot(arm, [0, -0.28, 0])
    elbow.rotation.x = person.running ? -1.25 : -0.2
    part(elbow, [0, -0.15, 0], [0.11, 0.3, 0.12], person.skin)
    arms.push(arm)
    elbows.push(elbow)
    const leg = pivot(hips, [side * 0.105, 0.79, 0])
    part(leg, [0, -0.18, 0], [0.15, 0.36, 0.17], person.trousers)
    const knee = pivot(leg, [0, -0.36, 0])
    part(knee, [0, -0.17, 0], [0.12, 0.34, 0.13], person.running ? person.skin : person.trousers)
    const ankle = pivot(knee, [0, -0.34, 0])
    part(ankle, [0, -0.055, 0], [0.16, 0.1, 0.3], person.running ? '#eee9df' : '#292d34')
    legs.push(leg)
    knees.push(knee)
    ankles.push(ankle)
  }
  return {
    ...person, root, hips, torso, neck, boxes, head, arms, elbows, legs, knees, ankles,
    pose: { legs: [{}, {}] }, heading: null
  }
}

/** 四肢共用一个方块批次，头部共用一个球体批次，人数增加不会增加绘制批次。 */
export default function People() {
  const bodies = useRef()
  const heads = useRef()
  const people = useMemo(() => generatePeople().map(createPerson), [])
  const boxCount = people.reduce((count, person) => count + person.boxes.length, 0)

  const update = (time, dt = 0) => {
    let index = 0
    people.forEach((person, i) => {
      const { root, hips, torso, neck, arms, elbows, legs, knees, ankles, running } = person
      sampleRoute(person.route, person.offset + time * person.speed, root)
      const targetHeading = root.rotation.y
      if (person.heading === null) person.heading = targetHeading
      const difference = Math.atan2(Math.sin(targetHeading - person.heading), Math.cos(targetHeading - person.heading))
      person.heading += difference * (1 - Math.exp(-12 * dt))
      root.rotation.y = person.heading
      const pose = sampleGait(time, person.speed, running, person.phase, person.pose)
      hips.position.set(pose.sway, pose.hipHeight - 0.79, 0)
      torso.rotation.set(pose.lean, pose.twist, -pose.sway * 0.8)
      neck.rotation.set(-pose.lean * 0.65, -pose.twist * 0.6, pose.sway * 0.4)
      for (let side = 0; side < 2; side++) {
        const gait = pose.legs[side]
        arms[side].rotation.set(gait.arm, 0, side === 0 ? -0.07 : 0.07)
        elbows[side].rotation.x = gait.elbow
        legs[side].rotation.x = gait.hip
        knees[side].rotation.x = gait.knee
        ankles[side].rotation.x = gait.ankle
      }
      root.updateMatrixWorld(true)
      for (const { object } of person.boxes) bodies.current.setMatrixAt(index++, object.matrixWorld)
      heads.current.setMatrixAt(i, person.head.matrixWorld)
    })
    bodies.current.instanceMatrix.needsUpdate = true
    heads.current.instanceMatrix.needsUpdate = true
  }

  useLayoutEffect(() => {
    let index = 0
    people.forEach((person, i) => {
      for (const { color } of person.boxes) bodies.current.setColorAt(index++, color)
      heads.current.setColorAt(i, new THREE.Color(person.skin))
    })
    bodies.current.instanceColor.needsUpdate = true
    heads.current.instanceColor.needsUpdate = true
    bodies.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    heads.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    update(0)
  }, [people])

  useFrame(({ clock }, dt) => update(clock.elapsedTime, dt))

  return (
    <group>
      <instancedMesh ref={bodies} args={[null, null, boxCount]} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.88} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[null, null, people.length]} frustumCulled={false} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </group>
  )
}
