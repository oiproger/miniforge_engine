import { describe, expect, it } from 'vitest'
import { opaqueMaterialBatchKey, spatialBatchCell } from './batch-planning'
describe('spatial mesh batching', () => {
  it('keeps close spatial cells together and splits distant cells', () => {
    expect(spatialBatchCell([1,0,15])).toBe(spatialBatchCell([15,10,1]))
    expect(spatialBatchCell([-1,0,0])).not.toBe(spatialBatchCell([0,0,0]))
    expect(spatialBatchCell([16,0,0])).not.toBe(spatialBatchCell([0,0,0]))
  })
  it('merges compatible flat-color and diffuse-textured materials in a draw', () => {
    expect(opaqueMaterialBatchKey({roughness:.7,color:'#ff0000'}))
      .toBe(opaqueMaterialBatchKey({roughness:.7,color:'#0000ff',map:'albedo.png'}))
    expect(opaqueMaterialBatchKey({roughness:.7})).not.toBe(opaqueMaterialBatchKey({roughness:.2}))
  })
  it('does not merge transparent, normal-mapped, or shader materials', () => {
    expect(opaqueMaterialBatchKey({opacity:.5})).toBeNull()
    expect(opaqueMaterialBatchKey({normalMap:'normal'})).toBeNull()
    expect(opaqueMaterialBatchKey({shader:'shader'})).toBeNull()
  })
})
