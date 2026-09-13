/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- Electron test harness. */
// An isolated profile and temporary folders; startup IPC is stubbed unless explicitly requested.
const { app, ipcMain, nativeTheme } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir, writeFile, realpath } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const assert = require('node:assert/strict')
let workspace
let window
let finishLaunch
const launches = []
const reports = []
const main = '.git-workspace__open-project-main'
const toggle = '.git-workspace__open-project-toggle'
const menu = '.git-workspace__open-project-menu'
const error = '.git-workspace__open-project-error'
const json = JSON.stringify
const evaluate = async (code) => {
  try {
    return await window.webContents.executeJavaScript(code)
  } catch (error) {
    throw new Error(`Renderer evaluation failed: ${code}`, { cause: error })
  }
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(expression) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await evaluate(expression)) return
    await delay(30)
  }
  throw new Error(`Timed out: ${expression}`)
}
async function click(selector) {
  await waitFor(`Boolean(document.querySelector(${json(selector)}))`)
  await evaluate(`document.querySelector(${json(selector)}).click()`)
  await delay(50)
}
async function key(keyCode) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  if (keyCode === 'ENTER') window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  await delay(50)
}
async function selectRepo(name) {
  await evaluate(
    `[...document.querySelectorAll('.git-workspace__row')].find(row => row.querySelector('.git-workspace__row-title')?.textContent === ${json(name)}).click()`
  )
  await waitFor(
    `document.querySelector('.git-workspace__detail-title')?.textContent === ${json(name)}`
  )
}
async function selectApplication(label) {
  await click(toggle)
  await evaluate(
    `[...document.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent === ${json(label)}).click()`
  )
  await delay(50)
}
async function reload() {
  const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve))
  window.webContents.reload()
  await loaded
  await waitFor(`document.querySelectorAll('.git-workspace__row').length === 2`)
}
async function screenshot(name) {
  await writeFile(join(workspace, name + '.png'), (await window.webContents.capturePage()).toPNG())
}
async function run() {
  const alphaName = "alpha-项目 folder ' $&;"
  const betaName = 'beta-普通文件夹'
  const projects = join(workspace, 'projects')
  await mkdir(projects)
  const alpha = join(projects, alphaName)
  const beta = join(projects, betaName)
  await mkdir(alpha)
  await mkdir(beta)
  execFileSync('git', ['init', '-b', 'main', alpha])
  execFileSync('git', [
    '-C',
    alpha,
    '-c',
    'user.name=GitOK Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-m',
    'Initial test commit'
  ])
  const config = {
    version: 1,
    mode: 'parent',
    parentPath: projects,
    roots: [],
    repoPaths: [alpha, beta],
    repoSources: {}
  }
  await evaluate(
    `window.api.saveConfig('watchConfig', ${json(json(config))}); window.api.saveConfig('autoCheckEnabled', 'false'); window.api.saveConfig('projectOpeningApplication', 'invalid-value')`
  )
  await reload()
  await selectRepo(alphaName)
  assert.equal(
    await evaluate(`document.querySelector(${json(main)}).textContent.trim()`),
    '使用终端打开'
  )
  assert.equal(
    await evaluate(
      `document.querySelector(${json(main)}).closest('.git-workspace__open-project').previousElementSibling.getAttribute('aria-label')`
    ),
    '打开项目目录'
  )
  await click(toggle)
  const labels = await evaluate(
    `Array.from(document.querySelectorAll('[role="menuitemradio"]'), item => item.textContent)`
  )
  assert.deepEqual(
    labels,
    process.platform === 'darwin'
      ? ['终端', 'iTerm', 'Warp', 'VS Code', 'Cursor']
      : ['终端', 'Warp', 'VS Code', 'Cursor']
  )
  assert.equal(await evaluate('document.activeElement.textContent'), '终端')
  await key('END')
  assert.equal(await evaluate('document.activeElement.textContent'), 'Cursor')
  await key('HOME')
  await key('DOWN')
  assert.equal(await evaluate('document.activeElement.textContent'), labels[1])
  await key('ESCAPE')
  assert.equal(await evaluate(`Boolean(document.querySelector(${json(menu)}))`), false)
  assert.equal(await evaluate(`document.activeElement.matches(${json(toggle)})`), true)
  await key('DOWN')
  await key('END')
  await key('ENTER')
  assert.equal(
    await evaluate(`document.querySelector(${json(main)}).textContent.trim()`),
    '使用 Cursor 打开'
  )
  assert.equal(launches.length, 0)
  await selectRepo(betaName)
  assert.equal(
    await evaluate(`document.querySelector(${json(main)}).textContent.trim()`),
    '使用 Cursor 打开'
  )
  await reload()
  await selectRepo(alphaName)
  assert.equal(
    await evaluate(`document.querySelector(${json(main)}).textContent.trim()`),
    '使用 Cursor 打开'
  )
  reports.push(
    'Position, option list, invalid preference fallback, keyboard selection and persistence across projects/reload passed.'
  )

  await click(toggle)
  await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
  await waitFor(`!document.querySelector(${json(menu)})`)
  await click(toggle)
  await key('TAB')
  await waitFor(`!document.querySelector(${json(menu)})`)

  await click(main)
  assert.deepEqual(launches[0], { folderPath: alpha, application: 'cursor' })
  assert.equal(
    await evaluate(
      `document.querySelector(${json(main)}).disabled && document.querySelector(${json(toggle)}).disabled`
    ),
    true
  )
  await click(main)
  assert.equal(launches.length, 1)
  await selectRepo(betaName)
  finishLaunch({ success: false, error: '旧项目启动失败' })
  await delay(100)
  assert.equal(await evaluate(`Boolean(document.querySelector(${json(error)}))`), false)
  await click(main)
  assert.deepEqual(launches[1], { folderPath: beta, application: 'cursor' })
  finishLaunch({ success: false, error: '未找到 Cursor，请安装后重试。' })
  await waitFor(`document.querySelector(${json(error)})?.textContent.includes('未找到 Cursor')`)
  await screenshot('01-launch-error')
  await selectApplication('Warp')
  assert.equal(await evaluate(`Boolean(document.querySelector(${json(error)}))`), false)
  await click(main)
  finishLaunch({ success: true })
  await waitFor(`!document.querySelector(${json(main)}).disabled`)
  reports.push(
    'Outside click, Tab dismissal, exact current path, duplicate prevention, stale result isolation, ordinary folders, errors and retry passed.'
  )

  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await selectRepo(alphaName)
    await click(toggle)
    await delay(100)
    await screenshot('02-menu-' + theme)
    await key('ESCAPE')
  }
  window.setSize(900, 650)
  await delay(100)
  await click(toggle)
  const fits = await evaluate(
    `(() => { const pane = document.querySelector('.git-workspace__detail-pane').getBoundingClientRect(); return [${json(main)}, ${json(menu)}].every(selector => { const box = document.querySelector(selector).getBoundingClientRect(); return box.left >= pane.left && box.right <= pane.right && box.bottom <= pane.bottom }) })()`
  )
  assert.equal(fits, true)
  await screenshot('03-compact-menu')
  await key('ESCAPE')
  reports.push(
    'Light/dark themes and 900 × 650 compact menu captured; button and menu fit within the detail pane.'
  )

  if (process.env.GITOK_TEST_REAL_LAUNCH === '1') {
    ipcMain.removeHandler('openProjectInApp')
    // Reload main's actual launch implementation from the production bundle by using
    // the handler captured before installing the test stub.
    ipcMain.handle('openProjectInApp', realLaunchHandler)
    const applications =
      process.platform === 'darwin'
        ? ['terminal', 'iterm', 'warp', 'vscode', 'cursor']
        : ['terminal', 'warp', 'vscode', 'cursor']
    for (const application of applications) {
      const result = await evaluate(
        `window.api.openProjectInApp(${json(alpha)}, ${json(application)})`
      )
      assert.deepEqual(result, { success: true })
      reports.push(`Real ${process.platform} launch accepted: ${application} → ${alpha}`)
    }
  }
  await writeFile(join(workspace, 'report.json'), json({ reports, workspace }))
  console.log('UI_QA_ARTIFACTS', workspace)
  console.log(reports.join('\n'))
  app.quit()
}
let realLaunchHandler
;(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'gitok-open-project-ui-')))
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
  // Capture through the public registration API, avoiding Electron private state.
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) => {
    if (channel === 'openProjectInApp') realLaunchHandler = listener
    return originalHandle(channel, listener)
  }
  require(resolve(__dirname, '../../out/main/index.js'))
  ipcMain.handle = originalHandle
  ipcMain.removeHandler('checkForUpdates')
  ipcMain.handle('checkForUpdates', () => ({ hasError: false, hasUpdate: false }))
  ipcMain.removeHandler('openProjectInApp')
  ipcMain.handle('openProjectInApp', (_, folderPath, application) => {
    launches.push({ folderPath, application })
    return new Promise((resolve) => {
      finishLaunch = resolve
    })
  })
})().catch((error) => {
  console.error(error)
  app.exit(1)
})
