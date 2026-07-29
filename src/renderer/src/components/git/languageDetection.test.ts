import { describe, expect, it } from 'vitest'
import { detectMonacoLanguage, type MonacoLanguageDescriptor } from './languageDetection'

const LANGUAGES: MonacoLanguageDescriptor[] = [
  { id: 'typescript', extensions: ['.ts', '.tsx'] },
  { id: 'json', extensions: ['.json'] },
  { id: 'css', extensions: ['.css'] },
  { id: 'python', extensions: ['.py'] },
  { id: 'dockerfile', filenames: ['Dockerfile'] }
]

describe('Monaco language detection', () => {
  it.each([
    ['src/App.tsx', 'typescript'],
    ['package.json', 'json'],
    ['src/styles/main.css', 'css'],
    ['scripts/release.py', 'python'],
    ['docker/Dockerfile', 'dockerfile'],
    ['src/README.unknown', 'plaintext']
  ])('maps %s to %s', (filePath, expected) => {
    expect(detectMonacoLanguage(filePath, LANGUAGES)).toBe(expected)
  })

  it('uses the new filename language independently for renamed files', () => {
    expect(detectMonacoLanguage('config/settings.json', LANGUAGES)).toBe('json')
    expect(detectMonacoLanguage('config/settings.ts', LANGUAGES)).toBe('typescript')
  })
})
