import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Diff,
  Hunk,
  markEdits,
  parseDiff,
  tokenize,
  type FileData,
  type ViewType
} from 'react-diff-view'
import {
  HiOutlineArrowPath,
  HiOutlineArrowsRightLeft,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle
} from 'react-icons/hi2'
import type {
  GitChangedFile,
  GitChangeScope,
  GitFileChangeStatus,
  GitFileDiffResult
} from '../../../../shared/gitChanges'
import type { GitStatus } from './types'
import 'react-diff-view/style/index.css'

interface RepoChangesPaneProps {
  repo: GitStatus
  onChangeCount: (count: number) => void
}

const SCOPE_META: Record<GitChangeScope, { title: string; empty: string; tone: string }> = {
  staged: {
    title: '已暂存',
    empty: '没有已暂存文件',
    tone: 'success'
  },
  unstaged: {
    title: '未暂存',
    empty: '没有未暂存文件',
    tone: 'warning'
  },
  untracked: {
    title: '未跟踪',
    empty: '没有未跟踪文件',
    tone: 'accent'
  }
}

const STATUS_LABELS: Record<GitFileChangeStatus, string> = {
  added: '新增',
  modified: '修改',
  deleted: '删除',
  renamed: '重命名',
  copied: '复制',
  'type-changed': '类型变化',
  conflicted: '冲突',
  unknown: '变化'
}

const SCOPES: GitChangeScope[] = ['staged', 'unstaged', 'untracked']

function getChangeKey(change: GitChangedFile): string {
  return `${change.scope}:${change.path}`
}

function DiffFileView({
  file,
  viewType
}: {
  file: FileData
  viewType: ViewType
}): React.JSX.Element {
  const tokens = useMemo(
    () =>
      tokenize(file.hunks, {
        enhancers: [markEdits(file.hunks, { type: 'line' })]
      }),
    [file.hunks]
  )

  return (
    <Diff
      diffType={file.type}
      hunks={file.hunks}
      viewType={viewType}
      tokens={tokens}
      optimizeSelection
    >
      {(hunks) =>
        hunks.map((hunk) => <Hunk key={`${hunk.content}:${hunk.oldStart}`} hunk={hunk} />)
      }
    </Diff>
  )
}

