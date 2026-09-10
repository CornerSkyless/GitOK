import { hasWatchTargets, type WatchConfig, type WatchScanResult } from '../../shared/watchConfig'

export interface WatchState extends WatchScanResult {
  isLoading: boolean
  lastCheckTime: Date | null
  nextCheckTime: Date | null
}

interface WatchControllerDependencies {
  scan: (config: WatchConfig, includeRemote: boolean) => Promise<WatchScanResult>
  publish: (state: WatchState) => void
  updateTray: (statuses: WatchScanResult['statuses']) => void
}

/** Owns one active configuration and timer; stale async work never reaches the UI or tray. */
export class WatchController {
  private config: WatchConfig | null = null
  private configKey = ''
  private auto = false
  private timer: ReturnType<typeof setInterval> | null = null
  private request = 0
  private ticksSinceRemote = 0
  private nextTick = 0
  private state: WatchState = {
    statuses: [],
    errors: [],
    isLoading: false,
    lastCheckTime: null,
    nextCheckTime: null
  }

  constructor(private readonly dependencies: WatchControllerDependencies) {}

  configure(config: WatchConfig, auto: boolean): void {
    const key = JSON.stringify(config)
    const changed = key !== this.configKey
    const enabling = auto && !this.auto
    this.clearTimer()
    this.config = config
    this.configKey = key
    this.auto = auto
    if (changed) {
      this.request++
      this.ticksSinceRemote = 0
      this.state = {
        statuses: [],
        errors: [],
        isLoading: false,
        lastCheckTime: null,
        nextCheckTime: null
      }
      this.dependencies.updateTray([])
    }
    if (hasWatchTargets(config)) {
      if (auto) {
        this.nextTick = Date.now() + 60_000
        this.timer = setInterval(() => {
          this.nextTick = Date.now() + 60_000
          this.ticksSinceRemote++
          if (!this.state.isLoading) {
            void this.scan(this.ticksSinceRemote >= 10)
          }
        }, 60_000)
      }
      if (changed || (enabling && !this.state.isLoading)) void this.scan(true)
    }
    this.state = { ...this.state, nextCheckTime: this.nextCheck() }
    this.dependencies.publish(this.state)
  }

  refresh(): void {
    void this.scan(true)
  }

  dispose(): void {
    this.clearTimer()
    this.request++
    this.config = null
    this.configKey = ''
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private nextCheck(): Date | null {
    return this.auto && this.config && hasWatchTargets(this.config) ? new Date(this.nextTick) : null
  }

  private async scan(includeRemote: boolean): Promise<void> {
    if (!this.config || !hasWatchTargets(this.config)) return
    const config = this.config
    const request = ++this.request
    if (includeRemote) this.ticksSinceRemote = 0
    this.state = { ...this.state, isLoading: true }
    this.dependencies.publish(this.state)
    try {
      const result = await this.dependencies.scan(config, includeRemote)
      if (request !== this.request) return
      const previous = new Map(this.state.statuses.map((status) => [status.path, status]))
      const statuses = result.statuses.map((status) => {
        const cached = previous.get(status.path)
        // Local checks must not erase the most recent remote comparison.
        return !includeRemote && cached && cached.branch === status.branch
          ? {
              ...status,
              aheadCount: cached.aheadCount,
              behindCount: cached.behindCount,
              isPushed: cached.isPushed
            }
          : status
      })
      this.state = {
        ...result,
        statuses,
        isLoading: false,
        lastCheckTime: new Date(),
        nextCheckTime: this.nextCheck()
      }
      this.dependencies.updateTray(statuses)
    } catch (error) {
      if (request !== this.request) return
      this.state = {
        ...this.state,
        isLoading: false,
        nextCheckTime: this.nextCheck(),
        errors: [
          {
            path: config.mode === 'parent' ? config.parentPath : '手动选择',
            message: String(error)
          }
        ]
      }
    }
    this.dependencies.publish(this.state)
  }
}
