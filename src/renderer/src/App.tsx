import React, { useState, useEffect, useRef, useCallback } from 'react'
import GitStatusList, { GitStatus } from './components/GitStatusList'
import TitleBar from './components/TitleBar'
import SettingsModal from './components/SettingsModal'
import './assets/main.css'

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
  const [currentDirectory, setCurrentDirectory] = useState<string>('')
  const [gitStatuses, setGitStatuses] = useState<GitStatus[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [autoCheckEnabled, setAutoCheckEnabled] = useState<boolean>(false)
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null)
  const [nextCheckTime, setNextCheckTime] = useState<Date | null>(null)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [hasUpdate, setHasUpdate] = useState<boolean>(false)
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)

  // 定时器引用
  const localCheckTimerRef = useRef<NodeJS.Timeout | null>(null)
  const remoteCheckTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastRemoteCheckRef = useRef<Date | null>(null)

  // 加载保存的配置
  useEffect(() => {
    const savedDirectory = window.api.getConfig('selectedDirectory', '')
    const savedAutoCheck = window.api.getConfig('autoCheckEnabled', 'false')

    if (savedDirectory) {
      setCurrentDirectory(savedDirectory)
      // 自动执行一次Git状态扫描
      scanGitRepos(savedDirectory, true)

      // 如果之前启用了自动检查，自动启动
      if (savedAutoCheck === 'true') {
        setAutoCheckEnabled(true)
        // 延迟启动，确保状态已经设置完成
        setTimeout(() => {
          startAutoCheck()
        }, 100)
      }
    }

    // 启动时静默检查版本更新
    window.api.checkForUpdates().then((result) => {
      if (!result.hasError && result.hasUpdate) {
        setHasUpdate(true)
        setUpdateResult(result)
      }
    })
  }, [])

  // 清理定时器
  const clearTimers = (): void => {
    if (localCheckTimerRef.current) {
      clearInterval(localCheckTimerRef.current)
      localCheckTimerRef.current = null
    }
    if (remoteCheckTimerRef.current) {
      clearTimeout(remoteCheckTimerRef.current)
      remoteCheckTimerRef.current = null
    }
  }

  // 计算下次检查时间
  const calculateNextCheckTime = (): void => {
    const now = new Date()
    const nextLocalCheck = new Date(now.getTime() + 60000) // 1分钟后
    const nextRemoteCheck = lastRemoteCheckRef.current
      ? new Date(lastRemoteCheckRef.current.getTime() + 600000) // 10分钟后
      : new Date(now.getTime() + 600000)

    setNextCheckTime(new Date(Math.min(nextLocalCheck.getTime(), nextRemoteCheck.getTime())))
  }

  const scanGitRepos = useCallback(
    async (
      directory: string,
      includeRemote: boolean = true,
      preserveExistingStatuses: boolean = true
    ): Promise<void> => {
      try {
        setIsLoading(true)
        const statuses = await window.api.scanGitRepos(directory, includeRemote)
        setGitStatuses(statuses)
        setLastCheckTime(new Date())
        calculateNextCheckTime()
      } catch (error) {
        console.error('扫描 Git 仓库失败:', error)
        if (!preserveExistingStatuses) {
          setGitStatuses([])
        }
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  // 启动定时检查
  const startAutoCheck = useCallback((): void => {
    if (!currentDirectory) return

    clearTimers()

    // 立即执行一次完整检查
    scanGitRepos(currentDirectory, true)

    // 设置1分钟检查本地状态的定时器
    localCheckTimerRef.current = setInterval(() => {
      if (currentDirectory) {
        scanGitRepos(currentDirectory, false) // 只检查本地状态
      }
    }, 60000) // 1分钟

    // 设置10分钟检查远程状态的定时器
    const scheduleRemoteCheck = (): void => {
      if (remoteCheckTimerRef.current) {
        clearTimeout(remoteCheckTimerRef.current)
      }

      remoteCheckTimerRef.current = setTimeout(() => {
        if (currentDirectory) {
          scanGitRepos(currentDirectory, true) // 完整检查包括远程状态
          lastRemoteCheckRef.current = new Date()
          // 设置下一次远程检查
          scheduleRemoteCheck()
        }
      }, 600000) // 10分钟
    }

    scheduleRemoteCheck()
    setAutoCheckEnabled(true)

    // 保存自动检查状态到localStorage
    window.api.saveConfig('autoCheckEnabled', 'true')
  }, [currentDirectory, scanGitRepos])

  // 停止定时检查
  const stopAutoCheck = useCallback((): void => {
    clearTimers()
    setAutoCheckEnabled(false)
    setLastCheckTime(null)
    setNextCheckTime(null)

    // 保存自动检查状态到localStorage
    window.api.saveConfig('autoCheckEnabled', 'false')
  }, [])

  const handleDirectoryChange = useCallback(
    async (newDirectory: string): Promise<void> => {
      setCurrentDirectory(newDirectory)

      // 保存目录到localStorage
      if (newDirectory) {
        window.api.saveConfig('selectedDirectory', newDirectory)
        await scanGitRepos(newDirectory, true, false)
        if (autoCheckEnabled) {
          startAutoCheck()
        }
      } else {
        window.api.saveConfig('selectedDirectory', '')
        setGitStatuses([])
        stopAutoCheck()
      }
    },
    [autoCheckEnabled, scanGitRepos, startAutoCheck, stopAutoCheck]
  )

  const refreshStatus = useCallback((): void => {
    if (currentDirectory) {
      scanGitRepos(currentDirectory, true)
    }
  }, [currentDirectory, scanGitRepos])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [])

  // 当目录改变时，如果启用了自动检查，重新启动定时器
  useEffect(() => {
    if (currentDirectory && autoCheckEnabled) {
      startAutoCheck()
    }
  }, [currentDirectory, autoCheckEnabled, startAutoCheck])

  return (
    <div className="app">
      <TitleBar onOpenSettings={() => setShowSettings(true)} hasUpdate={hasUpdate} />
      <header className="app-header">
        <h1>GitOK - Git 状态监控器</h1>
        <p>监控本地目录下一级子文件夹的 Git 状态</p>
      </header>

      <main className="app-main">
        {currentDirectory && (
          <div className="toolbar">
            <div className="toolbar-left">
              <span className="toolbar-current-dir" title={currentDirectory}>
                {currentDirectory}
              </span>
            </div>
            <div className="toolbar-right">
              {isLoading && (
                <span className="toolbar-refresh-indicator" aria-live="polite">
                  <span className="toolbar-refresh-spinner" aria-hidden="true" />
                  刷新中...
                </span>
              )}
              {autoCheckEnabled && <span className="toolbar-auto-indicator">自动检查已开启</span>}
              <button onClick={refreshStatus} className="refresh-btn" disabled={isLoading}>
                {isLoading ? '正在刷新' : '刷新状态'}
              </button>
            </div>
          </div>
        )}

        <GitStatusList gitStatuses={gitStatuses} isLoading={isLoading} />
      </main>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        currentDirectory={currentDirectory}
        onDirectoryChange={handleDirectoryChange}
        autoCheckEnabled={autoCheckEnabled}
        onStartAutoCheck={startAutoCheck}
        onStopAutoCheck={stopAutoCheck}
        lastCheckTime={lastCheckTime}
        nextCheckTime={nextCheckTime}
        initialUpdateResult={updateResult}
      />
    </div>
  )
}

export default App
