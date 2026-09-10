import { describe, expect, it } from 'vitest'
import { emptyWatchConfig, hasWatchTargets, readWatchConfig, removeWatchRoot } from './watchConfig'

describe('watch configuration', () => {
  it('migrates legacy directories and safely handles malformed saved data', () => {
    expect(readWatchConfig('', '/projects')).toEqual(emptyWatchConfig('/projects'))
    expect(readWatchConfig('{bad', '/projects')).toEqual(emptyWatchConfig('/projects'))
    expect(readWatchConfig('{"version":1,"mode":"manual"}', '/projects').mode).toBe('parent')
  })

  it('round trips independent modes and does not fall back to the parent for empty manual selections', () => {
    const config = {
      ...emptyWatchConfig('/old'),
      mode: 'manual' as const,
      roots: ['/new'],
      repoPaths: ['/new/a']
    }
    const restored = readWatchConfig(JSON.stringify(config), '/ignored')
    expect(restored).toEqual(config)
    expect(hasWatchTargets(restored)).toBe(true)
    expect(hasWatchTargets({ ...restored, repoPaths: [] })).toBe(false)
    expect(readWatchConfig(JSON.stringify({ ...config, mode: 'parent' })).repoPaths).toEqual([
      '/new/a'
    ])
  })

  it('removes only repositories no longer covered by any remaining tree root', () => {
    const config = {
      ...emptyWatchConfig(),
      roots: ['/projects', '/projects/team', '/elsewhere'],
      repoPaths: ['/projects/a', '/projects/team/b', '/elsewhere/c'],
      repoSources: { '/projects/a': ['/projects'] }
    }
    const result = removeWatchRoot(config, '/projects')
    expect(result.repoPaths).toEqual(['/projects/team/b', '/elsewhere/c'])
    expect(config.repoPaths).toHaveLength(3)
  })

  it('preserves linked selections owned by another root and handles path boundaries', () => {
    const config = {
      ...emptyWatchConfig(),
      roots: ['/a', '/ab', '/links'],
      repoPaths: ['/ab/repo', '/external/repo', '/a/own'],
      repoSources: { '/external/repo': ['/a', '/links'] }
    }
    expect(removeWatchRoot(config, '/a').repoPaths).toEqual(['/ab/repo', '/external/repo'])
    expect(removeWatchRoot(removeWatchRoot(config, '/a'), '/links').repoPaths).toEqual(['/ab/repo'])
  })
})
