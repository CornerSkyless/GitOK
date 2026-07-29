import { mkdtemp, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GitChangeScope } from '../shared/gitChanges'
import {
  getGitFileDiff,
  getGitWorkingTreeChanges,
  mapStatusFiles,
  runGitCommandWithLimits
} from './gitChanges'

describe('Git working tree changes', () => {
  let repositoryPath: string
  let git: SimpleGit

  beforeEach(async () => {
    repositoryPath = await mkdtemp(join(tmpdir(), 'gitok-test-'))
    git = simpleGit(repositoryPath)
    await git.init()
    await git.addConfig('user.name', 'GitOK Test')
    await git.addConfig('user.email', 'gitok@example.com')

    await writeFile(join(repositoryPath, 'tracked.txt'), 'before\n')
    await writeFile(join(repositoryPath, 'rename-me.txt'), 'rename content\n')
    await writeFile(join(repositoryPath, 'delete-me.txt'), 'delete content\n')
    await git.add('.')
    await git.commit('initial')
  })

  afterEach(async () => {
    await rm(repositoryPath, { recursive: true, force: true })
  })

  it('groups staged, unstaged and untracked files without merging their scopes', async () => {
    await writeFile(join(repositoryPath, 'tracked.txt'), 'before\nafter\n')
    await writeFile(join(repositoryPath, 'staged-and-modified.txt'), 'staged version\n')
    await git.add('staged-and-modified.txt')
    await writeFile(
      join(repositoryPath, 'staged-and-modified.txt'),
      'staged version\nworking tree version\n'
    )
    await writeFile(join(repositoryPath, '中文 file.txt'), '未跟踪内容\n')

    const changes = await getGitWorkingTreeChanges(repositoryPath)

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'tracked.txt',
          scope: 'unstaged',
          status: 'modified'
        }),
        expect.objectContaining({
          path: 'staged-and-modified.txt',
          scope: 'staged',
          status: 'added'
        }),
        expect.objectContaining({
          path: 'staged-and-modified.txt',
          scope: 'unstaged',
          status: 'modified'
        }),
        expect.objectContaining({
          path: '中文 file.txt',
          scope: 'untracked',
          status: 'added'
        })
      ])
    )

    const cases: Array<{
      path: string
      scope: GitChangeScope
      original: string
      modified: string
    }> = [
      {
        path: 'tracked.txt',
        scope: 'unstaged',
        original: 'before\n',
        modified: 'before\nafter\n'
      },
      {
        path: 'staged-and-modified.txt',
        scope: 'staged',
        original: '',
        modified: 'staged version\n'
      },
      {
        path: 'staged-and-modified.txt',
        scope: 'unstaged',
        original: 'staged version\n',
        modified: 'staged version\nworking tree version\n'
      },
      {
        path: '中文 file.txt',
        scope: 'untracked',
        original: '',
        modified: '未跟踪内容\n'
      }
    ]

    for (const testCase of cases) {
      const result = await getGitFileDiff(repositoryPath, testCase.path, testCase.scope)
      expect(result.error).toBeUndefined()
      expect(result.originalContent).toBe(testCase.original)
      expect(result.modifiedContent).toBe(testCase.modified)
    }
  })

  it('preserves rename and delete states and detects binary patches', async () => {
    await git.mv('rename-me.txt', 'renamed.txt')
    await git.rm('delete-me.txt')
    await writeFile(join(repositoryPath, 'binary.dat'), Buffer.from([0, 1, 2, 3, 0, 255]))

    const changes = await getGitWorkingTreeChanges(repositoryPath)

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'renamed.txt',
          previousPath: 'rename-me.txt',
          scope: 'staged',
          status: 'renamed'
        }),
        expect.objectContaining({
          path: 'delete-me.txt',
          scope: 'staged',
          status: 'deleted'
        }),
        expect.objectContaining({
          path: 'binary.dat',
          scope: 'untracked',
          status: 'added'
        })
      ])
    )

    const binaryDiff = await getGitFileDiff(repositoryPath, 'binary.dat', 'untracked')
    expect(binaryDiff.error).toBeUndefined()
    expect(binaryDiff.isBinary).toBe(true)

    const renamedDiff = await getGitFileDiff(
      repositoryPath,
      'renamed.txt',
      'staged',
      'rename-me.txt'
    )
    expect(renamedDiff.error).toBeUndefined()
    expect(renamedDiff.originalContent).toBe('rename content\n')
    expect(renamedDiff.modifiedContent).toBe('rename content\n')

    const deletedDiff = await getGitFileDiff(repositoryPath, 'delete-me.txt', 'staged')
    expect(deletedDiff.error).toBeUndefined()
    expect(deletedDiff.originalContent).toBe('delete content\n')
    expect(deletedDiff.modifiedContent).toBe('')
  })

  it('supports repositories without a HEAD commit', async () => {
    const emptyRepository = await mkdtemp(join(tmpdir(), 'gitok-unborn-'))
    try {
      const emptyGit = simpleGit(emptyRepository)
      await emptyGit.init()
      await writeFile(join(emptyRepository, 'staged.txt'), 'first commit content\n')
      await writeFile(join(emptyRepository, 'untracked.txt'), 'not staged\n')
      await emptyGit.add('staged.txt')

      const changes = await getGitWorkingTreeChanges(emptyRepository)
      expect(changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'staged.txt', scope: 'staged', status: 'added' }),
          expect.objectContaining({
            path: 'untracked.txt',
            scope: 'untracked',
            status: 'added'
          })
        ])
      )

      const diff = await getGitFileDiff(emptyRepository, 'staged.txt', 'staged')
      expect(diff.error).toBeUndefined()
      expect(diff.originalContent).toBe('')
      expect(diff.modifiedContent).toBe('first commit content\n')
    } finally {
      await rm(emptyRepository, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === 'win32')(
    'reads symbolic-link text without following its target',
    async () => {
      await symlink('tracked.txt', join(repositoryPath, 'tracked-link.txt'))

      const diff = await getGitFileDiff(repositoryPath, 'tracked-link.txt', 'untracked')

      expect(diff.error).toBeUndefined()
      expect(diff.isBinary).toBe(false)
      expect(diff.originalContent).toBe('')
      expect(diff.modifiedContent).toBe('tracked.txt')
    }
  )

  it('rejects paths outside the repository and unknown scopes', async () => {
    const outside = await getGitFileDiff(repositoryPath, '../outside.txt', 'unstaged')
    expect(outside.error).toContain('超出 Git 仓库范围')

    const previousOutside = await getGitFileDiff(
      repositoryPath,
      'tracked.txt',
      'staged',
      '../outside.txt'
    )
    expect(previousOutside.error).toContain('超出 Git 仓库范围')

    const unknownScope = await getGitFileDiff(
      repositoryPath,
      'tracked.txt',
      'invalid' as GitChangeScope
    )
    expect(unknownScope.error).toContain('未知的 Git 变更范围')
  })

  it('returns safe states for oversized output and timeouts', async () => {
    await writeFile(join(repositoryPath, 'large.txt'), 'x'.repeat(8 * 1024))
    const largeDiff = await getGitFileDiff(repositoryPath, 'large.txt', 'untracked', undefined, {
      maxBytes: 512,
      timeoutMs: 10_000
    })
    expect(largeDiff.tooLarge).toBe(true)
    expect(largeDiff.originalContent).toBe('')
    expect(largeDiff.modifiedContent).toBe('')

    const timedOut = await runGitCommandWithLimits(repositoryPath, ['hash-object', '--stdin'], {
      maxBytes: 1024,
      timeoutMs: 20
    })
    expect(timedOut.timedOut).toBe(true)
  })

  it('maps conflict status pairs to one conflicted working-tree entry', () => {
    const changes = mapStatusFiles([
      {
        path: 'conflicted.txt',
        index: 'U',
        working_dir: 'U'
      }
    ])

    expect(changes).toEqual([
      {
        path: 'conflicted.txt',
        scope: 'unstaged',
        status: 'conflicted'
      }
    ])
  })
})
