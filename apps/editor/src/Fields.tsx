import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Trash2, type LucideIcon } from 'lucide-react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mf-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
export function Numeric({
  value,
  change,
  label,
  min,
  max,
  step = 0.1,
}: {
  value: number
  change: (n: number) => void
  label: string
  min?: number
  max?: number
  step?: number
}) {
  const clean = (n: number) => String(Math.round(n * 10000) / 10000)
  const [draft, setDraft] = useState(clean(value))
  useEffect(() => setDraft(clean(value)), [value])
  function commit() {
    const n = draft.trim() ? Number(draft) : NaN
    const next = Number.isFinite(n) ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)) : value
    setDraft(clean(next))
    if (next !== value) change(next)
  }
  return (
    <input
      type="number"
      aria-label={label}
      value={draft}
      step={step}
      min={min}
      max={max}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
export function Color({
  value,
  change,
  label,
}: {
  value: string
  change: (s: string) => void
  label: string
}) {
  return (
    <div className="mf-color">
      <input
        aria-label={label}
        type="color"
        value={value || '#ffffff'}
        onChange={(e) => change(e.target.value)}
      />
      <span>{(value || '#ffffff').toUpperCase()}</span>
    </div>
  )
}
export function Section({
  name,
  icon: Icon,
  children,
  remove,
  enabled,
  toggle,
  initial = true,
}: {
  name: string
  icon: LucideIcon
  children: ReactNode
  remove?: () => void
  enabled?: boolean
  toggle?: () => void
  initial?: boolean
}) {
  const [open, setOpen] = useState(initial)
  return (
    <section className="mf-section">
      <header>
        <button className="mf-section-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Icon size={14} />
          <b>{name}</b>
        </button>
        {toggle && (
          <input
            type="checkbox"
            title={'Enable ' + name}
            aria-label={'Enable ' + name}
            checked={enabled !== false}
            onChange={toggle}
          />
        )}
        {remove && (
          <button className="mf-icon mf-remove" title={'Remove ' + name} onClick={remove}>
            <Trash2 size={12} />
          </button>
        )}
      </header>
      {open && <div className="mf-section-body">{children}</div>}
    </section>
  )
}
