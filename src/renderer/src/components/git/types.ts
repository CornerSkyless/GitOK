/** 与主进程 `scanGitRepos` 返回结构对齐 */
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

/** 侧边栏筛选 */
export type GitFilterKey = 'all' | 'notGitRepo' | 'hasChanges' | 'pendingPush' | 'behind' | 'synced'

/** 列表排序字段 */
export type GitSortKey = 'name' | 'lastUpdate' | 'status'
