export type { RepositoryStatus as GitStatus } from '../../../../shared/watchConfig'

/** 侧边栏筛选 */
export type GitFilterKey = 'all' | 'notGitRepo' | 'hasChanges' | 'pendingPush' | 'behind' | 'synced'

/** 列表排序字段 */
export type GitSortKey = 'name' | 'lastUpdate' | 'status'
