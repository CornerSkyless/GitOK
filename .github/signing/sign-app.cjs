/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- Standalone Node.js signing tool. */
const { execFileSync } = require('node:child_process')
const { resolve } = require('node:path')
const { signAsync } = require('@electron/osx-sign')

async function main() {
  const [appPath, keychainPath, teamId] = process.argv.slice(2)
  if (!appPath || !keychainPath || !/^[A-Z0-9]{10}$/.test(teamId || '')) {
    throw new Error('App path, temporary keychain and valid Apple Team ID are required.')
  }
  const identities = execFileSync(
    '/usr/bin/security',
    ['find-identity', '-v', '-p', 'codesigning', keychainPath],
    { encoding: 'utf8' }
  )
  const matches = [
    ...identities.matchAll(
      /\b([A-Fa-f0-9]{40}) "Developer ID Application: [^"\n]+ \(([A-Z0-9]{10})\)"/g
    )
  ].filter((match) => match[2] === teamId)
  if (matches.length !== 1)
    throw new Error(
      'Import exactly one valid Developer ID Application certificate matching APPLE_TEAM_ID.'
    )
  const identity = matches[0][1]
  await signAsync({
    app: resolve(appPath),
    platform: 'darwin',
    type: 'distribution',
    identity,
    keychain: keychainPath,
    identityValidation: true,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    strictVerify: true,
    optionsForFile: () => ({
      hardenedRuntime: true,
      entitlements: resolve('build/entitlements.mac.plist')
    })
  })
  // Only the public certificate fingerprint is printed; the caller uses it to sign the DMG.
  console.log(identity)
}

main().catch(() => {
  console.error(
    'Developer ID signing failed. Check certificate validity, team and bundle integrity.'
  )
  process.exitCode = 1
})
