import { execFile } from 'child_process'
import { readdir, realpath, stat } from 'fs/promises'
import { basename, isAbsolute, join, resolve } from 'path'
import { promisify } from 'util'
import type {
  DirectoryListing,
  RepositoryStatus,
  WatchDirectory,
  WatchScanResult
} from '../shared/watchConfig'

const execFileAsync = promisify(execFile)

export async function canonicalDirectory(path: string): Promise<string> {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('请选择有效的绝对目录路径')
  const canonical = await realpath(resolve(path))
  if (!(await stat(canonical)).isDirectory()) throw new Error('路径不是文件夹')
  return canonical
}

export async function isRepositoryRoot(path: string): Promise<boolean> {
  // Avoid spawning Git for every ordinary child folder of a large directory.
  try {
    await stat(join(path, '.git'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
    cwd: path,
    timeout: 10_000,
    maxBuffer: 1024 * 1024
  })
  return (await canonicalDirectory(stdout.trim())) === (await canonicalDirectory(path))
}

export async function inspectWatchDirectory(path: string): Promise<WatchDirectory> {
  const canonical = await canonicalDirectory(path)
  try {
    return {
      path: canonical,
      name: basename(path) || canonical,
      isRepository: await isRepositoryRoot(canonical)
    }
  } catch (error) {
    return {
      path: canonical,
      name: basename(path) || canonical,
      isRepository: false,
      error: String(error)
    }
  }
}

export async function listWatchDirectories(path: string): Promise<DirectoryListing> {
  const directory = await inspectWatchDirectory(path)
  const entries = await readdir(directory.path, { withFileTypes: true })
  const children: WatchDirectory[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
    if (entry.name === '.git' || (!entry.isDirectory() && !entry.isSymbolicLink())) continue
    const childPath = join(directory.path, entry.name)
    try {
      if (entry.isSymbolicLink() && !(await stat(childPath)).isDirectory()) continue
      children.push(await inspectWatchDirectory(childPath))
    } catch (error) {
      children.push({
        path: childPath,
        name: entry.name,
        isRepository: false,
        error: String(error)
      })
    }
  }
  return { directory, children }
}

export async function scanSelectedGitRepos(
  paths: string[],
  includeRemote: boolean,
  checkStatus: (
    path: string,
    includeRemote: boolean
  ) => Promise<Omit<RepositoryStatus, 'path' | 'name'>>
): Promise<WatchScanResult> {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
    throw new Error('项目路径列表无效')
  }
  const result: WatchScanResult = { statuses: [], errors: [] }
  const visited = new Set<string>()
  for (const path of paths) {
    try {
      const canonical = await canonicalDirectory(path)
      if (visited.has(canonical)) continue
      visited.add(canonical)
      if (!(await isRepositoryRoot(canonical))) throw new Error('该目录已不是 Git 仓库根目录')
      const status = await checkStatus(canonical, includeRemote)
      if (!status.isGitRepo) throw new Error('无法读取 Git 仓库状态')
      result.statuses.push({ ...status, path: canonical, name: basename(canonical) })
    } catch (error) {
      result.errors.push({ path, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
