import { getPushDisabledReason, isPendingPush, isSynced } from '../../../../shared/gitPush'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GitFilterKey, GitSortKey, GitStatus } from './types'
import { GitSidebar } from './GitSidebar'
import { RepoListPane } from './RepoListPane'
import { RepoDetailPane } from './RepoDetailPane'
import type { WatchConfig, WatchError } from '../../../../shared/watchConfig'

interface GitStatusWorkspaceProps {
  gitStatuses: GitStatus[]
  isLoading: boolean
  watchConfig: WatchConfig
  scanErrors: WatchError[]
  autoCheckEnabled: boolean
  onRefresh: () => Promise<void>
}

function applyFilter(list: GitStatus[], activeFilter: GitFilterKey): GitStatus[] {
  switch (activeFilter) {
    case 'notGitRepo':
      return list.filter((s) => !s.isGitRepo)
    case 'hasChanges':
      return list.filter((s) => s.isGitRepo && s.hasUncommittedChanges)
    case 'pendingPush':
      return list.filter(isPendingPush)
    case 'behind':
      return list.filter((s) => s.isGitRepo && s.behindCount > 0)
    case 'synced':
      return list.filter(isSynced)
    default:
      return list
  }
}

function sortRepos(
  repos: GitStatus[],
  sortType: GitSortKey,
  sortDirection: 'asc' | 'desc'
): GitStatus[] {
  const list = [...repos]
  list.sort((a, b) => {
    let comparison = 0
    switch (sortType) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break
      case 'lastUpdate': {
        if (!a.isGitRepo && !b.isGitRepo) return 0
        if (!a.isGitRepo) return 1
        if (!b.isGitRepo) return -1
        const dateA = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0
        const dateB = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0
        comparison = dateA - dateB
        break
      }
      case 'status': {
        const priority = (s: GitStatus): number => {
          if (!s.isGitRepo) return 0
          if (s.hasUncommittedChanges) return 4
          if (isPendingPush(s)) return 3
          if (s.behindCount > 0) return 2
          return 1
        }
        comparison = priority(b) - priority(a)
        break
      }
      default:
        break
    }
    return sortDirection === 'asc' ? comparison : -comparison
  })
  return list
}

