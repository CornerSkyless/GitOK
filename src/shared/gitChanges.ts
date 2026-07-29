export type GitChangeScope = 'staged' | 'unstaged' | 'untracked'

export type GitFileChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed'
  | 'conflicted'
  | 'unknown'

export interface GitChangedFile {
  path: string
  previousPath?: string
  scope: GitChangeScope
  status: GitFileChangeStatus
}

export interface GitFileDiffResult {
  path: string
  scope: GitChangeScope
  originalContent: string
  modifiedContent: string
  isBinary: boolean
  tooLarge: boolean
  error?: string
}