export function RepoChangesPane({ repo, onChangeCount }: RepoChangesPaneProps): React.JSX.Element {
  const [changes, setChanges] = useState<GitChangedFile[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [diffResult, setDiffResult] = useState<GitFileDiffResult | null>(null)
  const [isLoadingChanges, setIsLoadingChanges] = useState(false)
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)
  const [changesError, setChangesError] = useState<string | null>(null)
  const [diffRequestVersion, setDiffRequestVersion] = useState(0)
  const [viewType, setViewType] = useState<ViewType>('split')
  const changesRequestRef = useRef(0)
  const diffRequestRef = useRef(0)

  const loadChanges = useCallback(async (): Promise<void> => {
    const requestId = changesRequestRef.current + 1
    changesRequestRef.current = requestId
    setIsLoadingChanges(true)
    setChangesError(null)

    try {
      const nextChanges = await window.api.getGitWorkingTreeChanges(repo.path)
      if (requestId !== changesRequestRef.current) return

      setChanges(nextChanges)
      onChangeCount(new Set(nextChanges.map((change) => change.path)).size)
      setSelectedKey((previous) => {
        if (previous && nextChanges.some((change) => getChangeKey(change) === previous)) {
          return previous
        }
        return nextChanges[0] ? getChangeKey(nextChanges[0]) : null
      })
    } catch (error) {
      if (requestId !== changesRequestRef.current) return
      setChanges([])
      onChangeCount(0)
      setSelectedKey(null)
      setChangesError(error instanceof Error ? error.message : '无法读取未提交变更')
    } finally {
      if (requestId === changesRequestRef.current) {
        setIsLoadingChanges(false)
      }
    }
  }, [onChangeCount, repo.path])

  useEffect(() => {
    void loadChanges()
    return () => {
      changesRequestRef.current += 1
    }
  }, [loadChanges, repo])

  const selectedChange = useMemo(
    () => changes.find((change) => getChangeKey(change) === selectedKey) ?? null,
    [changes, selectedKey]
  )

  useEffect(() => {
    if (!selectedChange) {
      setDiffResult(null)
      setIsLoadingDiff(false)
      return
    }

    const requestId = diffRequestRef.current + 1
    diffRequestRef.current = requestId
    setDiffResult(null)
    setIsLoadingDiff(true)

    void window.api
      .getGitFileDiff(repo.path, selectedChange.path, selectedChange.scope)
      .then((result) => {
        if (requestId === diffRequestRef.current) {
          setDiffResult(result)
        }
      })
      .catch((error) => {
        if (requestId !== diffRequestRef.current) return
        setDiffResult({
          path: selectedChange.path,
          scope: selectedChange.scope,
          patch: '',
          isBinary: false,
          tooLarge: false,
          error: error instanceof Error ? error.message : '无法读取文件差异'
        })
      })
      .finally(() => {
        if (requestId === diffRequestRef.current) {
          setIsLoadingDiff(false)
        }
      })

    return () => {
      diffRequestRef.current += 1
    }
  }, [diffRequestVersion, repo, repo.path, selectedChange])

  const groupedChanges = useMemo(
    () =>
      SCOPES.reduce<Record<GitChangeScope, GitChangedFile[]>>(
        (groups, scope) => {
          groups[scope] = changes.filter((change) => change.scope === scope)
          return groups
        },
        { staged: [], unstaged: [], untracked: [] }
      ),
    [changes]
  )

  const parsedDiff = useMemo(() => {
    if (!diffResult?.patch || diffResult.isBinary || diffResult.tooLarge || diffResult.error) {
      return { files: [] as FileData[], error: null as string | null }
    }

    try {
      return {
        files: parseDiff(diffResult.patch, { nearbySequences: 'zip' }),
        error: null
      }
    } catch {
      return {
        files: [] as FileData[],
        error: 'Git 已返回差异，但当前渲染器无法解析该格式'
      }
    }
  }, [diffResult])

  const renderDiffState = (): React.ReactNode => {
    if (isLoadingDiff) {
      return (
        <div className="git-workspace__changes-message">
          <span className="git-workspace__spinner" aria-hidden />
          正在读取文件差异…
        </div>
      )
    }

    if (!selectedChange) {
      return (
        <div className="git-workspace__changes-message">
          <HiOutlineDocumentText size={28} aria-hidden />
          选择一个文件查看差异
        </div>
      )
    }

    if (!diffResult) return null

    if (diffResult.tooLarge) {
      return (
        <div className="git-workspace__changes-message">
          <HiOutlineExclamationTriangle size={28} aria-hidden />
          <strong>该文件差异超过 2 MiB</strong>
          <span>为避免界面卡顿，GitOK 没有加载逐行内容。</span>
        </div>
      )
    }

    if (diffResult.error || parsedDiff.error) {
      return (
        <div className="git-workspace__changes-message">
          <HiOutlineExclamationTriangle size={28} aria-hidden />
          <strong>无法显示差异</strong>
          <span>{diffResult.error || parsedDiff.error}</span>
          <button
            type="button"
            className="git-workspace__changes-retry"
            onClick={() => setDiffRequestVersion((version) => version + 1)}
          >
            重试
          </button>
        </div>
      )
    }

    if (diffResult.isBinary) {
      return (
        <div className="git-workspace__changes-message">
          <HiOutlineDocumentText size={28} aria-hidden />
          <strong>二进制文件已变更</strong>
          <span>二进制内容无法按行展示。</span>
        </div>
      )
    }

    if (
      parsedDiff.files.length === 0 ||
      parsedDiff.files.every((file) => file.hunks.length === 0)
    ) {
      return (
        <div className="git-workspace__changes-message">
          <HiOutlineDocumentText size={28} aria-hidden />
          <strong>没有可展示的逐行差异</strong>
          <span>这通常表示空文件、纯重命名或仅文件权限发生变化。</span>
        </div>
      )
    }

    return parsedDiff.files.map((file, index) => (
      <DiffFileView
        key={`${file.oldPath}:${file.newPath}:${index}`}
        file={file}
        viewType={viewType}
      />
    ))
  }

  if (isLoadingChanges && changes.length === 0) {
    return (
      <div className="git-workspace__changes-message git-workspace__changes-message--page">
        <span className="git-workspace__spinner" aria-hidden />
        正在读取未提交变更…
      </div>
    )
  }

  if (changesError) {
    return (
      <div className="git-workspace__changes-message git-workspace__changes-message--page">
        <HiOutlineExclamationTriangle size={28} aria-hidden />
        <strong>无法读取未提交变更</strong>
        <span>{changesError}</span>
        <button type="button" className="git-workspace__changes-retry" onClick={loadChanges}>
          重试
        </button>
      </div>
    )
  }

  if (changes.length === 0) {
    return (
      <div className="git-workspace__changes-message git-workspace__changes-message--page">
        <HiOutlineDocumentText size={30} aria-hidden />
        <strong>工作区很干净</strong>
        <span>当前仓库没有已暂存、未暂存或未跟踪的文件。</span>
      </div>
    )
  }

  return (
    <div className="git-workspace__changes">
      <div className="git-workspace__changes-groups" aria-label="未提交文件">
        {SCOPES.map((scope) => {
          const meta = SCOPE_META[scope]
          const items = groupedChanges[scope]
          return (
            <section className="git-workspace__change-group" key={scope}>
              <div className="git-workspace__change-group-head">
                <span>{meta.title}</span>
                <span>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="git-workspace__change-group-empty">{meta.empty}</div>
              ) : (
                <div className="git-workspace__change-file-list">
                  {items.map((change) => {
                    const key = getChangeKey(change)
                    return (
                      <button
                        type="button"
                        key={key}
                        className={`git-workspace__change-file${
                          selectedKey === key ? ' git-workspace__change-file--selected' : ''
                        }`}
                        onClick={() => setSelectedKey(key)}
                      >
                        <span
                          className={`git-workspace__change-status git-workspace__change-status--${meta.tone}`}
                        >
                          {STATUS_LABELS[change.status]}
                        </span>
                        <span className="git-workspace__change-file-path" title={change.path}>
                          {change.path}
                        </span>
                        {change.previousPath && (
                          <span
                            className="git-workspace__change-file-previous"
                            title={change.previousPath}
                          >
                            ← {change.previousPath}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="git-workspace__diff-toolbar">
        <div className="git-workspace__diff-selected">
          {selectedChange && (
            <>
              <span className="git-workspace__diff-selected-scope">
                {SCOPE_META[selectedChange.scope].title}
              </span>
              <span title={selectedChange.path}>{selectedChange.path}</span>
            </>
          )}
        </div>
        <div className="git-workspace__diff-actions">
          <button
            type="button"
            className="git-workspace__diff-refresh"
            disabled={isLoadingChanges || isLoadingDiff}
            onClick={loadChanges}
            aria-label="刷新未提交变更"
          >
            <HiOutlineArrowPath size={16} aria-hidden />
            刷新
          </button>
          <div className="git-workspace__diff-view-toggle" aria-label="差异布局">
            <button
              type="button"
              className={viewType === 'split' ? 'is-active' : ''}
              onClick={() => setViewType('split')}
            >
              <HiOutlineArrowsRightLeft size={15} aria-hidden />
              分栏
            </button>
            <button
              type="button"
              className={viewType === 'unified' ? 'is-active' : ''}
              onClick={() => setViewType('unified')}
            >
              统一
            </button>
          </div>
        </div>
      </div>

      <div className="git-workspace__diff-shell">{renderDiffState()}</div>
    </div>
  )
}
