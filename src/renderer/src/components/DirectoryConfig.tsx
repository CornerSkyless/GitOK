import React from 'react'

interface DirectoryConfigProps {
  onDirectoryChange: (path: string) => void
  currentDirectory: string
}

const DirectoryConfig: React.FC<DirectoryConfigProps> = ({
  onDirectoryChange,
  currentDirectory
}) => {
  const handleSelectDirectory = async (): Promise<void> => {
    try {
      console.log('开始选择目录...')
      const result = await window.api.selectDirectory()
      console.log('选择目录结果:', result)

      if (result && result.filePaths && result.filePaths.length > 0) {
        console.log('选择的目录:', result.filePaths[0])
        onDirectoryChange(result.filePaths[0])
      } else {
        console.log('用户取消了目录选择或没有选择目录')
      }
    } catch (error) {
      console.error('选择目录失败:', error)
      // 可以在这里添加用户提示
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert(`选择目录失败: ${errorMessage}`)
    }
  }

  return (
    <div className="directory-config">
      <h3>监听目录配置（一级子目录）</h3>
      <div className="config-controls">
        <input
          type="text"
          value={currentDirectory}
          placeholder="请选择要监听的目录"
          readOnly
          className="directory-input"
        />
        <button onClick={handleSelectDirectory} className="select-btn">
          选择目录
        </button>
      </div>
      {currentDirectory && <p className="current-path">当前监听: {currentDirectory}</p>}
    </div>
  )
}

export default DirectoryConfig
