import { describe, expect, it } from 'vitest'
import { getPushDisabledReason, isPendingPush, isSynced } from './gitPush'
import type { RepositoryStatus } from './watchConfig'
import { computeGitStats } from '../renderer/src/components/git/repoStats'
import {
  getPrimaryStatusChip,
  getRepoStatusSummary
} from '../renderer/src/components/git/statusText'

const base: RepositoryStatus = {
  path: '/repo',
  name: 'repo',
  isGitRepo: true,
  branch: 'main',
  hasUncommittedChanges: false,
  upstream: { remote: 'origin', branch: 'refs/heads/main', ref: 'refs/remotes/origin/main' },
  aheadCount: 0,
  behindCount: 0,
  isPushed: true
}

describe('push eligibility and consistent repository status', () => {
  it('only counts ahead repositories as pending, including divergence', () => {
    const behind = { ...base, behindCount: 1, isPushed: false }
    const ahead = { ...base, aheadCount: 1, isPushed: false }
    const diverged = { ...ahead, behindCount: 1 }
    expect(computeGitStats([base, behind, ahead, diverged])).toMatchObject({
      pendingPush: 2,
      behind: 2,
      synced: 1
    })
    expect(isPendingPush(behind)).toBe(false)
    expect(getPrimaryStatusChip(behind).label).toBe('落后远程')
    expect(getRepoStatusSummary(behind)).toBe('落后远程 1 个提交')
    expect(getPushDisabledReason(diverged)).toBe('请先同步远程分支')
    expect(getPushDisabledReason({ ...ahead, hasUncommittedChanges: true })).toBeUndefined()
  })

  it('never labels missing or unreadable upstreams as synced', () => {
    const missing = { ...base, upstream: undefined }
    expect(isSynced(missing)).toBe(false)
    expect(getPushDisabledReason(missing)).toBe('请先设置上游分支')
    expect(getPrimaryStatusChip(missing).label).toBe('未设置上游')
    const unreadable = { ...base, remoteStatusError: '读取失败' }
    expect(isSynced(unreadable)).toBe(false)
    expect(getPushDisabledReason(unreadable)).toBe('读取失败')
    expect(getRepoStatusSummary(unreadable)).not.toContain('同步')
  })
})
