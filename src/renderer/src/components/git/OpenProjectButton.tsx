import { useEffect, useId, useRef, useState } from 'react'
import { HiCheck, HiChevronDown, HiOutlineCommandLine } from 'react-icons/hi2'
import {
  getProjectApplications,
  PROJECT_APPLICATION_CONFIG_KEY,
  type ProjectApplication
} from '../../../../shared/projectApplications'

export function OpenProjectButton({
  folderPath
}: {
  folderPath: string
}): React.JSX.Element | null {
  const applications = getProjectApplications(window.api.windowControls.getPlatform())
  const [application, setApplication] = useState<ProjectApplication>(() => {
    const saved = window.api.getConfig(PROJECT_APPLICATION_CONFIG_KEY, 'terminal')
    return applications.find(({ id }) => id === saved)?.id ?? 'terminal'
  })
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const container = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const requestVersion = useRef({ version: 0 })
  const inFlight = useRef(false)
  const menuId = useId()
  const errorId = useId()
  const label = applications.find(({ id }) => id === application)?.label ?? '终端'

  useEffect(() => {
    const request = requestVersion.current
    return () => {
      request.version++
    }
  }, [])

  useEffect(() => {
    if (!expanded) return
    container.current
      ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus()
    const outsideClick = (event: PointerEvent): void => {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setExpanded(false)
    }
    document.addEventListener('pointerdown', outsideClick)
    return () => document.removeEventListener('pointerdown', outsideClick)
  }, [expanded])

  const selectApplication = (next: ProjectApplication): void => {
    requestVersion.current.version++
    setApplication(next)
    setError('')
    setExpanded(false)
    window.api.saveConfig(PROJECT_APPLICATION_CONFIG_KEY, next)
    toggle.current?.focus()
  }

  const openProject = async (): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    const version = ++requestVersion.current.version
    setExpanded(false)
    setPending(true)
    setError('')
    try {
      const result = await window.api.openProjectInApp(folderPath, application)
      if (version === requestVersion.current.version && !result.success) setError(result.error)
    } catch {
      if (version === requestVersion.current.version)
        setError(`无法使用 ${label} 打开项目，请稍后重试。`)
    } finally {
      inFlight.current = false
      if (version === requestVersion.current.version) setPending(false)
    }
  }

  if (!applications.length) return null

  return (
    <div
      ref={container}
      className="git-workspace__open-project"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false)
      }}
    >
      <div className="git-workspace__open-project-buttons">
        <button
          type="button"
          className="git-workspace__open-project-main"
          disabled={pending}
          aria-busy={pending}
          aria-describedby={error ? errorId : undefined}
          title={`使用 ${label} 打开 ${folderPath}`}
          onClick={() => void openProject()}
        >
          {pending ? (
            <span className="git-workspace__spinner" aria-hidden />
          ) : (
            <HiOutlineCommandLine size={16} aria-hidden />
          )}
          {pending
            ? '正在打开…'
            : application === 'terminal'
              ? '使用终端打开'
              : `使用 ${label} 打开`}
        </button>
        <button
          ref={toggle}
          type="button"
          className="git-workspace__open-project-toggle"
          disabled={pending}
          aria-label="选择打开项目的应用"
          aria-haspopup="menu"
          aria-expanded={expanded}
          aria-controls={expanded ? menuId : undefined}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setExpanded(true)
            }
          }}
        >
          <HiChevronDown size={14} aria-hidden />
        </button>
      </div>
      {expanded && (
        <div
          id={menuId}
          className="git-workspace__open-project-menu"
          role="menu"
          aria-label="打开项目的应用"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setExpanded(false)
              toggle.current?.focus()
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
              )
              const current = items.indexOf(document.activeElement as HTMLButtonElement)
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
              items[next]?.focus()
            }
          }}
        >
          {applications.map(({ id, label: itemLabel }) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={id === application}
              tabIndex={id === application ? 0 : -1}
              onClick={() => selectApplication(id)}
            >
              <span>{itemLabel}</span>
              {id === application && <HiCheck size={15} aria-hidden />}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div id={errorId} className="git-workspace__open-project-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
