import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import typescriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import { detectMonacoLanguage } from './languageDetection'

globalThis.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') {
      return new jsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker()
    }
    if (label === 'typescript' || label === 'javascript') {
      return new typescriptWorker()
    }
    return new editorWorker()
  }
}

loader.config({ monaco })

let themesConfigured = false

export function configureGitokMonacoThemes(): void {
  if (themesConfigured) return
  themesConfigured = true

  monaco.editor.defineTheme('gitok-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#111827',
      'editorGutter.background': '#ffffff',
      'editorLineNumber.foreground': '#9ca3af',
      'editorLineNumber.activeForeground': '#4b5563',
      'editor.selectionBackground': '#0a6cff3d',
      'editor.inactiveSelectionBackground': '#0a6cff24',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#d1d5db',
      'editor.findMatchBackground': '#fbbf2466',
      'editor.findMatchHighlightBackground': '#fbbf2433',
      'diffEditor.insertedLineBackground': '#f0fdf4',
      'diffEditor.removedLineBackground': '#fff1f2',
      'diffEditor.insertedTextBackground': '#86efac80',
      'diffEditor.removedTextBackground': '#fda4af80',
      'diffEditor.diagonalFill': '#e5e7eb',
      'diffEditor.unchangedRegionBackground': '#f4f6f9',
      'diffEditor.unchangedRegionForeground': '#6b7280'
    }
  })

  monaco.editor.defineTheme('gitok-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#171c24',
      'editor.foreground': '#f3f4f6',
      'editorGutter.background': '#171c24',
      'editorLineNumber.foreground': '#8994a3',
      'editorLineNumber.activeForeground': '#b7c0cc',
      'editor.selectionBackground': '#58a6ff52',
      'editor.inactiveSelectionBackground': '#58a6ff2e',
      'editorWidget.background': '#20262f',
      'editorWidget.border': '#3d4755',
      'editor.findMatchBackground': '#fbbf2466',
      'editor.findMatchHighlightBackground': '#fbbf2433',
      'diffEditor.insertedLineBackground': '#16a34a1f',
      'diffEditor.removedLineBackground': '#e11d481f',
      'diffEditor.insertedTextBackground': '#22c55e59',
      'diffEditor.removedTextBackground': '#f43f5e59',
      'diffEditor.diagonalFill': '#2b333e',
      'diffEditor.unchangedRegionBackground': '#20262f',
      'diffEditor.unchangedRegionForeground': '#8994a3'
    }
  })
}

export function getMonacoLanguage(filePath: string): string {
  return detectMonacoLanguage(filePath, monaco.languages.getLanguages())
}
