// Compiled in the lexical scope of the pinned LittleJS release.
export function mount(host) {
  glAntialias = true
  headlessMode = !host
  glInit(host)
  if (host && !glContext) throw Error('WebGL2 is required by LittleJS Render3D')
  const r = new Render3DPlugin()
  const canvas = glCanvas
  let white
  const prune = () => {
    engineObjects = engineObjects.filter((o) => !o.destroyed)
  }
  return {
    r,
    canvas,
    gl: glContext,
    objectWorldMatrix(obj) { return render3DObjectMatrix(obj).m; },
    InstancedMesh3D,
    vec2,
    vec3,
    Color,
    EngineObject3D,
    Mesh,
    Light3D,
    Shader,
    TextureInfo,
    TileInfo,
    Ray3D,
    buildBox,
    buildSphere,
    buildGrid,
    buildLathe,
    buildCapsule,
    loadGLTF,
    setTexture(obj, info) {
      render3DWholeTiles.add((obj.tileInfo = new TileInfo(vec2(), info.size, info, 0, 0)))
    },
    whiteTexture() {
      if (!white) {
        const c = document.createElement('canvas')
        c.width = c.height = 1
        const ctx = c.getContext('2d')
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, 1, 1)
        white = new TextureInfo(c)
      }
      return white
    },
    setWhiteSprite(obj) {
      this.setTexture(obj, this.whiteTexture())
    },
    checkShader(vertex, fragment) {
      const shader = new Shader(fragment, vertex)
      render3DShaderProgram(shader)
      const program = shader.program3D
      if (!glContext.getProgramParameter(program, glContext.LINK_STATUS))
        throw Error(
          [
            glContext.getProgramInfoLog(program),
            ...glContext.getAttachedShaders(program).map((s) => glContext.getShaderInfoLog(s)),
          ]
            .filter(Boolean)
            .join('\n'),
        )
    },
    triangles(hidden = () => false) {
      let total = 0
      for (const o of engineObjects)
        if (!o.destroyed && o.mesh && !hidden(o))
          total += ((o.mesh.bufferCount || 0) / 3) * (o instanceof InstancedMesh3D ? o.count : 1)
      return Math.round(total)
    },
    background(hex) {
      canvasClearColor = new Color().setHex(hex)
    },
    tick(dt) {
      timeDelta = dt
      time += dt
    },
    render(w, h, ratio, hidden) {
      mainCanvasSize.set(w, h)
      canvasPixelRatio = ratio
      glPreRender()
      drawCount = 0
      prune()
      const all = engineObjects
      engineObjects = all.filter((o) => !hidden(o))
      try {
        r.updateMatrices()
        r.shadowMapDrawn = false
        render3DRenderPass(false)
        render3DRenderPass(true)
      } finally {
        engineObjects = all
      }
      return drawCount
    },
    pick(ray, hidden) {
      return r.pick(
        ray,
        engineObjects.filter((o) => !hidden(o)),
      )
    },
    dispose() {
      engineObjectsDestroy()
      if (!glContext) return
      render3DFreeGL(r)
      glContext.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    },
  }
}
