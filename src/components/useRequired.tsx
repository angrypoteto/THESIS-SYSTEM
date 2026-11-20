import { useId, useState } from 'react'

/**
 * A required box that turns red when the button is pressed while it is still empty (owner, 2026-11-21: "I don't
 * know what I am not filling up"). Buttons stay clickable; pressing one runs check(): if the box is empty it gets the
 * red style ([aria-invalid] in index.css), its message underneath, and the cursor. Typing clears the mark.
 *
 *   const reason = useRequired(text, 'Write the reason first.')
 *   <textarea {...reason.props} ... />{reason.error}
 *   <button onClick={() => reason.check() && save()}>
 */
export function useRequired(value: string | boolean, message: string) {
  const [tried, setTried] = useState(false)
  const id = useId()
  const missing = typeof value === 'string' ? !value.trim() : !value
  const show = tried && missing
  return {
    /** true when filled; otherwise marks the box red, focuses it and returns false */
    check: () => {
      setTried(true)
      if (missing) document.getElementById(id)?.focus()
      return !missing
    },
    props: { id, 'aria-invalid': show ? true : undefined, 'aria-describedby': show ? `${id}-err` : undefined },
    error: show ? <span id={`${id}-err`} className="field-error" role="alert">{message}</span> : null,
  }
}
