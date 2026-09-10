import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyWatchConfig,
  type RepositoryStatus,
  type WatchScanResult
} from '../../shared/watchConfig'
import { WatchController } from './watchController'

const repository = (path: string): RepositoryStatus => ({
  path,
  name: path,
  isGitRepo: true,
  hasUncommittedChanges: false,
  isPushed: true,
  aheadCount: 0,
  behindCount: 0,
  branch: 'main'
})
const result = (path: string): WatchScanResult => ({ statuses: [repository(path)], errors: [] })

describe('watch controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts exactly once, checks locally each minute and remotely every ten minutes', async () => {
    const scan = vi.fn().mockResolvedValue(result('/a'))
    const controller = new WatchController({ scan, publish: vi.fn(), updateTray: vi.fn() })
    const config = emptyWatchConfig('/a')
    controller.configure(config, true)
    controller.configure(config, true)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(scan).toHaveBeenCalledTimes(11)
    expect(scan.mock.calls.map((call) => call[1])).toEqual([true, ...Array(9).fill(false), true])
    expect(vi.getTimerCount()).toBe(1)
    controller.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores old results and tray updates when switching targets', async () => {
    let finishOld!: (value: WatchScanResult) => void
    const scan = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve
          })
      )
      .mockResolvedValue(result('/b/repo'))
    const publish = vi.fn()
    const updateTray = vi.fn()
    const controller = new WatchController({ scan, publish, updateTray })
    controller.configure(emptyWatchConfig('/a'), true)
    const manual = { ...emptyWatchConfig('/a'), mode: 'manual' as const, repoPaths: ['/b/repo'] }
    controller.configure(manual, true)
    await vi.advanceTimersByTimeAsync(0)
    finishOld(result('/a/repo'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(publish.mock.lastCall?.[0].statuses[0].path).toBe('/b/repo')
    expect(updateTray.mock.calls.some(([statuses]) => statuses[0]?.path === '/a/repo')).toBe(false)
    expect(scan.mock.lastCall?.[0]).toEqual(manual)
    controller.dispose()
  })

  it('keeps the ten-minute cadence when a full scan takes time', async () => {
    const scan = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(result('/repo')), 30_000)
        })
    )
    const controller = new WatchController({ scan, publish: vi.fn(), updateTray: vi.fn() })
    controller.configure(emptyWatchConfig('/a'), true)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(scan).toHaveBeenCalledTimes(11)
    expect(scan.mock.lastCall?.[1]).toBe(true)
    controller.dispose()
    await vi.advanceTimersByTimeAsync(30_000)
  })

  it('clears the tray and invalidates pending requests for empty selections, then resumes using the preference', async () => {
    let finish!: (value: WatchScanResult) => void
    const scan = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValue(result('/repo'))
    const publish = vi.fn()
    const updateTray = vi.fn()
    const controller = new WatchController({ scan, publish, updateTray })
    controller.configure(emptyWatchConfig('/a'), true)
    const empty = { ...emptyWatchConfig('/a'), mode: 'manual' as const }
    controller.configure(empty, true)
    finish(result('/stale'))
    await vi.advanceTimersByTimeAsync(600_000)
    expect(vi.getTimerCount()).toBe(0)
    expect(scan).toHaveBeenCalledTimes(1)
    expect(publish.mock.lastCall?.[0]).toMatchObject({
      statuses: [],
      isLoading: false,
      nextCheckTime: null
    })
    expect(updateTray.mock.lastCall).toEqual([[]])
    controller.configure({ ...empty, repoPaths: ['/repo'] }, true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(scan).toHaveBeenCalledTimes(3)
    controller.dispose()
  })

  it('keeps remote counts on local checks and replaces per-project errors after recovery', async () => {
    const remote = { ...repository('/repo'), aheadCount: 3, isPushed: false }
    const scan = vi
      .fn()
      .mockResolvedValueOnce({
        statuses: [remote],
        errors: [{ path: '/missing', message: 'missing' }]
      })
      .mockResolvedValue(result('/repo'))
    const publish = vi.fn()
    const controller = new WatchController({ scan, publish, updateTray: vi.fn() })
    controller.configure(emptyWatchConfig('/a'), true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(publish.mock.lastCall?.[0]).toMatchObject({ statuses: [remote], errors: [] })
    controller.dispose()
  })

  it('stops timers without changing targets and supports manual refresh while auto-check is off', async () => {
    const scan = vi.fn().mockResolvedValue(result('/repo'))
    const publish = vi.fn()
    const controller = new WatchController({ scan, publish, updateTray: vi.fn() })
    const config = emptyWatchConfig('/a')
    controller.configure(config, true)
    await vi.advanceTimersByTimeAsync(0)
    controller.configure(config, false)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(scan).toHaveBeenCalledTimes(1)
    expect(publish.mock.lastCall?.[0].nextCheckTime).toBeNull()
    controller.refresh()
    await vi.advanceTimersByTimeAsync(0)
    expect(scan).toHaveBeenCalledTimes(2)
    controller.dispose()
  })
})
