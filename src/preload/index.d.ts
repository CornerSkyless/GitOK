import { ElectronAPI } from '@electron-toolkit/preload'

interface GitStatus {
  path: string
  name: string
  isGitRepo: boolean
  hasUncommittedChanges: boolean
  isPushed: boolean
  aheadCount: number
  behindCount: number
  branch?: string
  lastCommitMessage?: string
  lastCommitDate?: string
}

interface WindowControls {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => void
  getPlatform: () => NodeJS.Platform
}

interface CustomAPI {
  selectDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>
  scanGitRepos: (rootPath: string, includeRemote?: boolean) => Promise<GitStatus[]>
  updateTrayIcon: (
    gitStatuses: Array<{
      isGitRepo: boolean
      hasUncommittedChanges: boolean
      isPushed: boolean
      aheadCount: number
      behindCount: number
    }>
  ) => Promise<void>
  // 配置相关方法
  saveConfig: (key: string, value: string) => { success: boolean; error?: string }
  getConfig: (key: string, defaultValue?: string) => string
  // 获取应用版本
  getAppVersion: () => Promise<string>
  // 在系统文件管理器中打开路径
  openFolder: (folderPath: string) => Promise<void>
  // 检查更新
  checkForUpdates: () => Promise<{
    hasError: boolean
    error?: string
    hasUpdate?: boolean
    currentVersion?: string
    latestVersion?: string
    downloadUrl?: string
    releaseNotes?: string
    publishedAt?: string
  }>
  // 窗口控制
  windowControls: WindowControls
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
