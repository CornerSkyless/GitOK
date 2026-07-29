import { DiffEditor, type BeforeMount } from '@monaco-editor/react'
import { useEffect, useMemo, useState } from 'react'
import type { editor } from 'monaco-editor'
import type { GitChangeScope } from '../../../../shared/gitChanges'
import { configureGitokMonacoThemes, getMonacoLanguage } from './monacoSetup'

interface MonacoDiffEditorProps {
  repoPath: string
  filePath: string
  previousPath?: string
  scope: GitChangeScope
  originalContent: string
  modifiedContent: string
  viewType: 'split' | 'unified'
}

function useDarkAppearance(): boolean {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent): void => setIsDark(event.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  return isDark
}

function createModelPath(
  repoPath: string,
  scope: GitChangeScope,
  side: 'original' | 'modified',
  filePath: string
): string {
  const encodedRepo = encodeURIComponent(repoPath)
  const encodedFile = filePath
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `gitok://diff/${encodedRepo}/${scope}/${side}/${encodedFile}`
}

export default function MonacoDiffEditor({
  repoPath,
  filePath,
  previousPath,
  scope,
  originalContent,
  modifiedContent,
  viewType
}: MonacoDiffEditorProps): React.JSX.Element {
  const isDark = useDarkAppearance()
  const originalPath = previousPath ?? filePath
  const originalLanguage = useMemo(() => getMonacoLanguage(originalPath), [originalPath])
  const modifiedLanguage = useMemo(() => getMonacoLanguage(filePath), [filePath])
  const originalModelPath = useMemo(
    () => createModelPath(repoPath, scope, 'original', originalPath),
    [originalPath, repoPath, scope]
  )
  const modifiedModelPath = useMemo(
    () => createModelPath(repoPath, scope, 'modified', filePath),
    [filePath, repoPath, scope]
  )
  const options = useMemo<editor.IDiffEditorConstructionOptions>(
    () => ({
      accessibilityVerbose: true,
      automaticLayout: true,
      compactMode: true,
      diffAlgorithm: 'advanced',
      diffWordWrap: 'off',
      enableSplitViewResizing: true,
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      fontSize: 12,
      hideUnchangedRegions: {
        enabled: true,
        contextLineCount: 3,
        minimumLineCount: 6,
        revealLineCount: 20
      },
      ignoreTrimWhitespace: false,
      lineNumbersMinChars: 3,
      links: false,
      minimap: { enabled: false },
      originalEditable: false,
      padding: { top: 8, bottom: 8 },
      readOnly: true,
      renderGutterMenu: false,
      renderMarginRevertIcon: false,
      renderOverviewRuler: true,
      renderSideBySide: viewType === 'split',
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      useInlineViewWhenSpaceIsLimited: true,
      renderSideBySideInlineBreakpoint: 720,
      wordWrap: 'off'
    }),
    [viewType]
  )

  const handleBeforeMount: BeforeMount = () => {
    configureGitokMonacoThemes()
  }

  return (
    <DiffEditor
      className="git-workspace__monaco-diff"
      height="clamp(320px, 58vh, 640px)"
      original={originalContent}
      modified={modifiedContent}
      originalLanguage={originalLanguage}
      modifiedLanguage={modifiedLanguage}
      originalModelPath={originalModelPath}
      modifiedModelPath={modifiedModelPath}
      keepCurrentOriginalModel={false}
      keepCurrentModifiedModel={false}
      theme={isDark ? 'gitok-dark' : 'gitok-light'}
      options={options}
      beforeMount={handleBeforeMount}
      loading={
        <div className="git-workspace__changes-message">
          <span className="git-workspace__spinner" aria-hidden />
          正在初始化代码差异编辑器…
        </div>
      }
    />
  )
}
