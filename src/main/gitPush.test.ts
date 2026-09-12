import { execFileSync } from 'child_process'
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushGitRepo } from './gitPush'
import { checkGitStatus } from './gitStatus'
import type { GitPushRequest } from '../shared/gitPush'
import * as commands from './gitCommand'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync(
    'git',
    ['-c', 'user.name=GitOK Test', '-c', 'user.email=test@example.com', ...args],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  ).trim()

describe('push current branch to its configured upstream', () => {
  let root: string
  let repo: string
  let remote: string
  let request: GitPushRequest

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'gitok-push-'))
    repo = join(root, '项目 with spaces')
    remote = join(root, 'remote.git')
    await mkdir(repo)
    git(root, 'init', '--bare', remote)
    git(repo, 'init', '-b', 'feature/local')
    git(repo, 'commit', '--allow-empty', '-m', 'initial')
    git(repo, 'remote', 'add', 'team', remote)
    git(repo, 'push', '-u', 'team', 'HEAD:refs/heads/review')
    git(repo, 'commit', '--allow-empty', '-m', 'pending')
    request = {
      repoPath: repo,
      expectedBranch: 'feature/local',
      expectedUpstream: {
        remote: 'team',
        branch: 'refs/heads/review',
        ref: 'refs/remotes/team/review'
      }
    }
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  it('pushes a different-name upstream on a non-origin remote and preserves staged and untracked files', async () => {
    await writeFile(join(repo, 'staged.txt'), 'staged')
    git(repo, 'add', '.')
    await writeFile(join(repo, 'untracked.txt'), 'untracked')
    const before = git(repo, 'status', '--porcelain')
    expect(await checkGitStatus(repo)).toMatchObject({
      aheadCount: 1,
      behindCount: 0,
      upstream: request.expectedUpstream
    })
    expect(await pushGitRepo(request)).toEqual({ success: true })
    expect(git(remote, 'rev-parse', 'refs/heads/review')).toBe(git(repo, 'rev-parse', 'HEAD'))
    expect(git(repo, 'status', '--porcelain')).toBe(before)
    expect(await checkGitStatus(repo)).toMatchObject({
      aheadCount: 0,
      isPushed: true,
      hasUncommittedChanges: true
    })
  })

  it('supports the ordinary same-name origin upstream', async () => {
    git(repo, 'remote', 'rename', 'team', 'origin')
    git(repo, 'branch', '-m', 'review')
    const status = await checkGitStatus(repo)
    expect(
      await pushGitRepo({
        repoPath: repo,
        expectedBranch: 'review',
        expectedUpstream: status.upstream!
      })
    ).toEqual({ success: true })
    expect(git(remote, 'rev-parse', 'refs/heads/review')).toBe(git(repo, 'rev-parse', 'HEAD'))
  })

  it('ignores default push refspecs, mirror mode, pushRemote and followTags', async () => {
    git(repo, 'branch', 'other')
    git(repo, 'tag', '-a', 'private-tag', '-m', 'local tag')
    git(repo, 'config', 'remote.team.push', '+refs/heads/*:refs/heads/*')
    git(repo, 'config', 'remote.team.mirror', 'true')
    git(repo, 'config', 'push.followTags', 'true')
    git(repo, 'config', 'branch.feature/local.pushRemote', 'missing')
    expect(await pushGitRepo(request)).toEqual({ success: true })
    expect(git(remote, 'for-each-ref', '--format=%(refname)')).toBe('refs/heads/review')
  })

  it('rejects branches with no upstream, detached HEAD, and stale branch or upstream requests', async () => {
    expect(await pushGitRepo({ ...request, expectedBranch: 'other' })).toMatchObject({
      success: false,
      error: expect.stringContaining('已变更')
    })
    expect(
      await pushGitRepo({
        ...request,
        expectedUpstream: { ...request.expectedUpstream, branch: 'refs/heads/other' }
      })
    ).toMatchObject({ success: false, error: expect.stringContaining('已变更') })
    git(repo, 'branch', '--unset-upstream')
    expect(await checkGitStatus(repo)).toMatchObject({ isPushed: false, upstream: undefined })
    expect(await pushGitRepo(request)).toMatchObject({ success: false, error: '请先设置上游分支' })
    git(repo, 'checkout', '--detach')
    expect(await pushGitRepo(request)).toMatchObject({
      success: false,
      error: expect.stringContaining('未处于分支')
    })
  })

  it('blocks known divergence and rejects an unseen remote advance without fetching or forcing', async () => {
    const peer = join(root, 'peer')
    git(root, 'clone', '-b', 'review', remote, peer)
    git(peer, 'commit', '--allow-empty', '-m', 'remote advance')
    git(peer, 'push')
    const remoteHead = git(remote, 'rev-parse', 'refs/heads/review')
    const rejected = await pushGitRepo(request)
    expect(rejected).toMatchObject({
      success: false,
      error: expect.stringMatching(/reject|fetch first/i)
    })
    expect(git(remote, 'rev-parse', 'refs/heads/review')).toBe(remoteHead)
    expect((await checkGitStatus(repo)).behindCount).toBe(0)
    git(repo, 'fetch', 'team')
    expect(await checkGitStatus(repo)).toMatchObject({ aheadCount: 1, behindCount: 1 })
    expect(await pushGitRepo(request)).toEqual({ success: false, error: '请先同步远程分支' })
  })

  it('exposes missing upstream refs as an error instead of a synced repository', async () => {
    git(repo, 'update-ref', '-d', request.expectedUpstream.ref)
    expect(await checkGitStatus(repo)).toMatchObject({
      isPushed: false,
      remoteStatusError: expect.stringContaining('读取上游状态失败')
    })
    expect(await pushGitRepo(request)).toMatchObject({
      success: false,
      error: expect.stringContaining('读取上游状态失败')
    })
  })

  it('rejects duplicate pushes through canonical path aliases and releases the lock after failure', async () => {
    const alias = join(root, 'alias')
    await symlink(repo, alias, 'dir')
    const original = commands.executeGitCommand
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.spyOn(commands, 'executeGitCommand').mockImplementation(async (cwd, args, timeout) => {
      if (args.includes('push') && args.includes('--porcelain')) {
        entered()
        await gate
        throw new Error('Authentication failed')
      }
      return original(cwd, args, timeout)
    })
    const first = pushGitRepo(request)
    await started
    expect(await pushGitRepo({ ...request, repoPath: alias })).toEqual({
      success: false,
      error: '此项目正在推送，请等待完成'
    })
    finish()
    expect(await first).toEqual({ success: false, error: 'Authentication failed' })
    vi.restoreAllMocks()
    expect(await pushGitRepo(request)).toEqual({ success: true })
  })

  it('uses the network timeout, returns timeout errors, and allows retry', async () => {
    const original = commands.executeGitCommand
    const command = vi
      .spyOn(commands, 'executeGitCommand')
      .mockImplementation(async (cwd, args, timeout) => {
        if (args.includes('--porcelain') && args.includes('push')) throw new Error('Git 操作超时')
        return original(cwd, args, timeout)
      })
    expect(await pushGitRepo(request)).toEqual({ success: false, error: 'Git 操作超时' })
    expect(command.mock.calls.find(([, args]) => args.includes('push'))?.[2]).toBe(120_000)
    vi.restoreAllMocks()
    expect(await pushGitRepo(request)).toEqual({ success: true })
  })

  it('returns remote hook rejection output and allows retry after the cause is resolved', async () => {
    const hook = join(remote, 'hooks', 'pre-receive')
    await writeFile(hook, '#!/bin/sh\necho "Protected branch: review required" >&2\nexit 1\n', {
      mode: 0o755
    })
    expect(await pushGitRepo(request)).toMatchObject({
      success: false,
      error: expect.stringContaining('Protected branch')
    })
    await rm(hook)
    expect(await pushGitRepo(request)).toEqual({ success: true })
  })

  it('does not fan out to multiple push URLs or mutate a local upstream', async () => {
    git(repo, 'config', '--add', 'remote.team.pushurl', remote)
    git(repo, 'config', '--add', 'remote.team.pushurl', join(root, 'second.git'))
    expect(await pushGitRepo(request)).toMatchObject({
      success: false,
      error: expect.stringContaining('多个推送地址')
    })
    git(repo, 'branch', 'local-upstream', 'HEAD~1')
    git(repo, 'branch', '--set-upstream-to=local-upstream')
    const status = await checkGitStatus(repo)
    expect(await pushGitRepo({ ...request, expectedUpstream: status.upstream! })).toMatchObject({
      success: false,
      error: '请先设置远程上游分支'
    })
  })

  it('validates IPC inputs and requires a repository root', async () => {
    expect(await pushGitRepo(null as unknown as GitPushRequest)).toMatchObject({
      success: false,
      error: expect.stringContaining('参数无效')
    })
    const folder = join(repo, 'folder')
    await mkdir(folder)
    expect(await pushGitRepo({ ...request, repoPath: folder })).toMatchObject({
      success: false,
      error: expect.stringContaining('根目录')
    })
    expect(await readFile(join(repo, '.git', 'HEAD'), 'utf8')).toContain('refs/heads/feature/local')
  })
})
