import { REMOTE_STATUS_NOT_CHECKED, type GitUpstream } from '../shared/gitPush'
import { executeGitCommand, publicGitError } from './gitCommand'

export async function readUpstream(
  repoPath: string,
  branch: string
): Promise<GitUpstream | undefined> {
  const result = await executeGitCommand(repoPath, [
    'for-each-ref',
    '--format=%(refname)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)',
    `refs/heads/${branch}`
  ])
  const line = result
    .trim()
    .split('\n')
    .find((item) => item.split('\0')[0] === `refs/heads/${branch}`)
  if (!line) return undefined
  const [, ref, remote, remoteBranch] = line.split('\0')
  if (!ref) return undefined
  if (!remote || !remoteBranch) throw new Error('上游配置不完整，请检查分支配置')
  return { ref, remote, branch: remoteBranch }
}

interface GitStatusResult {
  isGitRepo: boolean
  hasUncommittedChanges: boolean
  isPushed: boolean
  aheadCount: number
  behindCount: number
  branch?: string
  upstream?: GitUpstream
  remoteStatusError?: string
  lastCommitMessage?: string
  lastCommitDate?: string
}

function createNonGitStatus(): GitStatusResult {
  return {
    isGitRepo: false,
    hasUncommittedChanges: false,
    isPushed: true,
    aheadCount: 0,
    behindCount: 0
  }
}

async function isGitRepository(repoPath: string): Promise<boolean> {
  try {
    const result = await executeGitCommand(repoPath, ['rev-parse', '--is-inside-work-tree'])
    return result.trim() === 'true'
  } catch {
    return false
  }
}

// Git 状态检查函数
export async function checkGitStatus(
  repoPath: string,
  includeRemote: boolean = true,
  strict: boolean = false
): Promise<GitStatusResult> {
  const isGitRepo = await isGitRepository(repoPath)

  if (!isGitRepo) {
    return createNonGitStatus()
  }

  let hasUncommittedChanges = false
  let branch = ''
  let lastCommitMessage: string | undefined
  let lastCommitDate: string | undefined
  let behindCount = 0
  let aheadCount = 0

  try {
    // 检查是否有未提交的更改
    const statusResult = await executeGitCommand(repoPath, ['status', '--porcelain'])
    hasUncommittedChanges = statusResult.trim().length > 0
  } catch (error) {
    if (strict) throw error
    console.error(`检查 Git 工作区状态失败 ${repoPath}:`, error)
  }

  try {
    // 获取当前分支
    const branchResult = await executeGitCommand(repoPath, ['branch', '--show-current'])
    branch = branchResult.trim()
  } catch (error) {
    if (strict) throw error
    console.error(`获取 Git 分支失败 ${repoPath}:`, error)
  }

  try {
    // 获取最后一次提交信息
    const logResult = await executeGitCommand(repoPath, ['log', '-1', '--pretty=format:%s|%ci'])
    const [message, date] = logResult.split('|')
    lastCommitMessage = message
    lastCommitDate = date
  } catch (error) {
    console.error(`获取 Git 最后提交失败 ${repoPath}:`, error)
  }

  let upstream: GitUpstream | undefined
  let remoteStatusError: string | undefined
  try {
    upstream = branch ? await readUpstream(repoPath, branch) : undefined
    if (upstream && includeRemote) {
      const comparison = await executeGitCommand(repoPath, [
        'rev-list',
        '--left-right',
        '--count',
        `HEAD...${upstream.ref}`
      ])
      const counts = comparison.trim().split(/\s+/).map(Number)
      if (counts.length !== 2 || counts.some((count) => !Number.isInteger(count) || count < 0)) {
        throw new Error('无法读取与上游分支的差距')
      }
      ;[aheadCount, behindCount] = counts
    } else if (upstream) {
      remoteStatusError = REMOTE_STATUS_NOT_CHECKED
    }
  } catch (error) {
    remoteStatusError = `读取上游状态失败：${publicGitError(error)}`
  }

  return {
    isGitRepo: true,
    hasUncommittedChanges,
    isPushed: Boolean(upstream) && !remoteStatusError && behindCount === 0 && aheadCount === 0,
    upstream,
    remoteStatusError,
    aheadCount,
    behindCount,
    branch,
    lastCommitMessage,
    lastCommitDate: lastCommitDate ? new Date(lastCommitDate).toLocaleString('zh-CN') : undefined
  }
}
