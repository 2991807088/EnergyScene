import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Object3D } from 'three'
import { createServer } from 'vite'

test('people follow continuous routes within track lanes and existing sidewalks', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { generatePeople, sampleRoute } = await server.ssrLoadModule('/src/three/people.js')
    const { isInsideTrack } = await server.ssrLoadModule('/src/three/cityLayout.js')
    const { CITY_ROADS } = await server.ssrLoadModule('/src/three/cityTexture.js')
    const people = generatePeople()
    assert.deepEqual(people, generatePeople())
    assert.ok(people.some((person) => person.running))
    assert.ok(people.some((person) => !person.running))
    const current = new Object3D(), next = new Object3D()
    for (const person of people) {
      const route = person.route
      const length = route.straight * 4 + Math.PI * route.radius * 2
      for (let i = 0; i <= 1000; i++) {
        const distance = length * i / 1000
        sampleRoute(route, distance, current)
        sampleRoute(route, distance + 0.001, next)
        assert.ok(Math.abs(current.position.distanceTo(next.position) - 0.001) < 1e-6,
          'route must be continuous and constant speed, including wrap')
        const heading = Math.atan2(next.position.x - current.position.x, next.position.z - current.position.z)
        assert.ok(Math.cos(heading - current.rotation.y) > 0.9999, 'person must face travel direction')
        const { x, z } = current.position
        if (person.running) {
          assert.ok(isInsideTrack(x, z) && !isInsideTrack(x, z, -6), 'runner must stay in track lanes')
        } else {
          assert.ok(CITY_ROADS.some((road) => {
            const across = Math.abs((road.axis === 'z' ? x : z) - road.coordinate)
            const along = road.axis === 'z' ? z : x
            return across > road.asphalt / 2 && across < road.width / 2 &&
              road.segments.some(([lo, hi]) => along > lo && along < hi)
          }), 'walker must stay on an existing sidewalk')
        }
      }
    }
  } finally {
    await server.close()
  }
})

test('gait keeps supporting feet planted, clears the ground and blends through phase boundaries', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { sampleGait } = await server.ssrLoadModule('/src/three/people.js')
    const pose = { legs: [{}, {}] }, next = { legs: [{}, {}] }
    for (const running of [false, true]) {
      for (const speed of running ? [2.5, 3.1, 3.7] : [0.85, 1.1, 1.3]) {
        const cycle = running ? 0.66 - (speed - 2.5) * 0.045 : 0.98 - (speed - 0.85) * 0.25
        const stance = running ? 0.4 : 0.62
        for (let i = 0; i <= 2000; i++) {
          const time = cycle * i / 2000
          sampleGait(time, speed, running, 0, pose)
          sampleGait(time + 1e-6, speed, running, 0, next)
          for (let side = 0; side < 2; side++) {
            const leg = pose.legs[side], after = next.legs[side]
            const bend = leg.hip + leg.knee
            const pitch = bend + leg.ankle
            const ankleY = pose.hipHeight - 0.36 * Math.cos(leg.hip) - 0.34 * Math.cos(bend)
            const soleY = ankleY - 0.105 * Math.cos(pitch) - 0.15 * Math.abs(Math.sin(pitch))
            assert.ok(soleY >= -1e-8, 'shoe must not intersect the ground')
            assert.ok(leg.knee >= 0 && leg.knee < 2.4, 'knee must bend naturally backwards')
            for (const key of ['hip', 'knee', 'ankle', 'arm', 'elbow']) {
              assert.ok(Math.abs(leg[key] - after[key]) < 0.0001, `${key} must not snap between phases`)
            }
            const phase = (time / cycle + side * 0.5) % 1
            if (phase > 0.01 && phase < stance - 0.01) {
              const z = -0.36 * Math.sin(leg.hip) - 0.34 * Math.sin(bend)
              const nextZ = -0.36 * Math.sin(after.hip) - 0.34 * Math.sin(after.hip + after.knee)
              assert.ok(Math.abs((nextZ - z) / 1e-6 + speed) < 1e-5, 'supporting ankle must remain planted in world space')
            }
          }
        }
      }
    }
  } finally {
    await server.close()
  }
})
