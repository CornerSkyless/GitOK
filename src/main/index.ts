import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/git.png?asset'
import { spawn } from 'child_process'
import { readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

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
  // 创建状态栏图标，设置为 macOS 推荐的 16x16 尺寸
  let trayIcon = nativeImage.createFromPath(icon)
  trayIcon.setTemplateImage(true) // 在 macOS 上使用模板图片，会自动适应系统主题

  // macOS 状态栏推荐尺寸为 16x16
  trayIcon = trayIcon.resize({ width: 16, height: 16 })

  tray = new Tray(trayIcon)
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
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    title: 'GitOK',
    ...(process.platform === 'linux' ? { icon } : {}),
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

// Git 状态检查函数
async function checkGitStatus(
  repoPath: string,
  includeRemote: boolean = true
): Promise<{
  isGitRepo: boolean
  hasUncommittedChanges: boolean
  isPushed: boolean
  aheadCount: number
  behindCount: number
  branch?: string
  lastCommitMessage?: string
  lastCommitDate?: string
}> {
  try {
    // 检查是否为 git 仓库
    const gitDir = join(repoPath, '.git')
    if (!existsSync(gitDir)) {
      return {
        isGitRepo: false,
        hasUncommittedChanges: false,
        isPushed: true,
        aheadCount: 0,
        behindCount: 0
      }
    }

    // 检查是否有未提交的更改
    const statusResult = await executeGitCommand(repoPath, ['status', '--porcelain'])
    const hasUncommittedChanges = statusResult.trim().length > 0

    // 获取当前分支
    const branchResult = await executeGitCommand(repoPath, ['branch', '--show-current'])
    const branch = branchResult.trim()

    // 获取最后一次提交信息
    const logResult = await executeGitCommand(repoPath, ['log', '-1', '--pretty=format:%s|%ci'])
    const [lastCommitMessage, lastCommitDate] = logResult.split('|')

    // 检查与远程的关系
    let behindCount = 0
    let aheadCount = 0
    if (includeRemote && branch) {
      const remoteResult = await executeGitCommand(repoPath, [
        'rev-list',
        '--count',
        'HEAD..origin/' + branch
      ])
      behindCount = parseInt(remoteResult.trim()) || 0

      const aheadResult = await executeGitCommand(repoPath, [
        'rev-list',
        '--count',
        'origin/' + branch + '..HEAD'
      ])
      aheadCount = parseInt(aheadResult.trim()) || 0
    }

    return {
      isGitRepo: true,
      hasUncommittedChanges,
      isPushed: behindCount === 0 && aheadCount === 0,
      aheadCount,
      behindCount,
      branch,
      lastCommitMessage,
      lastCommitDate: lastCommitDate ? new Date(lastCommitDate).toLocaleString('zh-CN') : undefined
    }
  } catch (error) {
    console.error(`检查 Git 状态失败 ${repoPath}:`, error)
    return {
      isGitRepo: false,
      hasUncommittedChanges: false,
      isPushed: true,
      aheadCount: 0,
      behindCount: 0
    }
  }
}

// 执行 Git 命令
function executeGitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const git = spawn('git', args, { cwd })
    let output = ''
    let errorOutput = ''

    git.stdout.on('data', (data) => {
      output += data.toString()
    })

    git.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    git.on('close', (code) => {
      if (code === 0) {
        resolve(output)
      } else {
        reject(new Error(`Git 命令失败: ${errorOutput}`))
      }
    })
  })
}

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

    // 更新状态栏图标
    updateTrayIcon(gitStatuses)

    return gitStatuses
  } catch (error) {
    console.error('扫描 Git 仓库失败:', error)
    throw error
  }
})
