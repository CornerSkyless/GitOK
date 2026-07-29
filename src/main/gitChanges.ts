import { spawn } from 'child_process'
import { lstat, mkdtemp, readFile, readlink, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { simpleGit, type FileStatusResult } from 'simple-git'
import type {
  GitChangedFile,
  GitChangeScope,
  GitFileChangeStatus,
  GitFileDiffResult
} from '../shared/gitChanges'

export const DEFAULT_DIFF_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  timeoutMs: 10_000
} as const

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])
const SCOPE_ORDER: Record<GitChangeScope, number> = {
  staged: 0,
  unstaged: 1,
  untracked: 2
}

interface DiffLimits {
  maxBytes: number
  timeoutMs: number
}

interface GitCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  tooLarge: boolean
  timedOut: boolean
}

interface FileContentResult {
  content: string
  isBinary: boolean
  tooLarge: boolean
  timedOut: boolean
}

function mapStatusCode(code: string): GitFileChangeStatus {
  switch (code) {
    case 'A':
      return 'added'
    case 'M':
      return 'modified'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'type-changed'
    case 'U':
      return 'conflicted'
    default:
      return 'unknown'
  }
}

function createChange(
  file: FileStatusResult,
  scope: GitChangeScope,
  status: GitFileChangeStatus
): GitChangedFile {
  return {
    path: file.path,
    ...(file.from && file.from !== file.path ? { previousPath: file.from } : {}),
    scope,
    status
  }
}

export function mapStatusFiles(files: FileStatusResult[]): GitChangedFile[] {
  const changes: GitChangedFile[] = []

  for (const file of files) {
    const pair = `${file.index}${file.working_dir}`

    if (CONFLICT_CODES.has(pair) || file.index === 'U' || file.working_dir === 'U') {
      changes.push(createChange(file, 'unstaged', 'conflicted'))
      continue
    }

    if (file.index === '?' && file.working_dir === '?') {
      changes.push(createChange(file, 'untracked', 'added'))
      continue
    }

    if (file.index && file.index !== ' ' && file.index !== '?') {
      changes.push(createChange(file, 'staged', mapStatusCode(file.index)))
    }

    if (file.working_dir && file.working_dir !== ' ' && file.working_dir !== '?') {
      changes.push(createChange(file, 'unstaged', mapStatusCode(file.working_dir)))
    }
  }

  return changes.sort(
    (a, b) =>
      SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
      a.path.localeCompare(b.path, 'zh-CN', { sensitivity: 'base' })
  )
}

async function resolveRepository(repoPath: string): Promise<string> {
  if (!repoPath || !isAbsolute(repoPath)) {
    throw new Error('仓库路径无效')
  }

  const git = simpleGit({
    baseDir: repoPath,
    maxConcurrentProcesses: 2,
    timeout: { block: DEFAULT_DIFF_LIMITS.timeoutMs }
  })

  if (!(await git.checkIsRepo())) {
    throw new Error('所选目录不是 Git 仓库')
  }

  const root = (await git.revparse(['--show-toplevel'])).trim()
  if (!root || !isAbsolute(root)) {
    throw new Error('无法确定 Git 仓库根目录')
  }

  return resolve(root)
}

function resolveFilePath(
  repoRoot: string,
  filePath: string
): {
  absolutePath: string
  relativePath: string
} {
  if (!filePath || isAbsolute(filePath)) {
    throw new Error('文件路径必须是仓库内的相对路径')
  }

  const absolutePath = resolve(repoRoot, filePath)
  const relativePath = relative(repoRoot, absolutePath)
  const outsideRepository =
    relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)

  if (!relativePath || outsideRepository) {
    throw new Error('文件路径超出 Git 仓库范围')
  }

  return { absolutePath, relativePath }
}

