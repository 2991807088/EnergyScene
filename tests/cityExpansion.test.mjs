import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

test('city extends to the southern terrain edge with connected roads and flat, clear plots', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { CITY_BOUNDS, GRID_Z_MAX } = await server.ssrLoadModule('/src/three/cityLayout.js')
    const { CITY_ROADS } = await server.ssrLoadModule('/src/three/cityTexture.js')
    const { terrainHeight } = await server.ssrLoadModule('/src/three/terrain.js')
    const { pickTreeSpots } = await server.ssrLoadModule('/src/three/trees.js')
    assert.deepEqual(CITY_BOUNDS, { minX: -250, maxX: 250, minZ: -250, maxZ: 490 })
    for (let x = -250; x <= 250; x += 10) {
      for (let z = 250; z <= 490; z += 10) assert.equal(terrainHeight(x, z), 0)
    }
    const outerRoad = CITY_ROADS.find((r) => r.axis === 'x' && r.coordinate === GRID_Z_MAX)
    assert.ok(outerRoad)
    assert.deepEqual(outerRoad.segments, [[-240, 240]])
    for (const road of CITY_ROADS.filter((r) => r.axis === 'z')) {
      assert.equal(road.segments.at(-1)[1], GRID_Z_MAX)
    }
    assert.ok(CITY_ROADS.filter((r) => r.axis === 'x' && r.coordinate > 240).length >= 4)
    assert.ok(pickTreeSpots().every(({ x, z }) =>
      z <= 250 || z > CITY_BOUNDS.maxZ || x < CITY_BOUNDS.minX || x > CITY_BOUNDS.maxX))
  } finally {
    await server.close()
  }
})
