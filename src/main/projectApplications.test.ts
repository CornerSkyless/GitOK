import { EventEmitter } from 'events'
import { execFile, spawn } from 'child_process'
import { access, stat } from 'fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectLauncher, launchApplication } from './projectApplications'

vi.mock('fs/promises', () => ({ access: vi.fn(), stat: vi.fn() }))
vi.mock('child_process', () => ({ execFile: vi.fn(), spawn: vi.fn() }))

const unixFolder = '/projects/中文 folder \' " $(`echo nope`); & #?%'
const windowsFolder = 'C:\\projects\\中文 folder & %PATH%; #'
let installed: Set<string>
let child: EventEmitter & { unref: ReturnType<typeof vi.fn> }
const external = vi.fn<(url: string) => Promise<void>>()

function launcher(
  platform: NodeJS.Platform,
  env?: NodeJS.ProcessEnv
): ReturnType<typeof createProjectLauncher> {
  return createProjectLauncher({
    platform,
    env: env || { PATH: platform === 'win32' ? 'C:\\bin' : '/usr/bin' },
    openExternal: external
  })
}

beforeEach(() => {
  installed = new Set()
  external.mockResolvedValue(undefined)
  vi.mocked(access).mockImplementation(async (path) => {
    if (!installed.has(String(path))) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  })
  vi.mocked(stat).mockImplementation(async (path) => {
    if (![unixFolder, windowsFolder, ...installed].includes(String(path)))
      throw new Error('missing')
    return {
      isDirectory: () => !installed.has(String(path)),
      isFile: () => installed.has(String(path))
    } as Awaited<ReturnType<typeof stat>>
  })
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void
    queueMicrotask(() => callback(null, '', ''))
    return {} as ReturnType<typeof execFile>
  })
  vi.mocked(spawn).mockImplementation(() => {
    child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    queueMicrotask(() => {
      child.emit('spawn')
      child.emit('exit', 0, null)
    })
    return child as unknown as ReturnType<typeof spawn>
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('project application launch routing', () => {
  it.each([
    ['terminal', 'Terminal'],
    ['iterm', 'iTerm'],
    ['vscode', 'Visual Studio Code'],
    ['cursor', 'Cursor']
  ])(
    'opens macOS %s without requiring a CLI or interpreting the project path',
    async (id, name) => {
      expect(await launcher('darwin')(unixFolder, id)).toEqual({ success: true })
      expect(execFile).toHaveBeenCalledWith(
        '/usr/bin/open',
        ['-a', name, unixFolder],
        { timeout: 10_000 },
        expect.any(Function)
      )
      expect(spawn).not.toHaveBeenCalled()
    }
  )

  it.each(['darwin', 'linux', 'win32'] as const)(
    'encodes Warp paths on %s without losing characters',
    async (platform) => {
      const path = platform === 'win32' ? windowsFolder : unixFolder
      expect(await launcher(platform)(path, 'warp')).toEqual({ success: true })
      const url = new URL(external.mock.calls[0][0])
      expect(url.protocol).toBe('warp:')
      expect(url.hostname + url.pathname).toBe('action/new_window')
      expect(url.searchParams.get('path')).toBe(path)
    }
  )

  it.each([
    ['gnome-terminal', ['--working-directory', unixFolder]],
    ['konsole', ['--workdir', unixFolder]],
    ['xfce4-terminal', ['--working-directory', unixFolder]],
    ['xterm', []]
  ] as const)('uses the first installed Linux terminal: %s', async (name, args) => {
    installed.add(`/usr/bin/${name}`)
    expect(await launcher('linux')(unixFolder, 'terminal')).toEqual({ success: true })
    expect(spawn).toHaveBeenCalledWith(
      `/usr/bin/${name}`,
      args,
      expect.objectContaining({ cwd: unixFolder, shell: false })
    )
  })

  it('prefers GNOME Terminal when several Linux terminals are installed', async () => {
    installed = new Set(['/usr/bin/gnome-terminal', '/usr/bin/konsole', '/usr/bin/xterm'])
    await launcher('linux')(unixFolder, 'terminal')
    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/gnome-terminal',
      expect.any(Array),
      expect.any(Object)
    )
  })

  it('uses Windows Terminal with inherited cwd and a literal dot', async () => {
    installed.add('C:\\bin\\wt.exe')
    expect(await launcher('win32')(windowsFolder, 'terminal')).toEqual({ success: true })
    expect(spawn).toHaveBeenCalledWith(
      'C:\\bin\\wt.exe',
      ['-d', '.'],
      expect.objectContaining({ cwd: windowsFolder, shell: false, windowsHide: false })
    )
  })

  it('falls back to PowerShell when Windows Terminal is absent', async () => {
    const exe = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    installed.add(exe)
    expect(await launcher('win32')(windowsFolder, 'terminal')).toEqual({ success: true })
    expect(spawn).toHaveBeenCalledWith(
      exe,
      ['-NoLogo', '-NoProfile', '-NoExit'],
      expect.objectContaining({ cwd: windowsFolder })
    )
  })

  it.each(['vscode', 'cursor'] as const)('finds Linux %s in PATH', async (application) => {
    const exe = application === 'vscode' ? '/usr/bin/code' : '/usr/bin/cursor'
    installed.add(exe)
    expect(await launcher('linux')(unixFolder, application)).toEqual({ success: true })
    expect(spawn).toHaveBeenCalledWith(exe, [unixFolder], expect.objectContaining({ shell: false }))
  })

  it.each([
    [
      'vscode',
      'C:\\Users\\test\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' }
    ],
    ['cursor', 'C:\\Program Files\\cursor\\Cursor.exe', { ProgramFiles: 'C:\\Program Files' }],
    [
      'vscode',
      'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe',
      { 'ProgramFiles(x86)': 'C:\\Program Files (x86)' }
    ],
    ['cursor', 'C:\\bin\\Cursor.exe', { Path: 'C:\\bin' }],
    ['vscode', 'C:\\VSCode\\Code.exe', { PATH: 'C:\\VSCode\\bin' }]
  ] as const)('finds Windows %s executable at %s', async (id, exe, env) => {
    installed.add(exe)
    expect(await launcher('win32', env)(windowsFolder, id)).toEqual({ success: true })
    expect(spawn).toHaveBeenCalledWith(
      exe,
      [windowsFolder],
      expect.objectContaining({ shell: false })
    )
  })

  it.each([
    [unixFolder, 'unknown', 'darwin'],
    [unixFolder, 'iterm', 'linux'],
    [windowsFolder, 'iterm', 'win32'],
    [unixFolder, 'terminal', 'freebsd'],
    [null, 'terminal', 'darwin'],
    ['relative/path', 'terminal', 'darwin'],
    ['/missing', 'terminal', 'darwin'],
    ['/null\0path', 'terminal', 'darwin'],
    ['/usr/bin/code', 'terminal', 'darwin']
  ] as const)('rejects invalid request %s / %s / %s', async (path, id, platform) => {
    installed.add('/usr/bin/code')
    expect(await launcher(platform)(path, id)).toMatchObject({
      success: false,
      error: expect.any(String)
    })
    expect(spawn).not.toHaveBeenCalled()
    expect(execFile).not.toHaveBeenCalled()
    expect(external).not.toHaveBeenCalled()
  })

  it.each(['linux', 'win32'] as const)(
    'reports missing terminals and editors on %s',
    async (platform) => {
      for (const id of ['terminal', 'vscode', 'cursor']) {
        expect(
          await launcher(platform)(platform === 'linux' ? unixFolder : windowsFolder, id)
        ).toMatchObject({ success: false, error: expect.stringContaining('未找到') })
      }
    }
  )

  it('reports missing Warp protocol handlers', async () => {
    external.mockRejectedValueOnce(new Error('no handler'))
    expect(await launcher('darwin')(unixFolder, 'warp')).toMatchObject({
      success: false,
      error: expect.stringContaining('Warp')
    })
  })

  it('reports macOS startup failure', async () => {
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error) => void
      queueMicrotask(() => callback(new Error('not installed')))
      return {} as ReturnType<typeof execFile>
    })
    expect(await launcher('darwin')(unixFolder, 'iterm')).toMatchObject({
      success: false,
      error: expect.stringContaining('iTerm')
    })
  })

  it('does not search a project-controlled relative PATH', async () => {
    installed.add('bin/code')
    expect(await launcher('linux', { PATH: '.:bin' })(unixFolder, 'vscode')).toMatchObject({
      success: false
    })
    expect(spawn).not.toHaveBeenCalled()
  })
})

describe('GUI process lifecycle', () => {
  it.each(['error', 'exit'] as const)('rejects immediate %s failure', async (event) => {
    vi.mocked(spawn).mockImplementationOnce(() => {
      const process = new EventEmitter()
      queueMicrotask(() =>
        event === 'error'
          ? process.emit('error', new Error('failed'))
          : process.emit('exit', 1, null)
      )
      return process as ReturnType<typeof spawn>
    })
    await expect(launchApplication('/bin/gui', [], unixFolder)).rejects.toThrow()
  })

  it('releases a running GUI after startup without waiting for it to quit', async () => {
    vi.useFakeTimers()
    const process = Object.assign(new EventEmitter(), { unref: vi.fn() })
    vi.mocked(spawn).mockReturnValueOnce(process as unknown as ReturnType<typeof spawn>)
    const promise = launchApplication('/bin/gui', [], unixFolder)
    process.emit('spawn')
    await vi.advanceTimersByTimeAsync(500)
    await expect(promise).resolves.toBeUndefined()
    expect(process.unref).toHaveBeenCalledOnce()
  })
})
