import { execFile, spawn } from 'child_process'
import { constants } from 'fs'
import { access, stat } from 'fs/promises'
import { posix, win32 } from 'path'
import { promisify } from 'util'
import {
  getProjectApplications,
  isProjectApplication,
  PROJECT_APPLICATIONS,
  type OpenProjectResult,
  type ProjectApplication
} from '../shared/projectApplications'

const execFileAsync = promisify(execFile)

// GUI applications may remain alive indefinitely. Observe early startup failures,
// then detach without keeping GitOK alive or holding inherited output pipes open.
export function launchApplication(executable: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`启动进程退出：${signal || code}`))
    })
    child.once('spawn', () => {
      timer = setTimeout(() => {
        child.unref()
        resolve()
      }, 500)
    })
  })
}

interface LauncherOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  openExternal: (url: string) => Promise<void>
}

export function createProjectLauncher({
  platform = process.platform,
  env = process.env,
  openExternal
}: LauncherOptions): (folderPath: unknown, application: unknown) => Promise<OpenProjectResult> {
  const paths = platform === 'win32' ? win32 : posix

  async function findExecutable(candidates: string[]): Promise<string | undefined> {
    const searchPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || ''
    for (const candidate of candidates) {
      const locations = paths.isAbsolute(candidate)
        ? [candidate]
        : searchPath
            .split(paths.delimiter)
            .filter((dir) => paths.isAbsolute(dir))
            .map((dir) => paths.join(dir, candidate))
      for (const location of locations) {
        try {
          await access(location, platform === 'win32' ? constants.F_OK : constants.X_OK)
          if ((await stat(location)).isFile()) return location
        } catch {
          // Continue through installed locations; never search the project directory.
        }
      }
    }
    return undefined
  }

  async function openTerminal(folderPath: string): Promise<void> {
    if (platform === 'win32') {
      const terminal = await findExecutable(['wt.exe'])
      if (terminal) {
        // A literal dot also avoids Windows Terminal's semicolon command parser.
        await launchApplication(terminal, ['-d', '.'], folderPath)
        return
      }
      const powershell = await findExecutable([
        win32.join(
          env.SystemRoot || 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe'
        ),
        'powershell.exe'
      ])
      if (!powershell) throw new Error('未找到 Windows Terminal 或 PowerShell，请安装后重试。')
      await launchApplication(powershell, ['-NoLogo', '-NoProfile', '-NoExit'], folderPath)
      return
    }
    const terminals = [
      { name: 'gnome-terminal', args: ['--working-directory', folderPath] },
      { name: 'konsole', args: ['--workdir', folderPath] },
      { name: 'xfce4-terminal', args: ['--working-directory', folderPath] },
      { name: 'xterm', args: [] }
    ]
    for (const terminal of terminals) {
      const executable = await findExecutable([terminal.name])
      if (executable) {
        await launchApplication(executable, terminal.args, folderPath)
        return
      }
    }
    throw new Error('未找到可用终端，请安装 GNOME Terminal、Konsole、Xfce Terminal 或 xterm。')
  }

  async function openEditor(folderPath: string, application: 'vscode' | 'cursor'): Promise<void> {
    const label = application === 'vscode' ? 'VS Code' : 'Cursor'
    let candidates: string[]
    if (platform === 'win32') {
      const folder = application === 'vscode' ? 'Microsoft VS Code' : 'cursor'
      const executable = application === 'vscode' ? 'Code.exe' : 'Cursor.exe'
      candidates = [
        ...(env.LOCALAPPDATA ? [win32.join(env.LOCALAPPDATA, 'Programs', folder, executable)] : []),
        ...[env.ProgramFiles, env['ProgramFiles(x86)']]
          .filter((root): root is string => Boolean(root))
          .map((root) => win32.join(root, folder, executable)),
        executable,
        // Standard editor PATH entries point to bin/*.cmd; launch the actual EXE.
        win32.join('..', executable)
      ]
    } else {
      candidates = [application === 'vscode' ? 'code' : 'cursor']
    }
    const executable = await findExecutable(candidates)
    if (!executable)
      throw new Error(`未找到 ${label}，请安装应用或将启动程序加入 PATH 后重启 GitOK。`)
    await launchApplication(executable, [folderPath], folderPath)
  }

  return async (folderPath, application): Promise<OpenProjectResult> => {
    if (!isProjectApplication(application)) return { success: false, error: '不支持的应用选项。' }
    if (!getProjectApplications(platform).some(({ id }) => id === application)) {
      return { success: false, error: '当前系统不支持此应用，请选择其他应用。' }
    }
    if (
      typeof folderPath !== 'string' ||
      folderPath.includes('\0') ||
      !paths.isAbsolute(folderPath)
    ) {
      return { success: false, error: '项目目录无效，请重新选择项目。' }
    }
    try {
      if (!(await stat(folderPath)).isDirectory()) throw new Error('Not a directory')
    } catch {
      return { success: false, error: '项目目录不存在或无法访问，请刷新项目列表后重试。' }
    }
    const label = PROJECT_APPLICATIONS.find(({ id }) => id === application)!.label
    try {
      if (application === 'warp') {
        const url = new URL('warp://action/new_window')
        url.searchParams.set('path', folderPath)
        await openExternal(url.toString())
      } else if (platform === 'darwin') {
        const names: Partial<Record<ProjectApplication, string>> = {
          terminal: 'Terminal',
          iterm: 'iTerm',
          vscode: 'Visual Studio Code',
          cursor: 'Cursor'
        }
        await execFileAsync('/usr/bin/open', ['-a', names[application]!, folderPath], {
          timeout: 10_000
        })
      } else if (application === 'terminal') {
        await openTerminal(folderPath)
      } else if (application === 'vscode' || application === 'cursor') {
        await openEditor(folderPath, application)
      }
      return { success: true }
    } catch (error) {
      const message =
        error instanceof Error && error.message.startsWith('未找到')
          ? error.message
          : `无法使用 ${label} 打开项目，请确认应用已安装且能够正常启动后重试。`
      return { success: false, error: message }
    }
  }
}
