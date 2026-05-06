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
  // 窗口控制
  windowControls: WindowControls
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
