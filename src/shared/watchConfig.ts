export interface WatchConfig {
  version: 1
  mode: 'parent' | 'manual'
  parentPath: string
  roots: string[]
  repoPaths: string[]
  // Remember tree roots used to select repositories reached through directory links.
  repoSources: Record<string, string[]>
}

export interface WatchDirectory {
  path: string
  name: string
  isRepository: boolean
  error?: string
}

export interface DirectoryListing {
  directory: WatchDirectory
  children: WatchDirectory[]
}

export interface WatchError {
  path: string
  message: string
}

export interface RepositoryStatus {
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
}

export interface WatchScanResult {
  statuses: RepositoryStatus[]
  errors: WatchError[]
}

export const WATCH_CONFIG_KEY = 'watchConfig'

export function emptyWatchConfig(parentPath = ''): WatchConfig {
  return { version: 1, mode: 'parent', parentPath, roots: [], repoPaths: [], repoSources: {} }
}

export function readWatchConfig(serialized: string, legacyParent = ''): WatchConfig {
  try {
    const value = JSON.parse(serialized)
    const paths = (input: unknown): input is string[] =>
      Array.isArray(input) && input.every((item) => typeof item === 'string' && item.length > 0)
    if (
      value?.version !== 1 ||
      !['parent', 'manual'].includes(value.mode) ||
      typeof value.parentPath !== 'string' ||
      !paths(value.roots) ||
      !paths(value.repoPaths)
    )
      return emptyWatchConfig(legacyParent)
    const repoSources: Record<string, string[]> = {}
    for (const path of value.repoPaths) {
      if (paths(value.repoSources?.[path])) repoSources[path] = value.repoSources[path]
    }
    return {
      version: 1,
      mode: value.mode,
      parentPath: value.parentPath,
      roots: [...new Set<string>(value.roots)],
      repoPaths: [...new Set<string>(value.repoPaths)],
      repoSources
    }
  } catch {
    return emptyWatchConfig(legacyParent)
  }
}

export function hasWatchTargets(config: WatchConfig): boolean {
  return config.mode === 'parent' ? Boolean(config.parentPath) : config.repoPaths.length > 0
}

export function isWithinRoot(path: string, root: string): boolean {
  const separator = root.includes('\\') ? '\\' : '/'
  return path === root || path.startsWith(root.endsWith(separator) ? root : root + separator)
}

export function removeWatchRoot(config: WatchConfig, root: string): WatchConfig {
  const roots = config.roots.filter((path) => path !== root)
  const repoPaths = config.repoPaths.filter((path) =>
    roots.some(
      (remaining) => isWithinRoot(path, remaining) || config.repoSources[path]?.includes(remaining)
    )
  )
  return {
    ...config,
    roots,
    repoPaths,
    repoSources: Object.fromEntries(
      repoPaths.map((path) => [
        path,
        (config.repoSources[path] ?? []).filter((source) => roots.includes(source))
      ])
    )
  }
}
