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
  expect(geo.positions[3 * center + 1]).toBe(-1)
  expect(geo.layers[1].length).toBe(6)
  expect(geo.indices.slice(0, 3)).toEqual([0, 9, 1])
  brushTerrain(t, 'Erase paint', 4.5, 4.5, 0.6, 1, 0)
  expect(t.layers.every((v) => v === 0)).toBe(true)
  expect(validTerrain(t)).toBe(true)
  expect(validTerrain({ ...t, heights: [] })).toBe(false)
})
