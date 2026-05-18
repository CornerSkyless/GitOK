import React from 'react'
import { HiOutlineFolderOpen } from 'react-icons/hi2'
import type { GitSortKey, GitStatus } from './types'
import { RepoStatusGlyphs, SortDirectionGlyph } from './repoGlyphs'
import { getRepoRowSubtitle } from './statusText'

const SORT_OPTIONS: { key: GitSortKey; label: string }[] = [
  { key: 'lastUpdate', label: '最近活动' },
  { key: 'name', label: '名称' },
  { key: 'status', label: '状态优先' }
]

interface RepoListPaneProps {
  items: GitStatus[]
  selectedPath: string | null
  searchQuery: string
  onSearchChange: (q: string) => void
  sortType: GitSortKey
  sortDirection: 'asc' | 'desc'
  onSortToggle: (key: GitSortKey) => void
  onSelectRepo: (path: string) => void
  isLoading: boolean
  emptyHint: string | null
}

/** 中部：搜索、排序与仓库列表 */
export function RepoListPane({
  items,
  selectedPath,
  searchQuery,
  onSearchChange,
  sortType,
  sortDirection,
  onSortToggle,
  onSelectRepo,
  isLoading,
  emptyHint
}: RepoListPaneProps): React.JSX.Element {
  return (
    <div className="git-workspace__list-pane">
      <div className="git-workspace__list-header">
        <input
          type="search"
          className="git-workspace__search"
          placeholder="按项目名称搜索..."
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value)
          }}
          aria-label="搜索仓库名称"
        />
        <div className="git-workspace__sort-row">
          <span className="git-workspace__sort-label">排序</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`git-workspace__sort-chip${sortType === key ? ' git-workspace__sort-chip--active' : ''}`}
              onClick={() => {
                onSortToggle(key)
              }}
            >
              <span>{label}</span>
              <SortDirectionGlyph isActive={sortType === key} direction={sortDirection} />
            </button>
          ))}
        </div>
      </div>

      <div className="git-workspace__list-scroll">
        {isLoading && items.length === 0 && (
          <div className="git-workspace__list-empty">
            <div
              className="git-workspace__pill git-workspace__pill--busy"
              style={{ justifyContent: 'center' }}
            >
              <span className="git-workspace__spinner" aria-hidden />
              正在读取 Git 状态…
            </div>
          </div>
        )}
        {items.length === 0 && !isLoading && emptyHint && (
          <div className="git-workspace__list-empty">{emptyHint}</div>
        )}
        {items.map((repo) => {
          const subtitle = getRepoRowSubtitle(repo)
          return (
            <button
              key={repo.path}
              type="button"
              className={`git-workspace__row${selectedPath === repo.path ? ' git-workspace__row--selected' : ''}`}
              onClick={() => {
                onSelectRepo(repo.path)
              }}
            >
              <div className="git-workspace__row-glyph" aria-hidden>
                <RepoStatusGlyphs status={repo} size="sm" />
              </div>
              <div className="git-workspace__row-body">
                <div className="git-workspace__row-title">{repo.name}</div>
                <div className="git-workspace__row-meta">
                  <span>{subtitle}</span>
                  {repo.isGitRepo && repo.lastCommitMessage && (
                    <span style={{ opacity: 0.85 }}>
                      {(repo.lastCommitMessage.length > 48
                        ? `${repo.lastCommitMessage.slice(0, 48)}…`
                        : repo.lastCommitMessage) || ''}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="git-workspace__icon-btn git-workspace__row-open-folder"
                aria-label={`在 Finder 或资源管理器中打开 ${repo.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void window.api.openFolder(repo.path)
                }}
              >
                <HiOutlineFolderOpen size={18} aria-hidden />
              </button>
            </button>
          )
        })}
      </div>
    </div>
  )
}
