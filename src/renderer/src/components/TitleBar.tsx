import { useState, useEffect } from 'react'

interface TitleBarProps {
  onOpenSettings: () => void
}

function TitleBar({ onOpenSettings }: TitleBarProps): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)
  const platform = window.api.windowControls.getPlatform()
  const isMac = platform === 'darwin'

  useEffect(() => {
    // 查询当前最大化状态
    window.api.windowControls.isMaximized().then(setIsMaximized)

    // 监听最大化状态变化
    window.api.windowControls.onMaximizeChange((maximized) => {
      setIsMaximized(maximized)
    })
  }, [])

  return (
    <div className={`titlebar ${isMac ? 'titlebar--mac' : 'titlebar--win'}`}>
      {isMac ? (
        // macOS: 左侧留出交通灯间距，居中显示标题
        <div className="titlebar-drag titlebar-content">
          <div className="titlebar-traffic-light-spacer" />
          <span className="titlebar-title">GitOK</span>
          <div className="titlebar-traffic-light-spacer titlebar-settings-spacer">
            <button
              className="titlebar-settings-btn"
              onClick={onOpenSettings}
              aria-label="打开设置"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 10a2 2 0 100-4 2 2 0 000 4z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M13.5 8a5.5 5.5 0 01-.3 1.8l1.3 1a.8.8 0 01.2 1l-.6 1a.8.8 0 01-1 .3l-1.5-.6a5.5 5.5 0 01-1.7 1l-.3 1.6a.8.8 0 01-.8.6h-1.2a.8.8 0 01-.8-.6l-.3-1.6a5.5 5.5 0 01-1.7-1l-1.5.6a.8.8 0 01-1-.3l-.6-1a.8.8 0 01.2-1l1.3-1A5.5 5.5 0 012.5 8c0-.6.1-1.2.3-1.8l-1.3-1a.8.8 0 01-.2-1l.6-1a.8.8 0 011-.3l1.5.6a5.5 5.5 0 011.7-1l.3-1.6a.8.8 0 01.8-.6h1.2c.4 0 .7.3.8.6l.3 1.6a5.5 5.5 0 011.7 1l1.5-.6a.8.8 0 011 .3l.6 1a.8.8 0 01-.2 1l-1.3 1c.2.6.3 1.2.3 1.8z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        // Windows: 左侧标题，右侧窗口控制按钮
        <>
          <div className="titlebar-drag titlebar-content titlebar-content--left">
            <span className="titlebar-title">GitOK</span>
            <button
              className="titlebar-settings-btn titlebar-settings-btn--win"
              onClick={onOpenSettings}
              aria-label="打开设置"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 10a2 2 0 100-4 2 2 0 000 4z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M13.5 8a5.5 5.5 0 01-.3 1.8l1.3 1a.8.8 0 01.2 1l-.6 1a.8.8 0 01-1 .3l-1.5-.6a5.5 5.5 0 01-1.7 1l-.3 1.6a.8.8 0 01-.8.6h-1.2a.8.8 0 01-.8-.6l-.3-1.6a5.5 5.5 0 01-1.7-1l-1.5.6a.8.8 0 01-1-.3l-.6-1a.8.8 0 01.2-1l1.3-1A5.5 5.5 0 012.5 8c0-.6.1-1.2.3-1.8l-1.3-1a.8.8 0 01-.2-1l.6-1a.8.8 0 011-.3l1.5.6a5.5 5.5 0 011.7-1l.3-1.6a.8.8 0 01.8-.6h1.2c.4 0 .7.3.8.6l.3 1.6a5.5 5.5 0 011.7 1l1.5-.6a.8.8 0 011 .3l.6 1a.8.8 0 01-.2 1l-1.3 1c.2.6.3 1.2.3 1.8z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            </button>
          </div>
          <div className="titlebar-controls">
            <button
              className="titlebar-control titlebar-control--minimize"
              onClick={() => window.api.windowControls.minimize()}
              aria-label="最小化"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
              </svg>
            </button>
            <button
              className="titlebar-control titlebar-control--maximize"
              onClick={() => window.api.windowControls.maximize()}
              aria-label={isMaximized ? '还原' : '最大化'}
            >
              {isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <rect
                    x="2.5"
                    y="0.5"
                    width="7"
                    height="7"
                    rx="0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.8"
                  />
                  <rect
                    x="0.5"
                    y="2.5"
                    width="7"
                    height="7"
                    rx="0.5"
                    fill="var(--titlebar-bg)"
                    stroke="currentColor"
                    strokeWidth="0.8"
                  />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <rect
                    x="1"
                    y="1"
                    width="8"
                    height="8"
                    rx="0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.8"
                  />
                </svg>
              )}
            </button>
            <button
              className="titlebar-control titlebar-control--close"
              onClick={() => window.api.windowControls.close()}
              aria-label="关闭"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default TitleBar