export function runGitCommandWithLimits(
  cwd: string,
  args: string[],
  limits: DiffLimits = DEFAULT_DIFF_LIMITS
): Promise<GitCommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const git = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: '0'
      }
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutBytes = 0
    let tooLarge = false
    let timedOut = false
    let settled = false

    const finish = (result: GitCommandResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolveCommand(result)
    }

    const timeout = setTimeout(() => {
      timedOut = true
      git.kill()
    }, limits.timeoutMs)

    git.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > limits.maxBytes) {
        tooLarge = true
        git.kill()
        return
      }
      stdoutChunks.push(chunk)
    })

    git.stderr.on('data', (chunk: Buffer) => {
      if (stderrChunks.reduce((size, item) => size + item.byteLength, 0) < 64 * 1024) {
        stderrChunks.push(chunk)
      }
    })

    git.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      rejectCommand(error)
    })

    git.on('close', (exitCode) => {
      finish({
        stdout: tooLarge ? '' : Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode,
        tooLarge,
        timedOut
      })
    })
  })
}

function isBinaryPatch(patch: string): boolean {
  return /^(?:Binary files .* differ|GIT binary patch)$/m.test(patch)
}

function isCombinedConflictPatch(patch: string): boolean {
  return /^(?:diff --cc|diff --combined) /m.test(patch)
}

function getPublicGitError(stderr: string, exitCode: number | null): string {
  const firstLine = stderr.trim().split(/\r?\n/, 1)[0]
  return firstLine || `Git 差异命令失败（退出码 ${exitCode ?? '未知'}）`
}

function emptyFileContent(): FileContentResult {
  return {
    content: '',
    isBinary: false,
    tooLarge: false,
    timedOut: false
  }
}

function hasNullByte(buffer: Buffer): boolean {
  return buffer.includes(0)
}

async function readGitObjectContent(
  repoRoot: string,
  objectSpec: string,
  limits: DiffLimits
): Promise<FileContentResult> {
  const result = await runGitCommandWithLimits(repoRoot, ['cat-file', '-p', objectSpec], limits)

  if (result.timedOut) {
    return { ...emptyFileContent(), timedOut: true }
  }

  if (result.tooLarge) {
    return { ...emptyFileContent(), tooLarge: true }
  }

  // A missing side is expected for additions, deletions and repositories without HEAD.
  if (result.exitCode !== 0) {
    return emptyFileContent()
  }

  return {
    content: result.stdout,
    isBinary: result.stdout.includes('\0'),
    tooLarge: false,
    timedOut: false
  }
}

