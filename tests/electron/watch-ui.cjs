/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- Electron executes this CommonJS test entry point directly. */
// Runs against the built application with real Git repositories and isolated preferences.
const { app, dialog, ipcMain, Tray } = require('electron')
const { mkdtemp, mkdir, realpath, writeFile, rm } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { execFileSync } = require('node:child_process')
const assert = require('node:assert/strict')

let workspace
let window
let trayTitle = ''
const directoryChoices = []
const reports = []
const originalSetTitle = Tray.prototype.setTitle
Tray.prototype.setTitle = function (title, ...args) {
  trayTitle = title
  return originalSetTitle.call(this, title, ...args)
}
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directoryChoices.shift()] })
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const evaluate = (expression) => window.webContents.executeJavaScript(expression)
const json = JSON.stringify
async function waitFor(expression) {
  for (let attempt = 0; attempt < 200; attempt++) {
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
async function button(text) {
  await waitFor(
    `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${json(text)} && !b.disabled)`
  )
  await evaluate(
    `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${json(text)} && !b.disabled).click()`
  )
  await delay(40)
}
async function saved() {
  return evaluate(`JSON.parse(window.api.getConfig('watchConfig', '{}'))`)
}
async function reload() {
  const loaded = new Promise((done) => window.webContents.once('did-finish-load', done))
  window.webContents.reload()
  await loaded
  await waitFor(`Boolean(document.querySelector('[aria-label="打开设置"]'))`)
}
async function choose(path) {
  directoryChoices.push(path)
  await button('添加根目录')
  await waitFor(`Boolean(document.querySelector('[aria-label="移除根目录 ${path}"]'))`)
  await waitFor(`!document.body.textContent.includes('加载中…')`)
}
async function check(path) {
  await click(`[aria-label="监听 ${path}"]`)
}
async function screenshot(name) {
  const image = await window.webContents.capturePage()
  await writeFile(join(workspace, name + '.png'), image.toPNG())
}
function report(name) {
  reports.push(name)
  console.log('PASS', name)
}
function initRepository(path) {
  execFileSync('git', ['init', path], { stdio: 'pipe' })
  execFileSync(
    'git',
    [
      '-C',
      path,
      '-c',
      'user.name=UI Test',
      '-c',
      'user.email=ui@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'UI fixture'
    ],
    { stdio: 'pipe' }
  )
}

async function run() {
  const a = join(workspace, '团队 A')
  const b = join(workspace, '团队 B')
  const alpha = join(a, 'alpha')
  const team = join(a, 'team')
  const sameA = join(team, 'same')
  const sameB = join(b, 'same')
  await mkdir(team, { recursive: true })
  await mkdir(b, { recursive: true })
  initRepository(alpha)
  initRepository(sameA)
  initRepository(sameB)
  await mkdir(join(alpha, 'ordinary'))
  await writeFile(join(alpha, 'changed.txt'), 'uncommitted')
  await evaluate(
    `window.api.saveConfig('selectedDirectory', ${json(a)}); window.api.saveConfig('autoCheckEnabled', 'true'); localStorage.removeItem('watchConfig')`
  )
  await reload()
  await waitFor(`document.querySelector('.git-workspace__toolbar-dir')?.textContent === ${json(a)}`)
  await waitFor(`!document.body.textContent.includes('正在刷新…')`)
  assert.equal((await saved()).mode, 'parent')
  report('Legacy directory migrates and scans on startup')

  await click('[aria-label="打开设置"]')
  await button('手动选择')
  await choose(a)
  await click('[aria-label="展开 team"]')
  await waitFor(`Boolean(document.querySelector('[aria-label="监听 ${sameA}"]'))`)
  await check(alpha)
  await check(sameA)
  await button('取消')
  assert.equal((await saved()).mode, 'parent')
  await click('[aria-label="打开设置"]')
  await button('手动选择')
  assert.equal(await evaluate('document.querySelectorAll(".watch-tree-root").length'), 0)
  report('Cancel discards tree roots and selections without changing monitoring')

  await choose(a)
  await choose(b)
  await choose(team)
  await choose(alpha)
  await check(alpha)
  await check(sameA)
  await check(sameB)
  assert.equal(
    await evaluate(`document.querySelectorAll('[aria-label="监听 ${alpha}"]:checked').length`),
    2
  )
  assert.equal(
    await evaluate(`document.querySelector('[aria-label="监听 ${join(alpha, 'ordinary')}"]')`),
    null
  )
  assert.equal(
    await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '应用');
    const bounds = button.getBoundingClientRect();
    const modal = document.querySelector('.settings-modal').getBoundingClientRect();
    return bounds.top >= modal.top && bounds.bottom <= modal.bottom;
  })()`),
    true,
    'Apply stays visible when many roots are expanded'
  )
  await screenshot('01-directory-tree')
  await button('应用')
  assert.equal((await saved()).repoPaths.length, 3)
  await click('[aria-label="关闭设置"]')
  await waitFor(
    `document.querySelector('.git-workspace__toolbar-dir')?.textContent === '手动选择 · 3 个项目'`
  )
  await waitFor(`!document.body.textContent.includes('正在刷新…')`)
  if (process.platform === 'darwin') assert.equal(trayTitle, '1')
  await screenshot('02-selected-workspace')
  report(
    'Multiple roots, deep repos, same names, selectable tree roots, synchronized duplicate checkboxes and tray count'
  )

  await reload()
  await waitFor(
    `document.querySelector('.git-workspace__toolbar-dir')?.textContent === '手动选择 · 3 个项目'`
  )
  await click('[aria-label="打开设置"]')
  await click(`[aria-label="移除根目录 ${a}"]`)
  assert.equal(
    await evaluate('document.querySelector(".watch-selected h4").textContent'),
    '已选项目 · 3'
  )
  await button('应用')
  await button('父目录扫描')
  await button('应用')
  assert.equal((await saved()).repoPaths.length, 3)
  await button('手动选择')
  await button('应用')
  report(
    'Restart restores selections; overlapping root removal and mode switching preserve the right projects'
  )

  await check(sameB)
  await window.webContents.executeJavaScriptInIsolatedWorld(999, [
    {
      code: `globalThis.__originalStorageSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new Error('UI test: storage full') }; void 0`
    }
  ])
  await button('应用')
  await waitFor(
    `document.querySelector('.watch-inline-error')?.textContent.includes('storage full')`
  )
  assert.equal((await saved()).repoPaths.length, 3)
  assert.equal(
    await evaluate('document.querySelector(".watch-selected h4").textContent'),
    '已选项目 · 2'
  )
  await window.webContents.executeJavaScriptInIsolatedWorld(999, [
    { code: 'Storage.prototype.setItem = globalThis.__originalStorageSetItem; void 0' }
  ])
  await button('取消')
  report('Failed persistence keeps the draft and the previous active configuration')

  await rm(sameB, { recursive: true })
  await button('刷新状态')
  await waitFor(`Boolean(document.querySelector('.watch-scan-errors'))`)
  assert.equal((await saved()).repoPaths.length, 3)
  await screenshot('03-unavailable-project')
  initRepository(sameB)
  await button('刷新状态')
  await waitFor(
    `!document.querySelector('.watch-scan-errors') && !document.body.textContent.includes('正在刷新…')`
  )
  report('Missing repositories surface errors without losing selections, then recover on refresh')

  await click('[aria-label="打开设置"]')
  for (const path of [alpha, sameA, sameB]) await click(`[aria-label="移除项目 ${path}"]`)
  await button('应用')
  await click('[aria-label="关闭设置"]')
  await waitFor(`Boolean(document.querySelector('.repo-workspace-gitok__empty-app'))`)
  assert.equal(await evaluate(`window.api.getConfig('autoCheckEnabled')`), 'true')
  if (process.platform === 'darwin') assert.equal(trayTitle, '')
  report('Empty selection clears workspace and tray while preserving auto-check preference')

  await click('[aria-label="打开设置"]')
  await waitFor(`Boolean(document.querySelector('[aria-label="监听 ${sameA}"]'))`)
  await check(sameA)
  await check(sameB)
  await button('应用')
  await screenshot('04-final-settings')
  await writeFile(join(workspace, 'report.json'), JSON.stringify({ reports, workspace }, null, 2))
  console.log('UI_QA_ARTIFACTS', workspace)
  console.log('All Electron UI scenarios passed')
  if (!process.env.GITOK_UI_QA_KEEP_OPEN) app.quit()
}

;(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'gitok-ui-')))
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
