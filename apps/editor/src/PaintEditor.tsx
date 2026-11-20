import { useEffect, useRef, useState } from 'react'
import {
  Paintbrush,
  Eraser,
  PaintBucket,
  Pipette,
  Minus,
  Square,
  Circle,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Grid,
  Undo2,
  FlipHorizontal,
  FlipVertical,
  Save,
} from 'lucide-react'
import type { Asset } from '../../../packages/project-schema/src'

type Tool = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'circle'

interface PaintLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
  canvas: HTMLCanvasElement
}

const SWATCHES = [
  '#ffffff', '#d0d7de', '#768390', '#22272e', '#000000',
  '#e5534b', '#f0883e', '#f5b82e', '#57d163', '#38bdf8',
  '#8957e5', '#8c6642', '#6b7b59', '#5a636a', '#b56748',
]

function makeCanvas(size: number) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return c
}

export function PaintEditor({
  a,
  changeA,
}: {
  a: Asset
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const [size, setSize] = useState(128)
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#f0883e')
  const [brushSize, setBrushSize] = useState(4)
  const [opacity, setOpacity] = useState(1)
  const [seamless, setSeamless] = useState(true)
  const [tilePreview, setTilePreview] = useState(false)
  const [mirrorX, setMirrorX] = useState(false)
  const [mirrorY, setMirrorY] = useState(false)
  const [layers, setLayers] = useState<PaintLayer[]>(() => [
    { id: 'l-1', name: 'Layer 1', visible: true, opacity: 1, canvas: makeCanvas(128) },
  ])
  const [activeLayerId, setActiveLayerId] = useState('l-1')
  const [savedMsg, setSavedMsg] = useState('')

  const viewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null)
  const startPtRef = useRef<{ x: number; y: number } | null>(null)
  const undoStackRef = useRef<ImageData[]>([])

  // Load existing asset image into Layer 1 on open
  useEffect(() => {
    if (!a.data || !a.data.startsWith('data:image')) return
    const img = new Image()
    img.onload = () => {
      const targetSize = [32, 64, 128, 256, 512].includes(img.width) ? img.width : 128
      setSize(targetSize)
      const c = makeCanvas(targetSize)
      c.getContext('2d')?.drawImage(img, 0, 0, targetSize, targetSize)
      setLayers([{ id: 'l-1', name: 'Background', visible: true, opacity: 1, canvas: c }])
      setActiveLayerId('l-1')
    }
    img.src = a.data
  }, [])

  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0]

  const renderComposite = () => {
    const out = viewCanvasRef.current
    if (!out) return
    const ctx = out.getContext('2d')
    if (!ctx) return
    const tiles = tilePreview ? 3 : 1
    out.width = size * tiles
    out.height = size * tiles
    ctx.clearRect(0, 0, out.width, out.height)
    ctx.imageSmoothingEnabled = false
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        for (const l of layers) {
          if (!l.visible) continue
          ctx.save()
          ctx.globalAlpha = l.opacity
          ctx.drawImage(l.canvas, tx * size, ty * size)
          ctx.restore()
        }
      }
    }
  }

  useEffect(() => {
    renderComposite()
  }, [layers, size, tilePreview])

  const commitToAsset = () => {
    const flat = makeCanvas(size)
    const ctx = flat.getContext('2d')
    if (!ctx) return
    for (const l of layers) {
      if (!l.visible) continue
      ctx.save()
      ctx.globalAlpha = l.opacity
      ctx.drawImage(l.canvas, 0, 0)
      ctx.restore()
    }
    const url = flat.toDataURL('image/png')
    changeA((asset) => {
      asset.data = url
    })
    setSavedMsg('Saved PNG')
    setTimeout(() => setSavedMsg(''), 1400)
  }

  const pushUndo = () => {
    if (!activeLayer) return
    const ctx = activeLayer.canvas.getContext('2d')
    if (!ctx) return
    undoStackRef.current.push(ctx.getImageData(0, 0, size, size))
    if (undoStackRef.current.length > 25) undoStackRef.current.shift()
  }

  const undo = () => {
    const snap = undoStackRef.current.pop()
    if (!snap || !activeLayer) return
    activeLayer.canvas.getContext('2d')?.putImageData(snap, 0, 0)
    renderComposite()
  }

  const getPixelCoord = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const tiles = tilePreview ? 3 : 1
    const fx = ((e.clientX - rect.left) / rect.width) * size * tiles
    const fy = ((e.clientY - rect.top) / rect.height) * size * tiles
    return {
      x: ((Math.floor(fx) % size) + size) % size,
      y: ((Math.floor(fy) % size) + size) % size,
    }
  }

  const stampStroke = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
    const offsets = seamless
      ? [
          [0, 0], [-size, 0], [size, 0], [0, -size], [0, size],
          [-size, -size], [size, -size], [-size, size], [size, size],
        ]
      : [[0, 0]]
    const pts: [number, number, number, number][] = [[x0, y0, x1, y1]]
    if (mirrorX) pts.push([size - 1 - x0, y0, size - 1 - x1, y1])
    if (mirrorY) pts.push([x0, size - 1 - y0, x1, size - 1 - y1])
    if (mirrorX && mirrorY) pts.push([size - 1 - x0, size - 1 - y0, size - 1 - x1, size - 1 - y1])

    ctx.save()
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.globalAlpha = opacity
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineCap = 'round'
    ctx.lineWidth = brushSize
    for (const [ax, ay, bx, by] of pts) {
      for (const [ox, oy] of offsets) {
        ctx.beginPath()
        ctx.moveTo(ax + ox + 0.5, ay + oy + 0.5)
        ctx.lineTo(bx + ox + 0.5, by + oy + 0.5)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  const floodFill = (ctx: CanvasRenderingContext2D, sx: number, sy: number) => {
    const img = ctx.getImageData(0, 0, size, size)
    const d = img.data
    const idx = (sy * size + sx) * 4
    const tr = d[idx], tg = d[idx + 1], tb = d[idx + 2], ta = d[idx + 3]
    const clean = color.replace('#', '')
    const nr = parseInt(clean.slice(0, 2), 16)
    const ng = parseInt(clean.slice(2, 4), 16)
    const nb = parseInt(clean.slice(4, 6), 16)
    const na = Math.round(opacity * 255)
    if (tr === nr && tg === ng && tb === nb && ta === na) return
    const stack = [[sx, sy]]
    const seen = new Uint8Array(size * size)
    while (stack.length) {
      const [cx, cy] = stack.pop()!
      const p = cy * size + cx
      if (seen[p]) continue
      const o = p * 4
      if (Math.abs(d[o] - tr) > 12 || Math.abs(d[o + 1] - tg) > 12 || Math.abs(d[o + 2] - tb) > 12 || Math.abs(d[o + 3] - ta) > 12) continue
      seen[p] = 1
      d[o] = nr; d[o + 1] = ng; d[o + 2] = nb; d[o + 3] = na
      const nx1 = seamless ? (cx + 1) % size : cx + 1
      const nx0 = seamless ? (cx - 1 + size) % size : cx - 1
      const ny1 = seamless ? (cy + 1) % size : cy + 1
      const ny0 = seamless ? (cy - 1 + size) % size : cy - 1
      if (nx1 < size) stack.push([nx1, cy])
      if (nx0 >= 0) stack.push([nx0, cy])
      if (ny1 < size) stack.push([cx, ny1])
      if (ny0 >= 0) stack.push([cx, ny0])
    }
    ctx.putImageData(img, 0, 0)
  }

  const resizeAllLayers = (nextSize: number) => {
    setSize(nextSize)
    setLayers((prev) =>
      prev.map((l) => {
        const c = makeCanvas(nextSize)
        const ctx = c.getContext('2d')
        if (ctx) {
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(l.canvas, 0, 0, nextSize, nextSize)
        }
        return { ...l, canvas: c }
      }),
    )
  }

  return (
    <div className="mf-html-studio">
      <div className="mf-html-top">
        <div className="mf-html-tabs">
          {(
            [
              ['brush', Paintbrush, 'Brush'],
              ['eraser', Eraser, 'Eraser'],
              ['fill', PaintBucket, 'Fill'],
              ['eyedropper', Pipette, 'Pick'],
              ['line', Minus, 'Line'],
              ['rect', Square, 'Rect'],
              ['circle', Circle, 'Circle'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button key={id} type="button" className={tool === id ? 'active' : ''} onClick={() => setTool(id)} title={label}>
              <Icon size={13} />
            </button>
          ))}
          <select value={size} onChange={(e) => resizeAllLayers(Number(e.target.value))} style={{ fontSize: 11.5, marginLeft: 6 }}>
            {[32, 64, 128, 256, 512].map((s) => (
              <option key={s} value={s}>
                {s}×{s}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <button type="button" className={'mf-btn' + (seamless ? ' active' : '')} onClick={() => setSeamless((v) => !v)} title="Wrap strokes across edges">
            Wrap {seamless ? 'ON' : 'OFF'}
          </button>
          <button type="button" className={'mf-btn' + (tilePreview ? ' active' : '')} onClick={() => setTilePreview((v) => !v)} title="3×3 Seamless Tile Preview">
            <Grid size={12} /> 3×3
          </button>
          <button type="button" className={'mf-btn' + (mirrorX ? ' active' : '')} onClick={() => setMirrorX((v) => !v)} title="Mirror X">
            <FlipHorizontal size={12} />
          </button>
          <button type="button" className={'mf-btn' + (mirrorY ? ' active' : '')} onClick={() => setMirrorY((v) => !v)} title="Mirror Y">
            <FlipVertical size={12} />
          </button>
          <button type="button" className="mf-btn" onClick={undo} title="Undo">
            <Undo2 size={12} />
          </button>
          {savedMsg && <span style={{ fontSize: 11, color: '#7ee787' }}>{savedMsg}</span>}
          <button type="button" className="mf-primary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={commitToAsset}>
            <Save size={12} /> Apply PNG
          </button>
        </div>
      </div>

      <div className="mf-html-split" style={{ gridTemplateColumns: 'minmax(320px, 1.35fr) 240px', minHeight: 490 }}>
        {/* Center Canvas */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'repeating-conic-gradient(#1f242c 0% 25%, #161a20 0% 50%) 50% / 16px 16px',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <canvas
            ref={viewCanvasRef}
            style={{
              width: 440,
              height: 440,
              imageRendering: 'pixelated',
              border: '1px solid #444f5e',
              cursor: 'crosshair',
              touchAction: 'none',
            }}
            onPointerDown={(e) => {
              if (!activeLayer) return
              const ctx = activeLayer.canvas.getContext('2d')
              if (!ctx) return
              const pt = getPixelCoord(e)
              if (tool === 'eyedropper') {
                const px = ctx.getImageData(pt.x, pt.y, 1, 1).data
                const hex = '#' + [px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, '0')).join('')
                setColor(hex)
                setTool('brush')
                return
              }
              pushUndo()
              if (tool === 'fill') {
                floodFill(ctx, pt.x, pt.y)
                renderComposite()
                return
              }
              e.currentTarget.setPointerCapture(e.pointerId)
              drawingRef.current = true
              lastPtRef.current = pt
              startPtRef.current = pt
              if (tool === 'brush' || tool === 'eraser') {
                stampStroke(ctx, pt.x, pt.y, pt.x, pt.y)
                renderComposite()
              }
            }}
            onPointerMove={(e) => {
              if (!drawingRef.current || !activeLayer || !lastPtRef.current) return
              if (tool !== 'brush' && tool !== 'eraser') return
              const ctx = activeLayer.canvas.getContext('2d')
              if (!ctx) return
              const pt = getPixelCoord(e)
              stampStroke(ctx, lastPtRef.current.x, lastPtRef.current.y, pt.x, pt.y)
              lastPtRef.current = pt
              renderComposite()
            }}
            onPointerUp={(e) => {
              if (!drawingRef.current || !activeLayer || !startPtRef.current) return
              const ctx = activeLayer.canvas.getContext('2d')
              const pt = getPixelCoord(e)
              if (ctx && (tool === 'line' || tool === 'rect' || tool === 'circle')) {
                ctx.save()
                ctx.globalAlpha = opacity
                ctx.strokeStyle = color
                ctx.lineWidth = brushSize
                const s = startPtRef.current
                if (tool === 'line') {
                  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(pt.x, pt.y); ctx.stroke()
                } else if (tool === 'rect') {
                  ctx.strokeRect(s.x, s.y, pt.x - s.x, pt.y - s.y)
                } else if (tool === 'circle') {
                  const r = Math.hypot(pt.x - s.x, pt.y - s.y)
                  ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke()
                }
                ctx.restore()
                renderComposite()
              }
              drawingRef.current = false
              lastPtRef.current = null
              startPtRef.current = null
              commitToAsset()
            }}
          />
        </div>

        {/* Right: Color, Brush & Layers */}
        <div style={{ padding: 10, borderLeft: '1px solid #2b323b', background: '#161b23', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 38, height: 28, border: 'none', background: 'none' }} />
            <input value={color} onChange={(e) => setColor(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {SWATCHES.map((sw) => (
              <button
                key={sw}
                type="button"
                onClick={() => setColor(sw)}
                style={{ height: 20, borderRadius: 4, background: sw, border: color === sw ? '2px solid #fff' : '1px solid #303845', cursor: 'pointer' }}
              />
            ))}
          </div>
          <label style={{ fontSize: 11.5, color: '#9aa7b8' }}>
            Brush Size: <b>{brushSize}px</b>
            <input type="range" min={1} max={32} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          <label style={{ fontSize: 11.5, color: '#9aa7b8' }}>
            Opacity: <b>{Math.round(opacity * 100)}%</b>
            <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ width: '100%' }} />
          </label>

          {/* Layers Panel */}
          <div style={{ borderTop: '1px solid #2b323b', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700 }}>
              <span>Layers ({layers.length})</span>
              <button
                type="button"
                className="mf-bp-icon-btn"
                onClick={() => {
                  const id = 'l-' + Date.now().toString(36)
                  setLayers((prev) => [...prev, { id, name: `Layer ${prev.length + 1}`, visible: true, opacity: 1, canvas: makeCanvas(size) }])
                  setActiveLayerId(id)
                }}
                title="Add Layer"
              >
                <Plus size={13} />
              </button>
            </div>
            {[...layers].reverse().map((l) => (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 6px',
                  borderRadius: 4,
                  background: l.id === activeLayerId ? 'rgba(88,166,255,0.18)' : '#1c232d',
                  fontSize: 11.5,
                }}
              >
                <button
                  type="button"
                  className="mf-bp-icon-btn"
                  onClick={() => setLayers((prev) => prev.map((x) => (x.id === l.id ? { ...x, visible: !x.visible } : x)))}
                >
                  {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button
                  type="button"
                  style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#e6edf3', cursor: 'pointer' }}
                  onClick={() => setActiveLayerId(l.id)}
                >
                  {l.name}
                </button>
                {layers.length > 1 && (
                  <button
                    type="button"
                    className="mf-bp-icon-btn"
                    onClick={() => setLayers((prev) => prev.filter((x) => x.id !== l.id))}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
