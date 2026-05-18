import type { GitStatus } from './types'

/** 与各筛选条件对应的条目数量（与历史 `GitStatusList` 口径一致） */
export function computeGitStats(gitStatuses: GitStatus[]): Record<string, number> {
  return {
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
}
