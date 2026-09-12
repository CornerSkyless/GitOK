import type { GitPushRequest, GitPushResult } from '../shared/gitPush'
import { sameUpstream } from '../shared/gitPush'
import { canonicalDirectory, isRepositoryRoot } from './watchDirectories'
import { executeGitCommand, publicGitError } from './gitCommand'
import { checkGitStatus, readUpstream } from './gitStatus'

const activePushes = new Set<string>()

export async function pushGitRepo(request: GitPushRequest): Promise<GitPushResult> {
  let lockedPath: string | undefined
  try {
    if (
      !request ||
      typeof request.repoPath !== 'string' ||
      typeof request.expectedBranch !== 'string' ||
      !request.expectedBranch ||
      !request.expectedUpstream ||
      !(['remote', 'branch', 'ref'] as const).every(
        (key) => typeof request.expectedUpstream[key] === 'string' && request.expectedUpstream[key]
      )
    )
      throw new Error('推送参数无效，请刷新状态')

    const repoPath = await canonicalDirectory(request.repoPath)
    if (activePushes.has(repoPath)) throw new Error('此项目正在推送，请等待完成')
    activePushes.add(repoPath)
    lockedPath = repoPath
    if (!(await isRepositoryRoot(repoPath))) throw new Error('该目录已不是 Git 仓库根目录')

    const status = await checkGitStatus(repoPath, true, true)
    if (!status.branch) throw new Error('当前未处于分支上，请先切换到分支')
    if (status.remoteStatusError) throw new Error(status.remoteStatusError)
    if (!status.upstream) throw new Error('请先设置上游分支')
    if (
      status.branch !== request.expectedBranch ||
      !sameUpstream(status.upstream, request.expectedUpstream)
    )
      throw new Error('分支或上游已变更，请刷新状态后重试')
    const { remote, branch } = status.upstream
    if (remote === '.' || !branch.startsWith('refs/heads/')) {
      throw new Error('请先设置远程上游分支')
    }
    if (status.behindCount > 0) throw new Error('请先同步远程分支')
    if (status.aheadCount === 0) throw new Error('没有待推送的提交，请刷新状态')

    const urls = (
      await executeGitCommand(repoPath, ['remote', 'get-url', '--push', '--all', remote])
    )
      .trim()
      .split('\n')
    if (urls.length !== 1) throw new Error('该远程配置了多个推送地址，请先保留一个推送地址')
    // Freeze the source commit so a concurrent checkout cannot push a different branch.
    const commit = (
      await executeGitCommand(repoPath, ['rev-parse', `refs/heads/${status.branch}`])
    ).trim()
    const currentBranch = (await executeGitCommand(repoPath, ['branch', '--show-current'])).trim()
    if (
      currentBranch !== status.branch ||
      !sameUpstream(await readUpstream(repoPath, currentBranch), status.upstream)
    )
      throw new Error('分支或上游已变更，请刷新状态后重试')
    await executeGitCommand(
      repoPath,
      [
        '-c',
        `remote.${remote}.mirror=false`,
        'push',
        '--porcelain',
        '--no-force',
        '--no-follow-tags',
        '--recurse-submodules=no',
        '--',
        remote,
        `${commit}:${branch}`
      ],
      120_000
    )
    return { success: true }
  } catch (error) {
    return { success: false, error: publicGitError(error) }
  } finally {
    if (lockedPath) activePushes.delete(lockedPath)
  }
}
