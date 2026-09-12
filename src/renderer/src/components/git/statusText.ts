import { isPendingPush } from '../../../../shared/gitPush'
import type { GitStatus } from './types'

/** 列表与详情共用的状态说明文案 */
export function getRepoStatusSummary(status: GitStatus): string {
  if (!status.isGitRepo) return '非 Git 仓库'

  const parts: string[] = []
  if (status.hasUncommittedChanges) parts.push('有未提交的更改')
  if (isPendingPush(status)) parts.push(`领先远程 ${status.aheadCount} 个提交`)
  if (status.behindCount > 0) parts.push(`落后远程 ${status.behindCount} 个提交`)
  if (status.remoteStatusError) parts.push(status.remoteStatusError)
  else if (!status.branch) parts.push('当前未处于分支上')
  else if (!status.upstream) parts.push('请先设置上游分支')
  if (parts.length === 0) return '与远程同步'
  return parts.join('，')
}

/** 列表行副标题：分支 + 摘要 */
export function getRepoRowSubtitle(status: GitStatus): string {
  const summary = getRepoStatusSummary(status)
  if (status.isGitRepo && status.branch) {
    return `${status.branch} · ${summary}`
  }
  return summary
}

type Tone = 'muted' | 'success' | 'danger' | 'warning' | 'accent'

function detailChipToneClass(tone: Tone): string {
  switch (tone) {
    case 'success':
      return 'repo-status-chip repo-status-chip--ok'
    case 'warning':
      return 'repo-status-chip repo-status-chip--warn'
    case 'danger':
      return 'repo-status-chip repo-status-chip--error'
    case 'accent':
      return 'repo-status-chip repo-status-chip--accent'
    default:
      return 'repo-status-chip repo-status-chip--muted'
  }
}

/** 详情区主状态标签 */
export function getPrimaryStatusChip(status: GitStatus): { className: string; label: string } {
  if (!status.isGitRepo) {
    return { className: detailChipToneClass('danger'), label: '非 Git 仓库' }
  }
  if (status.hasUncommittedChanges && isPendingPush(status)) {
    return { className: detailChipToneClass('warning'), label: '有本地更改且待同步' }
  }
  if (status.hasUncommittedChanges) {
    return { className: detailChipToneClass('warning'), label: '有未提交更改' }
  }
  if (isPendingPush(status)) {
    return { className: detailChipToneClass('accent'), label: '待推送 / 领先远程' }
  }
  if (status.behindCount > 0) {
    return { className: detailChipToneClass('warning'), label: '落后远程' }
  }
  if (status.remoteStatusError)
    return { className: detailChipToneClass('warning'), label: '上游状态不可用' }
  if (!status.branch) return { className: detailChipToneClass('muted'), label: '未处于分支上' }
  if (!status.upstream) return { className: detailChipToneClass('muted'), label: '未设置上游' }
  return { className: detailChipToneClass('success'), label: '已同步' }
}
