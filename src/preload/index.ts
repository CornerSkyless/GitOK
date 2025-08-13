import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectDirectory: async () => {
    try {
      return await ipcRenderer.invoke('selectDirectory')
    } catch (error) {
      console.error('Preload selectDirectory error:', error)
      throw error
    }
  },
  scanGitRepos: async (rootPath: string, includeRemote: boolean = true) => {
    try {
      return await ipcRenderer.invoke('scanGitRepos', rootPath, includeRemote)
    } catch (error) {
      console.error('Preload scanGitRepos error:', error)
      throw error
    }
  },
  updateTrayIcon: async (
    gitStatuses: Array<{
      isGitRepo: boolean
      hasUncommittedChanges: boolean
      isPushed: boolean
      aheadCount: number
      behindCount: number
    }>
  ) => {
    try {
      return await ipcRenderer.invoke('updateTrayIcon', gitStatuses)
    } catch (error) {
      console.error('Preload updateTrayIcon error:', error)
      throw error
    }
  },
  // 保存配置到localStorage
  saveConfig: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
      return { success: true }
    } catch (error) {
      console.error('保存配置失败:', error)
      return { success: false, error: String(error) }
    }
  },
  // 从localStorage获取配置
  getConfig: (key: string, defaultValue: string = '') => {
    try {
      return localStorage.getItem(key) || defaultValue
    } catch (error) {
      console.error('获取配置失败:', error)
      return defaultValue
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
