import React from 'react'
import { HiOutlineFolderOpen } from 'react-icons/hi2'
import type { GitStatus } from './types'
import { RepoStatusGlyphs } from './repoGlyphs'
import { getPrimaryStatusChip, getRepoStatusSummary } from './statusText'

function DetailField({
  label,
  children,
  mono
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="git-workspace__field">
      <div className="git-workspace__field-label">{label}</div>
      <div
        className={
          mono
            ? 'git-workspace__field-value git-workspace__field-value--mono'
            : 'git-workspace__field-value'
        }
      >
        {children}
      </div>
    </div>
  )
}

interface RepoDetailPaneProps {
  repo: GitStatus | null
}

/** 右侧：当前仓库详情（字段块 + 最近提交） */
export function RepoDetailPane({ repo }: RepoDetailPaneProps): React.JSX.Element {
  if (!repo) {
    return (
      <div className="git-workspace__detail-pane">
        <div className="git-workspace__detail-empty">
          <span>在左侧列表中选择项目以查看详情</span>
        </div>
      </div>
    )
  }

  const chip = getPrimaryStatusChip(repo)
  const summary = getRepoStatusSummary(repo)

  return (
    <div className="git-workspace__detail-pane">
      <div className="git-workspace__detail-inner">
        <div className="git-workspace__detail-head">
          <div className="git-workspace__detail-glyph-xl" aria-hidden>
            <RepoStatusGlyphs status={repo} size="lg" />
          </div>
          <div className="git-workspace__detail-title-wrap">
            <h2 className="git-workspace__detail-title">{repo.name}</h2>
            <div className="git-workspace__detail-path-row">
              <span className="git-workspace__detail-path" title={repo.path}>
                {repo.path}
              </span>
              <button
                type="button"
                className="git-workspace__icon-btn"
                aria-label="打开项目目录"
                onClick={() => {
                  void window.api.openFolder(repo.path)
                }}
              >
                <HiOutlineFolderOpen size={18} />
              </button>
            </div>
          </div>
        </div>

        <section className="git-workspace__detail-fields">
          <DetailField label="概要状态">
            <div className="git-workspace__status-pill-wrap">
              <span className={chip.className}>{chip.label}</span>
            </div>
          </DetailField>

          <DetailField label="详细说明">{summary}</DetailField>

          {repo.isGitRepo && repo.branch !== undefined && (
            <DetailField label="分支" mono>
              {repo.branch || '(无分支名 — 可能处于 detached)'}
            </DetailField>
          )}

          {repo.isGitRepo && (repo.aheadCount > 0 || repo.behindCount > 0) && (
            <DetailField label="与 upstream 的差距">
              <>
                <span>
                  {repo.aheadCount > 0 ? `本地领先 ${repo.aheadCount} 个提交` : '无本地领先提交'}；
                  {repo.behindCount > 0
                    ? ` 落后远程 ${repo.behindCount} 个提交`
                    : ' 无落后远程提交'}
                </span>
                <span className="git-workspace__doc-hint">
                  提示：在未执行 `git fetch` 的前提下，以上为基于本地远程引用计算的结果。
                </span>
              </>
            </DetailField>
          )}

          {repo.isGitRepo && repo.lastCommitMessage && (
            <DetailField label="最近提交">
              <div className="git-workspace__commit-box">
                <div className="git-workspace__commit-msg">{repo.lastCommitMessage}</div>
                {repo.lastCommitDate && (
                  <div className="git-workspace__commit-date">{repo.lastCommitDate}</div>
                )}
              </div>
            </DetailField>
          )}
        </section>
      </div>
    </div>
  )
}
