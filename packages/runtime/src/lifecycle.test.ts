import { describe, expect, it, vi } from 'vitest'
import { Events, Lifecycle } from './lifecycle'
describe('Runtime script lifecycle', () => {
  it('dispatches creation, start, contact and teardown in order and isolates failing scripts', () => {
    const calls: string[] = [],
      report = vi.fn()
    const lifecycle = new Lifecycle(report)
    lifecycle.add('coin', () => ({
      onCreate: () => calls.push('create'),
      onStart: () => calls.push('start'),
      onTriggerEnter: (id) => calls.push(id),
      onDestroy: () => calls.push('destroy'),
    }))
    lifecycle.add('broken', () => {
      throw Error('user script')
    })
    lifecycle.call('onStart')
    lifecycle.call('onTriggerEnter', 'coin', 'player')
    lifecycle.clear()
    expect(calls).toEqual(['create', 'start', 'player', 'destroy'])
    expect(report).toHaveBeenCalledOnce()
  })
  it('removes subscriptions', () => {
    const events = new Events(),
      handler = vi.fn(),
      off = events.on('score', handler)
    events.emit('score', 5)
    off()
    events.emit('score', 10)
    expect(handler.mock.calls).toEqual([[5]])
  })
})
