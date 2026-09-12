import type { RepositoryStatus } from './watchConfig'

export const REMOTE_STATUS_NOT_CHECKED = '远程状态尚未检查，请刷新状态'

export interface GitUpstream {
  remote: string
  /** Full destination ref, e.g. refs/heads/main. */
  branch: string
  /** Local tracking ref, e.g. refs/remotes/origin/main. */
  ref: string
}

export interface GitPushRequest {
  repoPath: string
  expectedBranch: string
  expectedUpstream: GitUpstream
}

export type GitPushResult = { success: true } | { success: false; error: string }

export function sameUpstream(a?: GitUpstream, b?: GitUpstream): boolean {
  return a?.remote === b?.remote && a?.branch === b?.branch && a?.ref === b?.ref
}

export function isPendingPush(repo: RepositoryStatus): boolean {
  return repo.isGitRepo && repo.aheadCount > 0
}

export function isSynced(repo: RepositoryStatus): boolean {
  return (
    repo.isGitRepo &&
    Boolean(repo.upstream) &&
    !repo.remoteStatusError &&
    !repo.hasUncommittedChanges &&
    repo.isPushed &&
    repo.aheadCount === 0 &&
    repo.behindCount === 0
  )
}

export function getPushDisabledReason(repo: RepositoryStatus): string | undefined {
  if (!repo.isGitRepo) return '非 Git 仓库'
  if (!repo.branch) return '当前未处于分支上，请先切换到分支'
  if (repo.remoteStatusError) return repo.remoteStatusError
  if (!repo.upstream) return '请先设置上游分支'
  if (repo.upstream.remote === '.') return '上游为本地分支，请先设置远程上游分支'
  if (repo.behindCount > 0) return '请先同步远程分支'
  if (repo.aheadCount === 0) return '没有待推送的提交'
  return undefined
}
