export const PROJECT_APPLICATIONS = [
  { id: 'terminal', label: '终端' },
  { id: 'iterm', label: 'iTerm' },
  { id: 'warp', label: 'Warp' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'cursor', label: 'Cursor' }
] as const

export type ProjectApplication = (typeof PROJECT_APPLICATIONS)[number]['id']
export type OpenProjectResult = { success: true } | { success: false; error: string }
export const PROJECT_APPLICATION_CONFIG_KEY = 'projectOpeningApplication'

export function getProjectApplications(platform: string): (typeof PROJECT_APPLICATIONS)[number][] {
  if (!['darwin', 'win32', 'linux'].includes(platform)) return []
  return PROJECT_APPLICATIONS.filter(({ id }) => id !== 'iterm' || platform === 'darwin')
}

export function isProjectApplication(value: unknown): value is ProjectApplication {
  return PROJECT_APPLICATIONS.some(({ id }) => id === value)
}