/** 三栏视图：侧边筛选 + 列表 + 仓库详情 */
export function GitStatusWorkspace({
  gitStatuses,
  isLoading,
  watchConfig,
  scanErrors,
  autoCheckEnabled,
  onRefresh
}: GitStatusWorkspaceProps): React.JSX.Element {
  const [activeFilter, setActiveFilter] = useState<GitFilterKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortType, setSortType] = useState<GitSortKey>('lastUpdate')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const [pushStates, setPushStates] = useState<
    Record<string, { pending: boolean; error?: string }>
  >({})
  const [pushNotice, setPushNotice] = useState('')
  const pushingPaths = useRef(new Set<string>())

  const handlePush = async (repo: GitStatus): Promise<void> => {
    if (pushingPaths.current.has(repo.path) || getPushDisabledReason(repo) || !repo.upstream) return
    pushingPaths.current.add(repo.path)
    setPushStates((states) => ({ ...states, [repo.path]: { pending: true } }))
    setPushNotice('')
    let error: string | undefined
    try {
      const result = await window.api.pushGitRepo({
        repoPath: repo.path,
        expectedBranch: repo.branch!,
        expectedUpstream: repo.upstream
      })
      if (result.success) setPushNotice(`${repo.name} 推送成功`)
      else {
        error = result.error
        setPushNotice(`${repo.name} 推送失败：${error}`)
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
      setPushNotice(`${repo.name} 推送失败：${error}`)
    } finally {
      // A full scan invalidates any pre-push scan still in flight, including tray updates.
      try {
        await onRefresh()
      } finally {
        pushingPaths.current.delete(repo.path)
        setPushStates((states) => ({ ...states, [repo.path]: { pending: false, error } }))
      }
    }
  }

  const sortSnapshotRef = useRef({ sortType, sortDirection })
  sortSnapshotRef.current = { sortType, sortDirection }

  const visibleRepos = useMemo(() => {
    const afterFilter = applyFilter(gitStatuses, activeFilter)
    const q = searchQuery.trim().toLowerCase()
    const searched = q ? afterFilter.filter((s) => s.name.toLowerCase().includes(q)) : afterFilter
    return sortRepos(searched, sortType, sortDirection)
  }, [gitStatuses, activeFilter, searchQuery, sortType, sortDirection])

  useEffect(() => {
    setSelectedPath((prev) => {
      if (prev && visibleRepos.some((s) => s.path === prev)) return prev
      return visibleRepos[0]?.path ?? null
    })
  }, [visibleRepos])

  const handleSortToggle = useCallback((key: GitSortKey) => {
    const snap = sortSnapshotRef.current
    if (snap.sortType === key) {
      setSortDirection(snap.sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortType(key)
      setSortDirection('desc')
    }
  }, [])

  const listEmptyHint = useMemo(() => {
    if (isLoading && gitStatuses.length === 0) return null
    if (!isLoading && gitStatuses.length === 0)
      return watchConfig.mode === 'manual'
        ? '当前没有可读取的已选仓库。请检查错误提示，或在设置中调整项目清单。'
        : '当前目录下没有可扫描的一级子文件夹。请在设置中选择包含多个项目的上级目录。'
    if (!isLoading && visibleRepos.length === 0)
      return '没有匹配当前筛选或搜索的项目。可尝试调整左侧「视图」，或清空搜索框。'
    return null
  }, [gitStatuses.length, visibleRepos.length, isLoading, watchConfig.mode])

  const selectedRepo = selectedPath
    ? (gitStatuses.find((s) => s.path === selectedPath) ?? null)
    : null

  return (
    <div className="git-workspace">
      <GitSidebar
        gitStatuses={gitStatuses}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <div className="git-workspace__main">
        <div className="git-workspace__toolbar">
          <span
            className="git-workspace__toolbar-dir"
            title={
              watchConfig.mode === 'parent'
                ? watchConfig.parentPath
                : watchConfig.repoPaths.join('\n')
            }
          >
            {watchConfig.mode === 'parent'
              ? watchConfig.parentPath
              : `手动选择 · ${watchConfig.repoPaths.length} 个项目`}
          </span>
          <div className="git-workspace__toolbar-actions">
            {autoCheckEnabled && <span className="git-workspace__pill">自动检查开启</span>}
            {isLoading && gitStatuses.length > 0 && (
              <span className="git-workspace__pill git-workspace__pill--busy">
                <span className="git-workspace__spinner" aria-hidden />
                刷新中
              </span>
            )}
            <button
              type="button"
              className="git-workspace__btn-primary"
              disabled={isLoading}
              onClick={onRefresh}
            >
              {isLoading ? '正在刷新…' : '刷新状态'}
            </button>
          </div>
        </div>

        {pushNotice && (
          <div className="git-workspace__push-notice" role="status">
            <span>{pushNotice}</span>
            <button
              type="button"
              className="git-workspace__icon-btn"
              aria-label="关闭推送提示"
              onClick={() => setPushNotice('')}
            >
              ×
            </button>
          </div>
        )}
        {scanErrors.length > 0 && (
          <div className="watch-scan-errors" role="alert">
            <strong>{scanErrors.length} 个目录检查失败，下次刷新将重试</strong>
            <ul>
              {scanErrors.map((error) => (
                <li key={error.path}>
                  <span>{error.path}</span>：{error.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="git-workspace__split">
          <RepoListPane
            items={visibleRepos}
            selectedPath={selectedPath}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortType={sortType}
            sortDirection={sortDirection}
            onSortToggle={handleSortToggle}
            onSelectRepo={setSelectedPath}
            isLoading={isLoading}
            emptyHint={listEmptyHint}
          />
          <RepoDetailPane
            repo={selectedRepo}
            pushState={selectedRepo ? pushStates[selectedRepo.path] : undefined}
            onPush={(repo) => {
              void handlePush(repo)
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** 供其他模块按需复用的 Git 数据结构 */
export type { GitStatus } from './types'
