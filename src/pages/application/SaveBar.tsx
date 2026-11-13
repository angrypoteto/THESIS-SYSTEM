import { useState } from 'react'

export interface SaveState {
  busy: boolean
  message: { kind: 'ok' | 'error'; text: string } | null
  run: (fn: () => Promise<void>) => Promise<void>
  fail: (text: string) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSave(): SaveState {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<SaveState['message']>(null)
  return {
    busy,
    message,
    fail: (text) => setMessage({ kind: 'error', text }),
    run: async (fn) => {
      setBusy(true)
      setMessage(null)
      try {
        await fn()
        setMessage({ kind: 'ok', text: 'Saved.' })
      } catch (e) {
        setMessage({ kind: 'error', text: (e as { message?: string }).message ?? 'Could not save. Try again.' })
      } finally {
        setBusy(false)
      }
    },
  }
}

export function SaveBar({ state, onSave, label = 'Save' }: { state: SaveState; onSave: () => void; label?: string }) {
  return (
    <div className="save-bar">
      <button className="button" onClick={onSave} disabled={state.busy}>
        {state.busy ? 'Saving…' : label}
      </button>
      {state.message && (
        <span className={state.message.kind === 'ok' ? 'success' : 'error'} role="status">
          {state.message.text}
        </span>
      )}
    </div>
  )
}
