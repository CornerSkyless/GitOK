import { useState, useEffect } from 'react'

function TitleBar(): React.JSX.Element {
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
          <div className="titlebar-traffic-light-spacer" />
        </div>
      ) : (
        // Windows: 左侧标题，右侧窗口控制按钮
        <>
          <div className="titlebar-drag titlebar-content titlebar-content--left">
            <span className="titlebar-title">GitOK</span>
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
