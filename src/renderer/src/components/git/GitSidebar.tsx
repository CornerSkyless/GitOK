import React from 'react'
import type { GitFilterKey } from './types'
import { computeGitStats } from './repoStats'
import type { GitStatus } from './types'

const NAV_ITEMS: { key: GitFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'notGitRepo', label: '非 Git' },
  { key: 'hasChanges', label: '有更改' },
  { key: 'pendingPush', label: '待推送' },
  { key: 'behind', label: '落后远程' },
  { key: 'synced', label: '已同步' }
]

function countForFilter(stats: ReturnType<typeof computeGitStats>, key: GitFilterKey): number {
  switch (key) {
    case 'all':
      return stats.total
    case 'notGitRepo':
      return stats.notGitRepo
    case 'hasChanges':
      return stats.hasChanges
    case 'pendingPush':
      return stats.pendingPush
    case 'behind':
      return stats.behind
    case 'synced':
      return stats.synced
    default:
      return 0
  }
}

interface GitSidebarProps {
  gitStatuses: GitStatus[]
  activeFilter: GitFilterKey
  onFilterChange: (filter: GitFilterKey) => void
}

/** 左侧：品牌区 + 筛选导航 */
export function GitSidebar({
  gitStatuses,
  activeFilter,
  onFilterChange
}: GitSidebarProps): React.JSX.Element {
  const stats = computeGitStats(gitStatuses)

  return (
    <aside className="git-workspace__sidebar" aria-label="筛选">
      <div className="git-workspace__sidebar-head">
        <div className="git-workspace__brand-title">GitOK</div>
        <div className="git-workspace__brand-sub">一级子目录的 Git 状态总览。</div>
      </div>
      <div className="git-workspace__sidebar-scroll">
        <div className="git-workspace__nav-label">视图</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`git-workspace__nav-item${activeFilter === item.key ? ' git-workspace__nav-item--active' : ''}`}
            onClick={() => {
              onFilterChange(item.key)
            }}
          >
            <span className="git-workspace__nav-item-text">{item.label}</span>
            <span className="git-workspace__nav-item-count">{countForFilter(stats, item.key)}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
