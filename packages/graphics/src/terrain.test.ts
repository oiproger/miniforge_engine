import { expect, test } from 'vitest'
import { brushTerrain, makeTerrain, validTerrain } from '../../project-schema/src/terrain'
import { terrainGeometry } from './terrain'

test('sculpting and painting share the exported grid and preserve adjacent cells', () => {
  const t = makeTerrain(8)
  brushTerrain(t, 'Raise', 4, 4, 2, 1, 0)
  const center = 4 * 9 + 4
  expect(t.heights[center]).toBe(1)
  brushTerrain(t, 'Smooth', 4, 4, 2, 0.5, 0)
  expect(t.heights[center]).toBeLessThan(1)
  brushTerrain(t, 'Flatten', 4, 4, 1, 1, -1)
  expect(t.heights[center]).toBe(-1)
  brushTerrain(t, 'Paint', 4.5, 4.5, 0.6, 1, 0)
  const geo = terrainGeometry(t)
  expect(geo.getAttribute('position').getY(center)).toBe(-1)
  expect(geo.groups[1].count).toBe(6)
  expect(geo.getAttribute('normal').getY(0)).toBeGreaterThan(0.99)
  brushTerrain(t, 'Erase paint', 4.5, 4.5, 0.6, 1, 0)
  expect(t.layers.every((v) => v === 0)).toBe(true)
  expect(validTerrain(t)).toBe(true)
  expect(validTerrain({ ...t, heights: [] })).toBe(false)
  geo.dispose()
})
