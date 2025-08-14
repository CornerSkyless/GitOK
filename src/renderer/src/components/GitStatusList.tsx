import React, { useState, useMemo } from 'react'

export interface GitStatus {
  path: string
  name: string
  isGitRepo: boolean
  hasUncommittedChanges: boolean
  lastCommitMessage?: string
  lastCommitDate?: string
  isPushed: boolean
  branch?: string
  aheadCount: number
  behindCount: number
}

interface GitStatusListProps {
  gitStatuses: GitStatus[]
  isLoading: boolean
}

// 筛选类型
type FilterType = 'all' | 'notGitRepo' | 'hasChanges' | 'pendingPush' | 'behind' | 'synced'

// 排序类型
type SortType = 'name' | 'lastUpdate' | 'status'

// 状态统计组件
const StatusStats: React.FC<{
  gitStatuses: GitStatus[]
  activeFilter: FilterType
  onFilterChange: (filter: FilterType) => void
}> = ({ gitStatuses, activeFilter, onFilterChange }) => {
  const stats = {
    total: gitStatuses.length,
    notGitRepo: gitStatuses.filter((s) => !s.isGitRepo).length,
    hasChanges: gitStatuses.filter((s) => s.isGitRepo && s.hasUncommittedChanges).length,
    pendingPush: gitStatuses.filter((s) => s.isGitRepo && (!s.isPushed || s.aheadCount > 0)).length,
    behind: gitStatuses.filter((s) => s.isGitRepo && s.behindCount > 0).length,
    synced: gitStatuses.filter(
      (s) =>
        s.isGitRepo &&
        !s.hasUncommittedChanges &&
        s.isPushed &&
        s.aheadCount === 0 &&
        s.behindCount === 0
    ).length
  }

  const getFilterClass = (filterType: FilterType): string => {
    return `stat-item ${activeFilter === filterType ? 'active' : ''}`
  }

  return (
    <div className="status-stats">
      <span className={getFilterClass('all')} onClick={() => onFilterChange('all')}>
        <span className="stat-label">总数:</span>
        <span className="stat-value">{stats.total}</span>
      </span>
      <span className={getFilterClass('notGitRepo')} onClick={() => onFilterChange('notGitRepo')}>
        <span className="stat-label">非Git:</span>
        <span className="stat-value">{stats.notGitRepo}</span>
      </span>
      <span className={getFilterClass('hasChanges')} onClick={() => onFilterChange('hasChanges')}>
        <span className="stat-label">有更改:</span>
        <span className="stat-value">{stats.hasChanges}</span>
      </span>
      <span className={getFilterClass('pendingPush')} onClick={() => onFilterChange('pendingPush')}>
        <span className="stat-label">待推送:</span>
        <span className="stat-value">{stats.pendingPush}</span>
      </span>
      <span className={getFilterClass('behind')} onClick={() => onFilterChange('behind')}>
        <span className="stat-label">落后:</span>
        <span className="stat-value">{stats.behind}</span>
      </span>
      <span className={getFilterClass('synced')} onClick={() => onFilterChange('synced')}>
        <span className="stat-label">同步:</span>
        <span className="stat-value">{stats.synced}</span>
      </span>
    </div>
  )
}

