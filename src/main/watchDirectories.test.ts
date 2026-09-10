import { execFile } from 'child_process'
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalDirectory,
  inspectWatchDirectory,
  isRepositoryRoot,
  listWatchDirectories,
  scanSelectedGitRepos
} from './watchDirectories'

const exec = promisify(execFile)
const status = {
  isGitRepo: true,
  hasUncommittedChanges: false,
  isPushed: true,
  aheadCount: 0,
  behindCount: 0
}

describe('watch directory discovery and explicit scans', () => {
  let root: string
  const git = (cwd: string, ...args: string[]): Promise<unknown> => exec('git', args, { cwd })
  const initRepo = async (path: string): Promise<void> => {
    await mkdir(path, { recursive: true })
    await git(path, 'init')
    await git(
      path,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Initial'
    )
  }

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'gitok-watch-')))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists only one directory level, detects real roots, hides .git, and supports nested repositories', async () => {
    await initRepo(root)
    await mkdir(join(root, 'ordinary', 'deep'), { recursive: true })
    await initRepo(join(root, 'ordinary', 'nested'))
    const listing = await listWatchDirectories(root)
    expect(listing.directory.isRepository).toBe(true)
    expect(listing.children.map((child) => child.name)).toEqual(['ordinary'])
    expect(listing.children[0].isRepository).toBe(false)
    expect(await isRepositoryRoot(join(root, 'ordinary'))).toBe(false)
    expect((await inspectWatchDirectory(join(root, 'ordinary', 'nested'))).isRepository).toBe(true)
  })

  it('recognizes .git files for linked worktrees and submodules', async () => {
    const source = join(root, 'source')
    await initRepo(source)
    await git(source, 'worktree', 'add', join(root, 'worktree'), '-b', 'other')
    await git(source, '-c', 'protocol.file.allow=always', 'submodule', 'add', source, 'module')
    expect(await isRepositoryRoot(join(root, 'worktree'))).toBe(true)
    expect(await isRepositoryRoot(join(source, 'module'))).toBe(true)
  })

  it('canonicalizes links for deduplication and exposes ancestor links without recursive traversal', async () => {
    await initRepo(join(root, 'repo'))
    await symlink(join(root, 'repo'), join(root, 'alias'))
    await symlink(root, join(root, 'repo', 'loop'))
    expect(await canonicalDirectory(join(root, 'alias'))).toBe(join(root, 'repo'))
    const children = (await listWatchDirectories(join(root, 'repo'))).children
    expect(children.find((child) => child.name === 'loop')?.path).toBe(root)
    const check = vi.fn().mockResolvedValue(status)
    const result = await scanSelectedGitRepos(
      [join(root, 'alias'), join(root, 'repo')],
      true,
      check
    )
    expect(result.statuses).toHaveLength(1)
    expect(check).toHaveBeenCalledExactlyOnceWith(join(root, 'repo'), true)
  })

  it('scans only the selected repository and isolates missing, non-root and failing selections', async () => {
    await initRepo(join(root, 'good'))
    await initRepo(join(root, 'unselected'))
    await initRepo(join(root, 'failing'))
    await mkdir(join(root, 'good', 'ordinary'))
    const check = vi.fn(async (path: string) => {
      if (path.endsWith('failing')) throw new Error('Cannot read status')
      return status
    })
    const result = await scanSelectedGitRepos(
      [
        join(root, 'missing'),
        join(root, 'good', 'ordinary'),
        join(root, 'failing'),
        join(root, 'good')
      ],
      false,
      check
    )
    expect(result.statuses.map((repo) => repo.path)).toEqual([join(root, 'good')])
    expect(result.errors).toHaveLength(3)
    expect(check).toHaveBeenCalledTimes(2)
    await rm(join(root, 'good', '.git'), { recursive: true })
    expect(
      (await scanSelectedGitRepos([join(root, 'good')], true, check)).errors[0].message
    ).toContain('仓库根目录')
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports inaccessible directories and allows retry after access is restored',
    async () => {
      const restricted = join(root, 'restricted')
      await mkdir(restricted)
      await chmod(restricted, 0)
      try {
        await expect(listWatchDirectories(restricted)).rejects.toThrow()
      } finally {
        await chmod(restricted, 0o700)
      }
      expect((await listWatchDirectories(restricted)).children).toEqual([])
    }
  )

  it('rejects relative paths and files', async () => {
    await writeFile(join(root, 'file'), 'test')
    await expect(canonicalDirectory('relative')).rejects.toThrow()
    await expect(listWatchDirectories(join(root, 'file'))).rejects.toThrow('文件夹')
  })
})
