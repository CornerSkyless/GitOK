import { execFile, spawn } from 'child_process'

/** Keep credentials embedded in remote URLs out of user-visible errors. */
export function publicGitError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(https?:\/\/)[^\s/@]+@/gi, '$1***@')
    .slice(0, 8192)
}

export function executeGitCommand(
  cwd: string,
  args: string[],
  timeoutMs = 10_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const git = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'Never',
        GIT_ASKPASS: '',
        SSH_ASKPASS: '',
        GIT_SSH_COMMAND: `${process.env.GIT_SSH_COMMAND || 'ssh'} -oBatchMode=yes`
      }
    })
    let output = ''
    let errorOutput = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      if (git.pid && process.platform !== 'win32') {
        try {
          process.kill(-git.pid, 'SIGKILL')
        } catch {
          git.kill('SIGKILL')
        }
      } else if (git.pid) {
        execFile('taskkill', ['/pid', String(git.pid), '/T', '/F'], () => {
          git.kill('SIGKILL')
        })
      } else {
        git.kill('SIGKILL')
      }
      // Do not wait for inherited pipes held open by an SSH process or Git hook.
      reject(new Error('Git 操作超时，请检查网络或凭据后刷新状态再重试'))
    }, timeoutMs)
    git.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    git.stdout.on('data', (data: Buffer) => {
      output = (output + data.toString()).slice(-1024 * 1024)
    })
    git.stderr.on('data', (data: Buffer) => {
      errorOutput = (errorOutput + data.toString()).slice(-8192)
    })
    git.on('close', (code) => {
      clearTimeout(timeout)
      if (timedOut) return
      if (code === 0) resolve(output)
      else reject(new Error(publicGitError(errorOutput.trim() || `Git 命令失败（退出码 ${code}）`)))
    })
  })
}
