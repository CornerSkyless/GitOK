import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'child_process'
import { executeGitCommand, publicGitError } from './gitCommand'

vi.mock('child_process', () => ({ spawn: vi.fn(), execFile: vi.fn() }))

function child(): EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  kill: ReturnType<typeof vi.fn>
} {
  const process = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn()
  })
  vi.mocked(spawn).mockReturnValue(process as unknown as ReturnType<typeof spawn>)
  return process
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('noninteractive Git command execution', () => {
  it('uses argument arrays, disables interactive auth and preserves configured SSH command', async () => {
    const git = child()
    const result = executeGitCommand('/project', ['push', '--', 'team', 'commit:refs/heads/review'])
    expect(spawn).toHaveBeenCalledWith(
      'git',
      ['push', '--', 'team', 'commit:refs/heads/review'],
      expect.objectContaining({
        cwd: '/project',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: expect.objectContaining({
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'Never',
          GIT_ASKPASS: '',
          SSH_ASKPASS: '',
          GIT_SSH_COMMAND: expect.stringContaining('-oBatchMode=yes')
        })
      })
    )
    git.stdout.write('ok')
    git.emit('close', 0)
    await expect(result).resolves.toBe('ok')
  })

  it('times out without waiting for close or an inherited pipe', async () => {
    vi.useFakeTimers()
    const git = child()
    const result = executeGitCommand('/project', ['push'], 120_000)
    const assertion = expect(result).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
    expect(git.kill).toHaveBeenCalledWith('SIGKILL')
    git.emit('close', 0)
  })

  it('returns authentication errors with embedded URL credentials redacted', async () => {
    const git = child()
    const result = executeGitCommand('/project', ['push'])
    git.stderr.write('Authentication failed for https://name:secret@example.com/repo.git')
    git.emit('close', 128)
    await expect(result).rejects.toThrow(
      'Authentication failed for https://***@example.com/repo.git'
    )
    expect(publicGitError(new Error('https://token@example.com/path'))).not.toContain('token')
  })

  it('handles a missing Git executable and clears the timer', async () => {
    vi.useFakeTimers()
    const git = child()
    const result = executeGitCommand('/project', ['status'])
    git.emit('error', new Error('spawn git ENOENT'))
    await expect(result).rejects.toThrow('ENOENT')
    expect(vi.getTimerCount()).toBe(0)
  })
})
