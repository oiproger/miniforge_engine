import { describe, expect, it, vi } from 'vitest'
import { PostProcessor } from './postprocess'

describe('same-context post process', () => {
  it('copies from the current default framebuffer on the GPU without allocating a second context', () => {
    const calls: string[] = []
    const gl = new Proxy({} as WebGL2RenderingContext, {
      get(_target, name) {
        if (name === 'getProgramParameter' || name === 'getShaderParameter') return () => true
        if (name === 'createProgram' || name === 'createTexture' || name === 'createVertexArray' || name === 'createShader') return () => ({})
        if (name === 'getUniformLocation') return () => ({})
        if (name === 'copyTexSubImage2D' || name === 'drawArrays' || name === 'texImage2D')
          return () => { calls.push(String(name)) }
        if (typeof name === 'string' && name === name.toUpperCase()) return 1
        return () => {}
      },
    })
    const canvas = { width: 640, height: 360, getContext: vi.fn(() => { throw Error('second context requested') }) } as unknown as HTMLCanvasElement
    const fx = new PostProcessor(canvas, gl)
    try {
      fx.setOptions({ bloom: 0.4 })
      fx.render(canvas)
      expect(canvas.getContext).not.toHaveBeenCalled()
      expect(calls).toContain('copyTexSubImage2D')
      expect(calls).toContain('drawArrays')
      fx.render(canvas)
      expect(calls.filter(x => x === 'texImage2D')).toHaveLength(1)
    } finally { fx.dispose() }
  })
})