// 排序控制器组件
const SortController: React.FC<{
  sortType: SortType
  sortDirection: 'asc' | 'desc'
  onSortChange: (sortType: SortType) => void
}> = ({ sortType, sortDirection, onSortChange }) => {
  const getSortClass = (type: SortType): string => {
    return `sort-item ${sortType === type ? 'active' : ''}`
  }

  const getSortIcon = (type: SortType): string => {
    if (sortType !== type) return '↕️'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  return (
    <div className="sort-controller">
      <span className="sort-label">排序方式:</span>
      <span className={getSortClass('lastUpdate')} onClick={() => onSortChange('lastUpdate')}>
        <span className="sort-text">最新更新</span>
        <span className="sort-icon">{getSortIcon('lastUpdate')}</span>
      </span>
      <span className={getSortClass('name')} onClick={() => onSortChange('name')}>
        <span className="sort-text">项目名称</span>
        <span className="sort-icon">{getSortIcon('name')}</span>
      </span>
      <span className={getSortClass('status')} onClick={() => onSortChange('status')}>
        <span className="sort-text">状态优先级</span>
        <span className="sort-icon">{getSortIcon('status')}</span>
      </span>
    </div>
  )
}

const GitStatusList: React.FC<GitStatusListProps> = ({ gitStatuses, isLoading }) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [sortType, setSortType] = useState<SortType>('lastUpdate')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // 根据筛选条件过滤状态列表
  const filteredStatuses = useMemo(() => {
    let filtered: GitStatus[] = []
    switch (activeFilter) {
      case 'notGitRepo':
        filtered = gitStatuses.filter((s) => !s.isGitRepo)
        break
      case 'hasChanges':
        filtered = gitStatuses.filter((s) => s.isGitRepo && s.hasUncommittedChanges)
        break
      case 'pendingPush':
        filtered = gitStatuses.filter((s) => s.isGitRepo && (!s.isPushed || s.aheadCount > 0))
        break
      case 'behind':
        filtered = gitStatuses.filter((s) => s.isGitRepo && s.behindCount > 0)
        break
      case 'synced':
        filtered = gitStatuses.filter(
          (s) =>
            s.isGitRepo &&
            !s.hasUncommittedChanges &&
            s.isPushed &&
            s.aheadCount === 0 &&
            s.behindCount === 0
        )
        break
      default:
        filtered = gitStatuses
    }

    // 排序逻辑
    return filtered.sort((a, b) => {
      let comparison = 0

      switch (sortType) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'lastUpdate': {
          // 处理日期排序，非Git仓库排在最后
          if (!a.isGitRepo && !b.isGitRepo) return 0
          if (!a.isGitRepo) return 1
          if (!b.isGitRepo) return -1

          const dateA = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0
          const dateB = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0
          comparison = dateA - dateB
          break
        }
        case 'status': {
          // 按状态优先级排序：有更改 > 待推送 > 落后 > 同步 > 非Git
          const getStatusPriority = (status: GitStatus): number => {
            if (!status.isGitRepo) return 0
            if (status.hasUncommittedChanges) return 4
            if (!status.isPushed || status.aheadCount > 0) return 3
            if (status.behindCount > 0) return 2
            return 1
          }
          comparison = getStatusPriority(b) - getStatusPriority(a)
          break
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [gitStatuses, activeFilter, sortType, sortDirection])

  const handleSortChange = (newSortType: SortType): void => {
    if (sortType === newSortType) {
      // 如果点击的是当前排序类型，则切换排序方向
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // 如果是新的排序类型，设置为降序
      setSortType(newSortType)
      setSortDirection('desc')
    }
  }

  if (isLoading) {
    return (
      <div className="git-status-list">
        <div className="loading">正在检查 Git 状态...</div>
      </div>
    )
  }

  if (gitStatuses.length === 0) {
    return (
      <div className="git-status-list">
        <div className="empty-state">请选择一个目录开始监听</div>
      </div>
    )
  }

  const getStatusIcon = (status: GitStatus): string => {
    if (!status.isGitRepo) return '❌'

    // 优先显示最重要的状态图标
    if (status.hasUncommittedChanges && (!status.isPushed || status.aheadCount > 0)) {
      return '⚠️⬆️' // 同时有更改和待推送
    }
    if (status.hasUncommittedChanges) return '⚠️'
    if (!status.isPushed || status.aheadCount > 0) return '⬆️'
    if (status.behindCount > 0) return '⬇️'
    return '✅'
  }

  const getStatusText = (status: GitStatus): string => {
    if (!status.isGitRepo) return '非 Git 仓库'

    const statusParts: string[] = []

    // 检查是否有未提交的更改
    if (status.hasUncommittedChanges) {
      statusParts.push('有未提交的更改')
    }

    // 检查是否需要推送
    if (!status.isPushed || status.aheadCount > 0) {
      if (status.aheadCount > 0) {
        statusParts.push(`领先远程 ${status.aheadCount} 个提交`)
      } else {
        statusParts.push('未推送')
      }
    }

    // 检查是否落后远程
    if (status.behindCount > 0) {
      statusParts.push(`落后远程 ${status.behindCount} 个提交`)
    }

    // 如果没有任何状态，说明是同步的
    if (statusParts.length === 0) {
      return '同步'
    }

    // 返回组合的状态描述
    return statusParts.join('，')
  }

  return (
    <div className="git-status-list">
      <div className="status-header">
        <h3>Git 状态概览</h3>
        <StatusStats
          gitStatuses={gitStatuses}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
        <SortController
          sortType={sortType}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
        />
      </div>

      {/* 筛选信息显示 */}
      {activeFilter !== 'all' && (
        <div className="filter-info">
          <span className="filter-badge">
            当前筛选:{' '}
            {activeFilter === 'notGitRepo'
              ? '非Git仓库'
              : activeFilter === 'hasChanges'
                ? '有未提交更改'
                : activeFilter === 'pendingPush'
                  ? '待推送'
                  : activeFilter === 'behind'
                    ? '落后远程'
                    : activeFilter === 'synced'
                      ? '完全同步'
                      : ''}
          </span>
          <span className="filter-count">显示 {filteredStatuses.length} 个项目</span>
          <button className="clear-filter-btn" onClick={() => setActiveFilter('all')}>
            清除筛选
          </button>
        </div>
      )}

      <div className="status-grid">
        {filteredStatuses.map((status) => (
          <div key={status.path} className="status-card">
            <div className="status-header">
              <span className="project-name">{status.name}</span>
              <span className="status-icon">{getStatusIcon(status)}</span>
            </div>
            <div className="status-details">
              <div className="status-text">{getStatusText(status)}</div>
              {status.isGitRepo && (
                <>
                  {status.branch && <div className="branch-info">分支: {status.branch}</div>}
                  {status.lastCommitMessage && (
                    <div className="commit-info">
                      <div className="commit-message">{status.lastCommitMessage}</div>
                      {status.lastCommitDate && (
                        <div className="commit-date">{status.lastCommitDate}</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default GitStatusList
