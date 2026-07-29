import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution.js'
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-editor/features/find/register.js'
import 'monaco-editor/languages/definitions/bat/register.js'
import 'monaco-editor/languages/definitions/cpp/register.js'
import 'monaco-editor/languages/definitions/csharp/register.js'
import 'monaco-editor/languages/definitions/css/register.js'
import 'monaco-editor/languages/definitions/dockerfile/register.js'
import 'monaco-editor/languages/definitions/go/register.js'
import 'monaco-editor/languages/definitions/graphql/register.js'
import 'monaco-editor/languages/definitions/handlebars/register.js'
import 'monaco-editor/languages/definitions/hcl/register.js'
import 'monaco-editor/languages/definitions/html/register.js'
import 'monaco-editor/languages/definitions/ini/register.js'
import 'monaco-editor/languages/definitions/java/register.js'
import 'monaco-editor/languages/definitions/javascript/register.js'
import 'monaco-editor/languages/definitions/kotlin/register.js'
import 'monaco-editor/languages/definitions/less/register.js'
import 'monaco-editor/languages/definitions/lua/register.js'
import 'monaco-editor/languages/definitions/markdown/register.js'
import 'monaco-editor/languages/definitions/mdx/register.js'
import 'monaco-editor/languages/definitions/objective-c/register.js'
import 'monaco-editor/languages/definitions/php/register.js'
import 'monaco-editor/languages/definitions/powershell/register.js'
import 'monaco-editor/languages/definitions/protobuf/register.js'
import 'monaco-editor/languages/definitions/python/register.js'
import 'monaco-editor/languages/definitions/razor/register.js'
import 'monaco-editor/languages/definitions/ruby/register.js'
import 'monaco-editor/languages/definitions/rust/register.js'
import 'monaco-editor/languages/definitions/scss/register.js'
import 'monaco-editor/languages/definitions/shell/register.js'
import 'monaco-editor/languages/definitions/sql/register.js'
import 'monaco-editor/languages/definitions/swift/register.js'
import 'monaco-editor/languages/definitions/typescript/register.js'
import 'monaco-editor/languages/definitions/xml/register.js'
import 'monaco-editor/languages/definitions/yaml/register.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { detectMonacoLanguage } from './languageDetection'

globalThis.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  }
}

monaco.languages.register({
  id: 'json',
  extensions: ['.json', '.jsonc', '.bowerrc', '.jshintrc', '.jscsrc', '.eslintrc', '.babelrc'],
  aliases: ['JSON', 'json'],
  mimetypes: ['application/json']
})

monaco.languages.setLanguageConfiguration('json', {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/']
  },
  brackets: [
    ['{', '}'],
    ['[', ']']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '"', close: '"' }
  ]
})

monaco.languages.setMonarchTokensProvider('json', {
  tokenPostfix: '.json',
  tokenizer: {
    root: [
      [/[{}[\]]/, '@brackets'],
      [/[,:]/, 'delimiter'],
      [/\s+/, 'white'],
      [/"(?:\\.|[^"\\])*"(?=\s*:)/, 'string.key'],
      [/"(?:\\.|[^"\\])*"/, 'string.value'],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/\b(?:true|false|null)\b/, 'keyword'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment']
    ],
    comment: [
      [/[^*/]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[*/]/, 'comment']
    ]
  }
})

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
