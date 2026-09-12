import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  nativeImage,
  nativeTheme
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readdir, stat } from 'fs/promises'
import { checkGitStatus } from './gitStatus'
import { pushGitRepo } from './gitPush'
import type { GitPushRequest } from '../shared/gitPush'
import { getGitFileDiff, getGitWorkingTreeChanges } from './gitChanges'
import type { GitChangeScope } from '../shared/gitChanges'
import {
  inspectWatchDirectory,
  listWatchDirectories,
  scanSelectedGitRepos
} from './watchDirectories'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

// 图标路径
const iconPath = join(__dirname, '../../resources/gitTemplate@2x.png')
const appIconPath = join(__dirname, '../../build/icon.png')
const appIconIcnsPath = join(__dirname, '../../build/icon.icns')

// 扩展 app 对象类型
const appWithQuiting = app as typeof app & { isQuiting: boolean }

// 更新状态栏图标 - 使用文字显示
function updateTrayIcon(
  gitStatuses: Array<{
    isGitRepo: boolean
    hasUncommittedChanges: boolean
    isPushed: boolean
    aheadCount: number
    behindCount: number
  }>
): void {
  if (!tray) return

  // 计算需要关注的项目数量
  const attentionCount = gitStatuses.filter(
    (status) =>
      status.isGitRepo &&
      (status.hasUncommittedChanges ||
        !status.isPushed ||
        status.aheadCount > 0 ||
        status.behindCount > 0)
  ).length

  if (attentionCount > 0) {
    // 有需要关注的项目，显示数字
    tray.setTitle(attentionCount.toString())
    tray.setToolTip(`GitOK - ${attentionCount} 个项目需要关注`)
  } else {
    // 没有需要关注的项目，显示默认状态
    tray.setTitle('')
    tray.setToolTip('GitOK - 所有项目状态正常')
  }
}

function createTray(): void {
  // macOS 状态栏推荐尺寸为 16x16
  tray = new Tray(iconPath)
  tray.setToolTip('GitOK - Git 状态监控')

  // 创建状态栏菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: '刷新状态',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('refresh-git-status')
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // 点击状态栏图标显示主窗口
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'GitOK',
    ...(process.platform === 'darwin'
      ? {
          /** 透明画布 + Vibrancy → 内容由 CSS 不透明区域镂空，左栏透出系统 NSVisualEffectView */
          transparent: true,
          vibrancy: 'sidebar',
          visualEffectState: 'followWindow',
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 12, y: 11 }
        }
      : {
          frame: false
        }),
    ...(process.platform === 'darwin' ? {} : { icon: appIconPath }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!appWithQuiting.isQuiting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 监听窗口最大化/还原事件，通知渲染进程
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-changed', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-changed', false)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Keep Chromium, native window controls, and macOS vibrancy in sync with the OS appearance.
  nativeTheme.themeSource = 'system'

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.gitok.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  // 在 macOS 上创建状态栏图标
  if (process.platform === 'darwin') {
    createTray()
    // 设置 Dock 图标
    try {
      app.dock!.setIcon(nativeImage.createFromPath(appIconIcnsPath))
    } catch (e) {
      console.error('设置 Dock 图标失败:', e)
    }
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 添加退出标志
appWithQuiting.isQuiting = false

app.on('before-quit', () => {
  appWithQuiting.isQuiting = true
})

// 清理状态栏图标
app.on('will-quit', () => {
  if (tray) {
    tray.destroy()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// 扫描目录下的一级子目录（不递归）
async function scanDirectories(rootPath: string): Promise<Array<{ path: string; name: string }>> {
  try {
    const items = await readdir(rootPath)
    const directories: Array<{ path: string; name: string }> = []

    for (const item of items) {
      const fullPath = join(rootPath, item)
      const stats = await stat(fullPath)

      // 只添加一级子目录，不递归
      if (stats.isDirectory()) {
        directories.push({
          path: fullPath,
          name: item
        })
      }
    }

    return directories
  } catch (error) {
    console.error('扫描目录失败:', error)
    return []
  }
}

// IPC 处理程序
ipcMain.handle(
  'updateTrayIcon',
  async (
    _,
    gitStatuses: Array<{
      isGitRepo: boolean
      hasUncommittedChanges: boolean
      isPushed: boolean
      aheadCount: number
      behindCount: number
    }>
  ) => {
    updateTrayIcon(gitStatuses)
  }
)

ipcMain.handle('selectDirectory', async () => {
  try {
    // 确保主窗口是活跃的
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      mainWindow.focus()
    }

    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      properties: ['openDirectory'],
      title: '选择要监听的目录',
      defaultPath: process.env.HOME || process.env.USERPROFILE || '/',
      buttonLabel: '选择此目录'
    })
    console.log('目录选择结果:', result)

    return result
  } catch (error) {
    console.error('选择目录时出错:', error)
    throw error
  }
})

ipcMain.handle('inspectWatchDirectory', (_, path: string) => inspectWatchDirectory(path))
ipcMain.handle('listWatchDirectories', (_, path: string) => listWatchDirectories(path))
ipcMain.handle('scanSelectedGitRepos', (_, paths: string[], includeRemote: boolean = true) =>
  scanSelectedGitRepos(paths, includeRemote, (path, remote) => checkGitStatus(path, remote, true))
)

ipcMain.handle('scanGitRepos', async (_, rootPath: string, includeRemote: boolean = true) => {
  try {
    const directories = await scanDirectories(rootPath)
    const gitStatuses: Array<{
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
    }> = []

    for (const dir of directories) {
      const gitStatus = await checkGitStatus(dir.path, includeRemote)
      gitStatuses.push({
        ...dir,
        ...gitStatus
      })
    }

    return gitStatuses
  } catch (error) {
    console.error('扫描 Git 仓库失败:', error)
    throw error
  }
})

ipcMain.handle('pushGitRepo', (_, request: GitPushRequest) => pushGitRepo(request))

ipcMain.handle('getGitWorkingTreeChanges', async (_, repoPath: string) => {
  return getGitWorkingTreeChanges(repoPath)
})

ipcMain.handle(
  'getGitFileDiff',
  async (_, repoPath: string, filePath: string, scope: GitChangeScope, previousPath?: string) => {
    return getGitFileDiff(repoPath, filePath, scope, previousPath)
  }
)

// 窗口控制 IPC 处理器
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false
})

// 版本比较辅助函数
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1
    if (parts1[i] < parts2[i]) return -1
  }
  return 0
}

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

ipcMain.handle('getAppVersion', () => {
  return app.getVersion()
})

ipcMain.handle('openFolder', async (_, folderPath: string) => {
  await shell.openPath(folderPath)
})

ipcMain.handle('checkForUpdates', async (): Promise<UpdateCheckResult> => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/CornerSkyless/GitOK/releases/latest',
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'GitOK'
        }
      }
    )

    if (!response.ok) {
      return { hasError: true, error: `请求失败 (HTTP ${response.status})` }
    }

    const release = await response.json()
    const latestVersion = (release.tag_name as string).replace(/^v/, '')
    const currentVersion = app.getVersion()

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

    return {
      hasError: false,
      hasUpdate,
      currentVersion,
      latestVersion,
      downloadUrl: release.html_url as string,
      releaseNotes: (release.body as string) || '',
      publishedAt: release.published_at as string
    }
  } catch (error) {
    return { hasError: true, error: String(error) }
  }
})
