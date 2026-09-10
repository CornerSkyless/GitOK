import React, { useEffect, useState } from 'react'
import { removeWatchRoot, type WatchConfig, type WatchDirectory } from '../../../shared/watchConfig'

interface DirectoryNodeProps {
  node: WatchDirectory
  rootPath: string
  ancestors: string[]
  config: WatchConfig
  onToggle: (path: string, root: string) => void
  onDiscover: (path: string, root: string) => void
}

function DirectoryNode({
  node,
  rootPath,
  ancestors,
  config,
  onToggle,
  onDiscover
}: DirectoryNodeProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(ancestors.length === 0)
  const [directory, setDirectory] = useState(node)
  const [children, setChildren] = useState<WatchDirectory[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const cycle = ancestors.includes(directory.path)
  const selected = config.repoPaths.includes(directory.path)

  useEffect(() => {
    setDirectory({
      path: node.path,
      name: node.name,
      isRepository: node.isRepository,
      error: node.error
    })
  }, [node.path, node.name, node.isRepository, node.error])

  useEffect(() => {
    if (selected && !config.repoSources[directory.path]?.includes(rootPath)) {
      onDiscover(directory.path, rootPath)
    }
  }, [selected, config.repoSources, directory.path, rootPath, onDiscover])

  useEffect(() => {
    if (!expanded || cycle) return
    let active = true
    setLoading(true)
    setError('')
    void window.api
      .listWatchDirectories(node.path)
      .then((result) => {
        if (!active) return
        setDirectory(result.directory)
        setChildren(result.children)
      })
      .catch((reason) => {
        if (active) setError(String(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [expanded, cycle, node.path, revision])

  return (
    <li className="watch-tree-node">
      <div className="watch-tree-row">
        <button
          type="button"
          className="watch-tree-expand"
          disabled={cycle}
          aria-label={`${expanded ? '折叠' : '展开'} ${directory.name}`}
          aria-expanded={expanded && !cycle}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded && !cycle ? '▾' : '▸'}
        </button>
        {directory.isRepository && !directory.error ? (
          <input
            type="checkbox"
            checked={selected}
            aria-label={`监听 ${directory.path}`}
            onChange={() => onToggle(directory.path, rootPath)}
          />
        ) : (
          <span className="watch-tree-folder" aria-hidden>
            ▱
          </span>
        )}
        <span className="watch-tree-name" title={directory.path}>
          {node.name}
        </span>
        {directory.isRepository && <span className="watch-git-badge">Git</span>}
        {cycle && <span className="watch-tree-note">循环链接</span>}
        {!cycle && (
          <button
            type="button"
            className="watch-text-button"
            aria-label={`刷新 ${directory.path}`}
            disabled={loading}
            onClick={() => {
              setExpanded(true)
              setRevision((value) => value + 1)
            }}
          >
            刷新
          </button>
        )}
      </div>
      {(directory.error || error) && (
        <p role="alert" className="watch-inline-error">
          {error || directory.error}
        </p>
      )}
      {expanded && !cycle && (
        <div className="watch-tree-children">
          {loading && (
            <p className="watch-tree-note" role="status">
              加载中…
            </p>
          )}
          {error && (
            <button
              type="button"
              className="watch-text-button"
              onClick={() => setRevision((value) => value + 1)}
            >
              重试
            </button>
          )}
          {!loading && !error && children?.length === 0 && (
            <p className="watch-tree-note">没有子文件夹</p>
          )}
          {children && (
            <ul key={revision}>
              {children.map((child) => (
                <DirectoryNode
                  key={`${child.name}:${child.path}`}
                  node={child}
                  rootPath={rootPath}
                  ancestors={[...ancestors, directory.path]}
                  config={config}
                  onToggle={onToggle}
                  onDiscover={onDiscover}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

interface WatchConfigEditorProps {
  config: WatchConfig
  onApply: (config: WatchConfig) => void
  onCancel: () => void
}

export function WatchConfigEditor({
  config,
  onApply,
  onCancel
}: WatchConfigEditorProps): React.JSX.Element {
  const [draft, setDraft] = useState(config)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(config)

  const selectDirectory = async (manual: boolean): Promise<void> => {
    setPicking(true)
    setError('')
    try {
      const result = await window.api.selectDirectory()
      if (result.canceled || !result.filePaths[0]) return
      const directory = await window.api.inspectWatchDirectory(result.filePaths[0])
      setDraft((current) =>
        manual
          ? { ...current, roots: [...new Set([...current.roots, directory.path])] }
          : { ...current, parentPath: directory.path }
      )
    } catch (reason) {
      setError(String(reason))
    } finally {
      setPicking(false)
    }
  }

  const removeRepository = (path: string): void => {
    setDraft((current) => ({
      ...current,
      repoPaths: current.repoPaths.filter((item) => item !== path),
      repoSources: Object.fromEntries(
        Object.entries(current.repoSources).filter(([item]) => item !== path)
      )
    }))
  }

  const toggleRepository = (path: string, root: string): void => {
    if (draft.repoPaths.includes(path)) removeRepository(path)
    else
      setDraft((current) => ({
        ...current,
        repoPaths: [...new Set([...current.repoPaths, path])],
        repoSources: { ...current.repoSources, [path]: [root] }
      }))
  }

  const discoverRepository = React.useCallback((path: string, root: string): void => {
    setDraft((current) => {
      if (!current.repoPaths.includes(path) || current.repoSources[path]?.includes(root))
        return current
      return {
        ...current,
        repoSources: {
          ...current.repoSources,
          [path]: [...(current.repoSources[path] ?? []), root]
        }
      }
    })
  }, [])

  return (
    <section className="settings-section watch-config-editor">
      <h3>监听项目</h3>
      <div className="watch-mode-switch" role="group" aria-label="监听方式">
        <button
          type="button"
          aria-pressed={draft.mode === 'parent'}
          onClick={() => setDraft({ ...draft, mode: 'parent' })}
        >
          父目录扫描
        </button>
        <button
          type="button"
          aria-pressed={draft.mode === 'manual'}
          onClick={() => setDraft({ ...draft, mode: 'manual' })}
        >
          手动选择
        </button>
      </div>
      {draft.mode === 'parent' ? (
        <>
          <p className="settings-section-desc">扫描所选父目录下一级子文件夹的 Git 状态。</p>
          <div className="settings-directory-controls">
            <input
              className="settings-directory-input"
              aria-label="监听父目录"
              readOnly
              value={draft.parentPath}
              placeholder="请选择父目录"
            />
            <button
              type="button"
              className="settings-select-btn"
              disabled={picking}
              onClick={() => void selectDirectory(false)}
            >
              选择目录
            </button>
            {draft.parentPath && (
              <button
                type="button"
                className="watch-text-button"
                onClick={() => setDraft({ ...draft, parentPath: '' })}
              >
                清空
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="settings-section-desc">
            添加多个根目录，逐层展开并勾选 Git 仓库。勾选只包含仓库本身。
          </p>
          <button
            type="button"
            className="settings-select-btn"
            disabled={picking}
            onClick={() => void selectDirectory(true)}
          >
            添加根目录
          </button>
          <div className="watch-tree" aria-label="项目目录树">
            {draft.roots.length === 0 && (
              <p className="watch-tree-note">添加一个文件夹，开始选择项目。</p>
            )}
            {draft.roots.map((root) => (
              <div className="watch-tree-root" key={root}>
                <div className="watch-root-heading">
                  <span title={root}>{root}</span>
                  <button
                    type="button"
                    className="watch-text-button"
                    aria-label={`移除根目录 ${root}`}
                    onClick={() => setDraft((current) => removeWatchRoot(current, root))}
                  >
                    移除根目录
                  </button>
                </div>
                <ul>
                  <DirectoryNode
                    node={{
                      path: root,
                      name: root.split(/[/\\]/).filter(Boolean).pop() || root,
                      isRepository: false
                    }}
                    ancestors={[]}
                    rootPath={root}
                    config={draft}
                    onToggle={toggleRepository}
                    onDiscover={discoverRepository}
                  />
                </ul>
              </div>
            ))}
          </div>
          <div className="watch-selected">
            <h4>已选项目 · {draft.repoPaths.length}</h4>
            {draft.repoPaths.length === 0 && (
              <p className="watch-tree-note">尚未勾选项目，应用后将暂停扫描。</p>
            )}
            <ul>
              {draft.repoPaths.map((path) => (
                <li key={path}>
                  <span title={path}>{path}</span>
                  <button
                    type="button"
                    className="watch-text-button"
                    aria-label={`移除项目 ${path}`}
                    onClick={() => removeRepository(path)}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="watch-inline-error">
          {error}
        </p>
      )}
      <div className="watch-config-actions">
        <span className="watch-tree-note" role="status">
          {dirty ? '有未应用的修改' : '配置已保存'}
        </span>
        <button type="button" className="watch-text-button" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="settings-btn-primary"
          disabled={picking || !dirty}
          onClick={() => {
            try {
              onApply(draft)
              setError('')
            } catch (reason) {
              setError(String(reason))
            }
          }}
        >
          应用
        </button>
      </div>
    </section>
  )
}
