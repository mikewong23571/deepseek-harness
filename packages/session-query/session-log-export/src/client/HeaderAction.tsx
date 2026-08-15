import type { ReactNode } from 'react'
import { IconDownloadOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'
import css from './HeaderAction.module.css'

/**
 * Render the Session Header export button and its shared result dialog. The
 * button is icon-only: the tooltip and aria-label carry the localized name,
 * and the button hides on mobile (HeaderAction.module.css), where export is
 * a low-frequency gesture still reachable through the `/export` command.
 * @param props - Session runtime, download controller, and localized dialog copy.
 * @returns the persistent Header action and Session-scoped dialog.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  const { sessionId, useSessionLogDownload, request, t } = props
  const entry = useSessionLogDownload(state => state.bySession[String(sessionId)])
  const busy = entry?.status === 'downloading'

  return (
    <>
      <Tooltip label={t('action.label')} side="bottom" delayMs={500}>
        <button
          type="button"
          className={css.sessionLogButton}
          disabled={busy}
          aria-busy={busy}
          aria-label={t('action.label')}
          onClick={() => { void request(sessionId) }}
        >
          <IconDownloadOutline16 size={16} />
        </button>
      </Tooltip>
      <SessionLogDownloadDialog {...props} />
    </>
  )
}
