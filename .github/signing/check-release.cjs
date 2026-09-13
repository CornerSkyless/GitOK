/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node.js release tool. */
const { readFileSync } = require('node:fs')

const tag = process.env.GITHUB_REF_NAME
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
if (
  process.env.GITHUB_REF_TYPE !== 'tag' ||
  !/^v\d+\.\d+\.\d+$/.test(tag || '') ||
  tag !== `v${version}`
) {
  throw new Error('Release requires a version tag matching package.json, for example v1.3.5.')
}
if (!readFileSync(`.github/release-notes/${tag}.md`, 'utf8').trim()) {
  throw new Error('User-facing release notes are required.')
}
console.log(`Release source validated: ${tag}`)
