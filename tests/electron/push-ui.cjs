/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- Electron test harness. */
// Real IPC and Git pushes run exclusively against temporary local bare remotes.
const { app, ipcMain, Tray, nativeTheme } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir, writeFile, rm, realpath } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const assert = require('node:assert/strict')
let workspace
let window
let trayTitle = ''
const reports = []
const originalSetTitle = Tray.prototype.setTitle
Tray.prototype.setTitle = function (title, ...args) {
  trayTitle = title
  return originalSetTitle.call(this, title, ...args)
}
const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=UI Test', '-c', 'user.email=ui@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
const json = JSON.stringify
const evaluate = (code) => window.webContents.executeJavaScript(code)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(expression) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await evaluate(expression)) return
    await delay(25)
  }
  throw new Error(`Timed out: ${expression}`)
}
async function click(selector) {
  await waitFor(`Boolean(document.querySelector(${json(selector)}))`)
  await evaluate(`document.querySelector(${json(selector)}).click()`)
  await delay(40)
}
async function selectRepo(name) {
  await evaluate(
    `[...document.querySelectorAll('.git-workspace__row')].find(row => row.querySelector('.git-workspace__row-title')?.textContent === ${json(name)}).click()`
  )
  await waitFor(
    `document.querySelector('.git-workspace__detail-title')?.textContent === ${json(name)}`
  )
}
async function filter(label) {
  await evaluate(
    `[...document.querySelectorAll('.git-workspace__nav-item')].find(button => button.querySelector('.git-workspace__nav-item-text')?.textContent === ${json(label)}).click()`
  )
  await delay(40)
}
async function count(label) {
  return evaluate(
    `Number([...document.querySelectorAll('.git-workspace__nav-item')].find(button => button.querySelector('.git-workspace__nav-item-text')?.textContent === ${json(label)}).querySelector('.git-workspace__nav-item-count').textContent)`
  )
}
async function screenshot(name) {
  await writeFile(join(workspace, name + '.png'), (await window.webContents.capturePage()).toPNG())
}
async function fixture(name) {
  const repo = join(workspace, name)
  const remote = join(workspace, name + '.git')
  await mkdir(repo)
  git(workspace, 'init', '--bare', remote)
  git(repo, 'init', '-b', 'feature/local')
  git(repo, 'commit', '--allow-empty', '-m', 'Initial commit')
  git(repo, 'remote', 'add', 'team', remote)
  git(repo, 'push', '-u', 'team', 'HEAD:refs/heads/review')
  return { repo, remote, name }
}
async function advanceRemote(fixture) {
  const peer = join(workspace, fixture.name + '-peer')
  git(workspace, 'clone', '-b', 'review', fixture.remote, peer)
  git(peer, 'commit', '--allow-empty', '-m', 'Remote advance')
  git(peer, 'push')
  git(fixture.repo, 'fetch', 'team')
}
async function run() {
  const alpha = await fixture('alpha-待推送')
  const beta = await fixture('beta-分支分叉')
  const gamma = await fixture('gamma-仅落后')
  const delta = await fixture('delta-无上游')
  const epsilon = await fixture('epsilon-有未提交文件')
  for (const item of [alpha, beta, epsilon])
    git(item.repo, 'commit', '--allow-empty', '-m', 'Local commit to push')
  await advanceRemote(beta)
  await advanceRemote(gamma)
  git(delta.repo, 'branch', '--unset-upstream')
  await writeFile(join(epsilon.repo, 'draft.txt'), 'keep this uncommitted\n')
  const config = {
    version: 1,
    mode: 'manual',
    parentPath: '',
    roots: [],
    repoPaths: [alpha, beta, gamma, delta, epsilon].map((item) => item.repo),
    repoSources: {}
  }
  await evaluate(
    `window.api.saveConfig('watchConfig', ${json(JSON.stringify(config))}); window.api.saveConfig('autoCheckEnabled', 'false')`
  )
  const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve))
  window.webContents.reload()
  await loaded
  await waitFor(
    `document.querySelectorAll('.git-workspace__row').length === 5 && !document.body.textContent.includes('正在刷新…')`
  )
  assert.equal(await count('待推送'), 3)
  assert.equal(await count('落后远程'), 2)
  assert.equal(await count('已同步'), 0)
  if (process.platform === 'darwin') assert.equal(trayTitle, '5')
  await selectRepo(beta.name)
  assert.equal(
    await evaluate(`document.querySelector('.git-workspace__push-button').disabled`),
    true
  )
  assert.equal(
    await evaluate(
      `document.querySelector('.git-workspace__push-info').textContent.includes('请先同步远程分支')`
    ),
    true
  )
  await screenshot('01-diverged')
  await selectRepo(gamma.name)
  assert.equal(
    await evaluate(`Boolean(document.querySelector('.git-workspace__push-button'))`),
    false
  )
  await selectRepo(delta.name)
  assert.equal(
    await evaluate(
      `document.querySelector('.git-workspace__push-info').textContent.includes('请先设置上游分支')`
    ),
    true
  )
  reports.push(
    'Only ahead repositories are pending; divergence is disabled; no upstream is not synced.'
  )

  await filter('待推送')
  await selectRepo(alpha.name)
  await click('[role="tab"]:nth-child(2)')
  assert.equal(
    await evaluate(`document.querySelector('.git-workspace__push-button').disabled`),
    false
  )
  await click('[role="tab"]:first-child')
  nativeTheme.themeSource = 'light'
  await delay(150)
  await screenshot('02-ready-light')
  nativeTheme.themeSource = 'dark'
  await delay(150)
  await screenshot('03-ready-dark')
  nativeTheme.themeSource = 'light'
  // Hold a real push in its pre-push hook so switching projects and double clicks are deterministic.
  const gate = join(workspace, 'release-push')
  const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'"
  await writeFile(
    join(alpha.repo, '.git', 'hooks', 'pre-push'),
    `#!/bin/sh\nwhile ! test -f ${quote(gate)}; do sleep 0.1; done\n`,
    { mode: 0o755 }
  )
  await click('.git-workspace__push-button')
  await waitFor(
    `document.querySelector('.git-workspace__push-button')?.textContent.includes('推送中')`
  )
  assert.equal(
    await evaluate(`document.querySelector('.git-workspace__push-button').disabled`),
    true
  )
  await click('.git-workspace__push-button')
  await selectRepo(beta.name)
  assert.equal(
    await evaluate(`document.querySelector('.git-workspace__push-button').textContent.trim()`),
    '推送'
  )
  await selectRepo(alpha.name)
  assert.equal(
    await evaluate(`document.querySelector('.git-workspace__push-button').textContent.trim()`),
    '推送中…'
  )
  await screenshot('04-pushing')
  await writeFile(gate, 'release')
  await waitFor(
    `document.querySelector('.git-workspace__push-notice')?.textContent.includes(${json(alpha.name + ' 推送成功')}) && document.querySelectorAll('.git-workspace__row').length === 2`
  )
  assert.notEqual(
    await evaluate(`document.querySelector('.git-workspace__detail-title')?.textContent`),
    alpha.name
  )
  assert.equal(
    git(alpha.remote, 'rev-parse', 'refs/heads/review'),
    git(alpha.repo, 'rev-parse', 'HEAD')
  )
  if (process.platform === 'darwin') assert.equal(trayTitle, '4')
  await screenshot('05-success-auto-selection')
  reports.push(
    'Real push, disabled duplicate click, project switching, automatic pending-list removal, persistent notice and tray refresh passed.'
  )

  const rejectHook = join(epsilon.remote, 'hooks', 'pre-receive')
  await writeFile(rejectHook, '#!/bin/sh\necho "Protected branch: review required" >&2\nexit 1\n', {
    mode: 0o755
  })
  await selectRepo(epsilon.name)
  await click('.git-workspace__push-button')
  await waitFor(
    `document.querySelector('.git-workspace__push-error')?.textContent.includes('Protected branch') && !document.querySelector('.git-workspace__push-button').disabled`
  )
  await selectRepo(beta.name)
  assert.equal(
    await evaluate(`Boolean(document.querySelector('.git-workspace__push-error'))`),
    false
  )
  await selectRepo(epsilon.name)
  assert.equal(
    await evaluate(
      `document.querySelector('.git-workspace__push-error').textContent.includes('Protected branch')`
    ),
    true
  )
  await screenshot('06-push-rejected')
  await rm(rejectHook)
  await click('.git-workspace__push-button')
  await waitFor(
    `document.querySelector('.git-workspace__push-notice')?.textContent.includes(${json(epsilon.name + ' 推送成功')}) && document.querySelectorAll('.git-workspace__row').length === 1`
  )
  assert.equal(git(epsilon.repo, 'status', '--porcelain'), '?? draft.txt')
  await screenshot('07-retry-succeeded')
  reports.push(
    'Remote rejection is shown per project; retry succeeds and leaves the working tree untouched.'
  )
  window.setSize(1000, 700)
  await delay(150)
  const fits = await evaluate(
    `(() => { const button = document.querySelector('.git-workspace__push-button').getBoundingClientRect(); const pane = document.querySelector('.git-workspace__detail-pane').getBoundingClientRect(); return button.left >= pane.left && button.right <= pane.right && button.bottom <= pane.bottom })()`
  )
  assert.equal(fits, true)
  await screenshot('08-compact-layout')
  reports.push('Push button remains visible in both tabs, both themes and a 1000 × 700 window.')
  await writeFile(join(workspace, 'report.json'), JSON.stringify({ reports, workspace }, null, 2))
  console.log('UI_QA_ARTIFACTS', workspace)
  console.log('All push Electron UI scenarios passed')
  app.quit()
}
;(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'gitok-push-ui-')))
  app.setPath('userData', join(workspace, 'profile'))
  app.on('browser-window-created', (_, created) => {
    window = created
    created.webContents.once('did-finish-load', () => {
      run().catch((error) => {
        console.error(error)
        app.exit(1)
      })
    })
  })
  require(resolve(__dirname, '../../out/main/index.js'))
  ipcMain.removeHandler('checkForUpdates')
  ipcMain.handle('checkForUpdates', () => ({ hasError: false, hasUpdate: false }))
})().catch((error) => {
  console.error(error)
  app.exit(1)
})
