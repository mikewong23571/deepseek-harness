/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * details), the drag handles (pointer capture + rAF throttle), the concession
 * chain (columns.ts), and the child-slot render decisions: the sidebar slot
 * renders HERE with live parameters from the concession solve, and the
 * session-aware occupants render in fixed column positions; strict entries
 * gate themselves on current-session availability while session-maybe
 * entries retain identity. Pure component: everything arrives
 * through the three framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 *
 * Below the auto-collapse breakpoint the frame switches to the mobile tree:
 * a full-width top header (current session switcher + settings gear), the
 * conversation filling the remaining space (no sidebar rail), and the
 * sidebar content as a dropdown picker under the header (project/session
 * list only — the occupant reads the picker owner prop). The picker is the
 * narrow-expand override (stores.ts narrowExpanded) — the same toggle the
 * rail used — so a manual expand still means "sidebar over the center".
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconChevronDownOutline14, IconSettingsOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import type { LayoutKey } from './locales.ts'
import css from './AppFrame.module.css'

/** Mobile picker geometry: side insets for the dropdown under the header. */
const PICKER_INSET = 12

/** Locale fallback when the entry renders without the locale seat (tests). */
const identityT = (key: LayoutKey): string => key

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & {
    /** Open the settings panel through the layout service (mobile header gear). */
    openSettings: () => void
    /** Standard locale seat for the mobile header copy. */
    t?: (key: LayoutKey) => string
  }

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
  openSettings,
  t = identityT,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const currentTitle = useSessions((s) => {
    const current = s.current
    return current === undefined ? undefined : s.byId[current]?.displayTitle
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: narrow always solves to the full-width
  // chat below, and the override drives only the picker's open attribute.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const pickerOpen = narrow && panels.narrowExpanded
  const sidebarCollapsed = narrow ? !pickerOpen : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  // Mobile: the chat takes the full width and the sidebar rides a fixed
  // dropdown picker under the header (its own geometry in the CSS); desktop
  // keeps the concession chain. The picker always renders wide content, so
  // its collapsed flag stays false while the frame's data attribute keeps
  // reporting the picker as closed.
  const pickerWidth = Math.max(0, viewport - PICKER_INSET * 2)
  const cols = narrow
    ? { sidebar: 0, center: viewport, details: 0 }
    : computeColumns(viewport, sidebarPreference, detailsSession === undefined ? 0 : panels.details)
  const colsRef = useRef(cols)
  colsRef.current = cols

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])

  // Picking a session from the mobile picker closes it: the picker is a
  // picking surface, not a persistent pane — the header switcher reopens it.
  const currentId = useSessions(s => s.current)
  const previousCurrent = useRef(currentId)
  useEffect(() => {
    if (previousCurrent.current === currentId) return
    previousCurrent.current = currentId
    if (pickerOpen) actions.toggleSidebar()
  }, [currentId, pickerOpen, actions])

  const openSettingsFromHeader = useCallback(() => {
    openSettings()
    if (pickerOpen) actions.toggleSidebar()
  }, [openSettings, pickerOpen, actions])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{
        gridTemplateColumns: narrow
          ? '0px minmax(0, 1fr) 0px'
          : `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px`,
        gridTemplateRows: narrow ? 'auto minmax(0, 1fr)' : '100%',
      }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-dragging={dragging || undefined}
      data-narrow={narrow || undefined}
      data-picker-open={pickerOpen || undefined}
    >
      {narrow && (
        <header className={css.mobileHeader}>
          <button
            type="button"
            className={css.sessionSwitcher}
            aria-label={t('session.switcher.label')}
            onClick={() => { actions.toggleSidebar() }}
          >
            <span className={css.sessionSwitcherTitle}>
              {currentTitle ?? t('session.switcher.placeholder')}
            </span>
            <IconChevronDownOutline14 className={css.sessionSwitcherChevron} size={14} />
          </button>
          <button
            type="button"
            className={css.settingsButton}
            aria-label={t('settings.open')}
            onClick={openSettingsFromHeader}
          >
            <IconSettingsOutline16 size={18} />
          </button>
        </header>
      )}
      <div className={css.sidebarCol}>
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). On mobile the column is the dropdown
            picker: it always renders wide content (collapsed stays false)
            and the frame owns its visibility. */}
        {renderSlot('sidebar', {
          collapsed: narrow ? false : sidebarCollapsed,
          width: narrow ? pickerWidth : cols.sidebar,
          picker: narrow,
        })}
      </div>
      {/* The conversation/details pair lives under ONE wrapper in both
          trees: desktop makes the wrapper display:contents so the columns
          stay the grid's items, mobile gives it the row-2 box. The stable
          JSX position means the breakpoint flip never remounts the
          conversation subtree — its DOM nodes, scroll position, and drafts
          survive the resize. Both occupants stay mounted from first paint —
          no loading gate: a bare status line reads worse than the shell's
          own pending rendering. The conversation is session-maybe; the
          strict details entry naturally renders empty while no session is
          current. */}
      <div className={narrow ? css.mobileBody : css.bodyContents}>
        <CenterColumn>{renderSlot('conversation', {})}</CenterColumn>
        <DetailsColumn>{renderSlot('details', {})}</DetailsColumn>
      </div>
      {narrow && (
        <div
          className={css.pickerMask}
          aria-hidden="true"
          onClick={() => { if (pickerOpen) actions.toggleSidebar() }}
        />
      )}
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {!narrow && !sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {!narrow && cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )
}
