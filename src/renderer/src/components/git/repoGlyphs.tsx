import React from 'react'
import {
  HiXCircle,
  HiExclamationTriangle,
  HiArrowUpCircle,
  HiArrowDown,
  HiCheckCircle,
  HiArrowsUpDown,
  HiArrowUp
} from 'react-icons/hi2'
import type { GitStatus } from './types'

type Tone = 'muted' | 'success' | 'danger' | 'warning' | 'accent'

const glyphSizes = { sm: 18, lg: 22 } as const

function wrapTone(node: React.ReactNode, tone: Tone): React.ReactNode {
  return <span className={`repo-status-tone--${tone}`}>{node}</span>
}

interface RepoStatusGlyphsProps {
  status: GitStatus
  size?: keyof typeof glyphSizes
}

/** 语义化状态图标组合（列表缩略图与详情头大图） */
export function RepoStatusGlyphs({
  status,
  size = 'sm'
}: RepoStatusGlyphsProps): React.JSX.Element {
  const px = glyphSizes[size]

  if (!status.isGitRepo) {
    return <>{wrapTone(<HiXCircle size={px} aria-hidden />, 'danger')}</>
  }

  if (status.hasUncommittedChanges && (!status.isPushed || status.aheadCount > 0)) {
    return (
      <>
        {wrapTone(<HiExclamationTriangle size={px} aria-hidden />, 'warning')}
        {wrapTone(<HiArrowUpCircle size={px} aria-hidden />, 'accent')}
      </>
    )
  }
  if (status.hasUncommittedChanges) {
    return <>{wrapTone(<HiExclamationTriangle size={px} aria-hidden />, 'warning')}</>
  }
  if (!status.isPushed || status.aheadCount > 0) {
    return <>{wrapTone(<HiArrowUpCircle size={px} aria-hidden />, 'accent')}</>
  }
  if (status.behindCount > 0)
    return <>{wrapTone(<HiArrowDown size={px} aria-hidden />, 'warning')}</>
  return <>{wrapTone(<HiCheckCircle size={px} aria-hidden />, 'success')}</>
}

interface SortDirectionGlyphProps {
  isActive: boolean
  direction: 'asc' | 'desc'
}

export function SortDirectionGlyph({
  isActive,
  direction
}: SortDirectionGlyphProps): React.JSX.Element {
  const px = 14
  if (!isActive) return <>{wrapTone(<HiArrowsUpDown size={px} aria-hidden />, 'muted')}</>
  return (
    <>
      {wrapTone(
        direction === 'asc' ? (
          <HiArrowUp size={px} aria-hidden />
        ) : (
          <HiArrowDown size={px} aria-hidden />
        ),
        'accent'
      )}
    </>
  )
}