async function readWorkingTreeContent(
  absolutePath: string,
  limits: DiffLimits
): Promise<FileContentResult> {
  let stats

  try {
    stats = await lstat(absolutePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyFileContent()
    }
    throw error
  }

  if (stats.isSymbolicLink()) {
    const content = await readlink(absolutePath)
    return {
      content,
      isBinary: false,
      tooLarge: Buffer.byteLength(content) > limits.maxBytes,
      timedOut: false
    }
  }

  if (!stats.isFile()) {
    throw new Error('该变更不是可按文本读取的普通文件')
  }

  if (stats.size > limits.maxBytes) {
    return { ...emptyFileContent(), tooLarge: true }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), limits.timeoutMs)

  try {
    const buffer = await readFile(absolutePath, { signal: controller.signal })
    if (buffer.byteLength > limits.maxBytes) {
      return { ...emptyFileContent(), tooLarge: true }
    }

    return {
      content: buffer.toString('utf8'),
      isBinary: hasNullByte(buffer),
      tooLarge: false,
      timedOut: false
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { ...emptyFileContent(), timedOut: true }
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function getGitWorkingTreeChanges(repoPath: string): Promise<GitChangedFile[]> {
  const repoRoot = await resolveRepository(repoPath)
  const status = await simpleGit({
    baseDir: repoRoot,
    maxConcurrentProcesses: 2,
    timeout: { block: DEFAULT_DIFF_LIMITS.timeoutMs }
  }).status({ '--untracked-files': 'all' })

  return mapStatusFiles(status.files)
}

export async function getGitFileDiff(
  repoPath: string,
  filePath: string,
  scope: GitChangeScope,
  previousPath?: string,
  limits: DiffLimits = DEFAULT_DIFF_LIMITS
): Promise<GitFileDiffResult> {
  const emptyResult: GitFileDiffResult = {
    path: filePath,
    scope,
    originalContent: '',
    modifiedContent: '',
    isBinary: false,
    tooLarge: false
  }

  try {
    if (!Object.prototype.hasOwnProperty.call(SCOPE_ORDER, scope)) {
      throw new Error('未知的 Git 变更范围')
    }

    const repoRoot = await resolveRepository(repoPath)
    const { absolutePath, relativePath } = resolveFilePath(repoRoot, filePath)
    const previousRelativePath = previousPath
      ? resolveFilePath(repoRoot, previousPath).relativePath
      : relativePath
    let commandResult: GitCommandResult

    if (scope === 'untracked') {
      const tempDirectory = await mkdtemp(join(tmpdir(), 'gitok-diff-'))
      const emptyFilePath = join(tempDirectory, 'empty')
      try {
        await writeFile(emptyFilePath, '')
        commandResult = await runGitCommandWithLimits(
          repoRoot,
          [
            'diff',
            '--no-index',
            '--no-color',
            '--no-ext-diff',
            '--unified=3',
            '--',
            emptyFilePath,
            absolutePath
          ],
          limits
        )
      } finally {
        await rm(tempDirectory, { recursive: true, force: true })
      }
    } else {
      const args = [
        'diff',
        ...(scope === 'staged' ? ['--cached'] : []),
        '--no-color',
        '--no-ext-diff',
        '--find-renames',
        '--unified=3',
        '--',
        relativePath
      ]
      commandResult = await runGitCommandWithLimits(repoRoot, args, limits)
    }

    if (commandResult.timedOut) {
      return { ...emptyResult, error: '读取差异超时，请稍后重试' }
    }

    if (commandResult.tooLarge) {
      return { ...emptyResult, tooLarge: true }
    }

    const acceptedExitCodes = scope === 'untracked' ? [0, 1] : [0]
    if (commandResult.exitCode === null || !acceptedExitCodes.includes(commandResult.exitCode)) {
      return {
        ...emptyResult,
        error: getPublicGitError(commandResult.stderr, commandResult.exitCode)
      }
    }

    if (isCombinedConflictPatch(commandResult.stdout)) {
      return {
        ...emptyResult,
        error: '该文件存在合并冲突，当前版本暂不支持可视化组合差异'
      }
    }

    if (isBinaryPatch(commandResult.stdout)) {
      return { ...emptyResult, isBinary: true }
    }

    let original: FileContentResult
    let modified: FileContentResult

    if (scope === 'staged') {
      ;[original, modified] = await Promise.all([
        readGitObjectContent(repoRoot, `HEAD:${previousRelativePath}`, limits),
        readGitObjectContent(repoRoot, `:${relativePath}`, limits)
      ])
    } else if (scope === 'unstaged') {
      ;[original, modified] = await Promise.all([
        readGitObjectContent(repoRoot, `:${relativePath}`, limits),
        readWorkingTreeContent(absolutePath, limits)
      ])
    } else {
      ;[original, modified] = await Promise.all([
        Promise.resolve(emptyFileContent()),
        readWorkingTreeContent(absolutePath, limits)
      ])
    }

    if (original.timedOut || modified.timedOut) {
      return { ...emptyResult, error: '读取文件内容超时，请稍后重试' }
    }

    if (original.tooLarge || modified.tooLarge) {
      return { ...emptyResult, tooLarge: true }
    }

    if (original.isBinary || modified.isBinary) {
      return { ...emptyResult, isBinary: true }
    }

    return {
      ...emptyResult,
      originalContent: original.content,
      modifiedContent: modified.content
    }
  } catch (error) {
    return {
      ...emptyResult,
      error: error instanceof Error ? error.message : '无法读取 Git 差异'
    }
  }
}
