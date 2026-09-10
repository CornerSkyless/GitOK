import React, { useState, useEffect, useMemo } from 'react'
import { GitStatusWorkspace } from './components/git/GitStatusWorkspace'
import TitleBar from './components/TitleBar'
import SettingsModal from './components/SettingsModal'
import './assets/main.css'
import {
  hasWatchTargets,
  readWatchConfig,
  WATCH_CONFIG_KEY,
  type WatchConfig
} from '../../shared/watchConfig'
import { WatchController, type WatchState } from './watchController'

interface UpdateCheckResult {
  hasError: boolean
  error?: string
  hasUpdate?: boolean
  currentVersion?: string
  latestVersion?: string
  downloadUrl?: string
  releaseNotes?: string
  publishedAt?: string
}

function App(): React.JSX.Element {
  const [watchConfig, setWatchConfig] = useState<WatchConfig>(() =>
    readWatchConfig(
      window.api.getConfig(WATCH_CONFIG_KEY, ''),
      window.api.getConfig('selectedDirectory', '')
    )
  )
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(
    () => window.api.getConfig('autoCheckEnabled', 'false') === 'true'
  )
  const [watchState, setWatchState] = useState<WatchState>({
    statuses: [],
    errors: [],
    isLoading: false,
    lastCheckTime: null,
    nextCheckTime: null
  })
  const [showSettings, setShowSettings] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const controller = useMemo(
    () =>
      new WatchController({
        scan: async (config, includeRemote) =>
          config.mode === 'parent'
            ? {
                statuses: await window.api.scanGitRepos(config.parentPath, includeRemote),
                errors: []
              }
            : window.api.scanSelectedGitRepos(config.repoPaths, includeRemote),
        publish: setWatchState,
        updateTray: (statuses) => {
          void window.api.updateTrayIcon(statuses)
        }
      }),
    []
  )

  useEffect(() => {
    controller.configure(watchConfig, autoCheckEnabled)
  }, [controller, watchConfig, autoCheckEnabled])

  useEffect(() => () => controller.dispose(), [controller])

  const applyWatchConfig = (config: WatchConfig): void => {
    const result = window.api.saveConfig(WATCH_CONFIG_KEY, JSON.stringify(config))
    if (!result.success) throw new Error(result.error || '保存监听配置失败')
    setWatchConfig(config)
  }

  const setAutoCheck = (enabled: boolean): void => {
    const result = window.api.saveConfig('autoCheckEnabled', String(enabled))
    if (!result.success) {
      alert(result.error || '保存自动检查设置失败')
      return
    }
    setAutoCheckEnabled(enabled)
  }

  // macOS：为原生侧边栏 Vibrancy（Electron）挂上 html class，参见 mac-vibrancy-sidebar.css
  useEffect(() => {
    if (window.api.windowControls.getPlatform() !== 'darwin') return
    const root = document.documentElement
    root.classList.add('gitok-mac-vibrancy-sidebar')
    return (): void => {
      root.classList.remove('gitok-mac-vibrancy-sidebar')
    }
  }, [])

  useEffect(() => {
    // Migrate the legacy parent directory without changing the active monitoring mode.
    if (!window.api.getConfig(WATCH_CONFIG_KEY, '')) {
      window.api.saveConfig(WATCH_CONFIG_KEY, JSON.stringify(watchConfig))
    }
    void window.api.checkForUpdates().then((result) => {
      if (!result.hasError && result.hasUpdate) {
        setHasUpdate(true)
        setUpdateResult(result)
      }
    })
    // Startup-only persistence and update check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="app">
      <TitleBar onOpenSettings={() => setShowSettings(true)} hasUpdate={hasUpdate} />

      <div className="app-body">
        {!hasWatchTargets(watchConfig) ? (
          <div className="repo-workspace-gitok__empty-app">
            <div className="repo-workspace-gitok__empty-app-inner">
              <p className="repo-workspace-gitok__empty-app-title">尚未选择监听项目</p>
              <p>点击右上角「设置」，选择父目录扫描，或通过目录树手动勾选要监听的 Git 仓库。</p>
            </div>
          </div>
        ) : (
          <GitStatusWorkspace
            gitStatuses={watchState.statuses}
            isLoading={watchState.isLoading}
            watchConfig={watchConfig}
            scanErrors={watchState.errors}
            autoCheckEnabled={autoCheckEnabled}
            onRefresh={() => controller.refresh()}
          />
        )}
      </div>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        watchConfig={watchConfig}
        onApplyWatchConfig={applyWatchConfig}
        autoCheckEnabled={autoCheckEnabled}
        onStartAutoCheck={() => setAutoCheck(true)}
        onStopAutoCheck={() => setAutoCheck(false)}
        lastCheckTime={watchState.lastCheckTime}
        nextCheckTime={watchState.nextCheckTime}
        initialUpdateResult={updateResult}
      />
    </div>
  )
}

export default App
