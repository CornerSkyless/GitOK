import React, { useState } from 'react'

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

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  currentDirectory: string
  onDirectoryChange: (path: string) => void
  autoCheckEnabled: boolean
  onStartAutoCheck: () => void
  onStopAutoCheck: () => void
  lastCheckTime: Date | null
  nextCheckTime: Date | null
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  currentDirectory,
  onDirectoryChange,
  autoCheckEnabled,
  onStartAutoCheck,
  onStopAutoCheck,
  lastCheckTime,
  nextCheckTime
}) => {
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)

  if (!open) return null

  const handleSelectDirectory = async (): Promise<void> => {
    try {
      const result = await window.api.selectDirectory()
      if (result && result.filePaths && result.filePaths.length > 0) {
        onDirectoryChange(result.filePaths[0])
      }
    } catch (error) {
      console.error('选择目录失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert(`选择目录失败: ${errorMessage}`)
    }
  }

  const handleCheckUpdate = async (): Promise<void> => {
    setIsCheckingUpdate(true)
    setUpdateResult(null)
    try {
      const result = await window.api.checkForUpdates()
      setUpdateResult(result)
    } catch (error) {
      setUpdateResult({ hasError: true, error: String(error) })
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>设置</h2>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭设置">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="2" />
              <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div className="settings-modal-body">
          {/* 目录配置 */}
          <section className="settings-section">
            <h3>监听目录</h3>
            <p className="settings-section-desc">选择要监听的目录，将扫描其下一级子文件夹的 Git 状态</p>
            <div className="settings-directory-controls">
              <input
                type="text"
                value={currentDirectory}
                placeholder="请选择要监听的目录"
                readOnly
                className="settings-directory-input"
              />
              <button onClick={handleSelectDirectory} className="settings-select-btn">
                选择目录
              </button>
            </div>
            {currentDirectory && (
              <p className="settings-current-path">当前监听: {currentDirectory}</p>
            )}
          </section>

          {/* 自动检查配置 */}
          <section className="settings-section">
            <h3>自动检查</h3>
            <p className="settings-section-desc">
              自动定时检查 Git 仓库状态（本地状态每分钟检查一次，远程状态每 10 分钟检查一次）
            </p>
            <div className="settings-auto-check-controls">
              <button
                onClick={autoCheckEnabled ? onStopAutoCheck : onStartAutoCheck}
                className={`settings-auto-check-btn ${autoCheckEnabled ? 'enabled' : 'disabled'}`}
              >
                {autoCheckEnabled ? '停止自动检查' : '启动自动检查'}
              </button>

              {autoCheckEnabled && (
                <div className="settings-check-status">
                  {lastCheckTime && (
                    <span className="settings-check-item">
                      上次检查: {lastCheckTime.toLocaleTimeString('zh-CN')}
                    </span>
                  )}
                  {nextCheckTime && (
                    <span className="settings-check-item">
                      下次检查: {nextCheckTime.toLocaleTimeString('zh-CN')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 检查更新 */}
          <section className="settings-section">
            <h3>检查更新</h3>
            <p className="settings-section-desc">从 GitHub Release 检查是否有新版本可用</p>
            <div className="settings-update-controls">
              <button
                onClick={handleCheckUpdate}
                disabled={isCheckingUpdate}
                className="settings-update-btn"
              >
                {isCheckingUpdate ? '检查中...' : '检查更新'}
              </button>

              {updateResult && !updateResult.hasError && (
                <div className="settings-update-result">
                  <div className="settings-update-versions">
                    <span className="settings-version-tag">当前版本: v{updateResult.currentVersion}</span>
                    <span className="settings-version-arrow">→</span>
                    <span
                      className={`settings-version-tag ${updateResult.hasUpdate ? 'settings-version-tag--new' : 'settings-version-tag--latest'}`}
                    >
                      最新版本: v{updateResult.latestVersion}
                    </span>
                  </div>
                  {updateResult.hasUpdate ? (
                    <div className="settings-update-available">
                      <p>有新版本可用！</p>
                      <a
                        href={updateResult.downloadUrl}
                        className="settings-download-link"
                        onClick={(e) => {
                          e.preventDefault()
                          window.open(updateResult.downloadUrl, '_blank')
                        }}
                      >
                        前往下载 →
                      </a>
                    </div>
                  ) : (
                    <p className="settings-update-latest">已是最新版本</p>
                  )}
                </div>
              )}

              {updateResult?.hasError && (
                <div className="settings-update-error">
                  检查更新失败: {updateResult.error}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
