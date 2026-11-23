import { useEffect, useRef, useState } from 'react'

/** Grey placeholder shapes shown while data loads (owner, Nov 24: skeleton loading). Screen readers hear one "Loading". */
export function SkeletonLines({ lines = 3, width }: { lines?: number; width?: string }) {
  return (
    <div className="sk-lines" role="status" aria-label="Loading" style={width ? { width } : undefined}>
      {Array.from({ length: lines }, (_, i) => <span key={i} className="sk sk-line" style={{ width: `${[92, 78, 64, 85, 70][i % 5]}%` }} />)}
    </div>
  )
}

/** A page-shaped placeholder: a title, then a few cards. */
export function SkeletonPage({ cards = 2, side = false }: { cards?: number; side?: boolean }) {
  return (
    <div className="sk-page" role="status" aria-label="Loading">
      <span className="sk sk-title" />
      <span className="sk sk-line" style={{ width: '46%' }} />
      <div className={side ? 'sk-split' : ''}>
        <div style={{ display: 'grid', gap: 16 }}>
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="card sk-card"><span className="sk sk-head" /><SkeletonLines lines={3} /></div>
          ))}
        </div>
        {side && <div className="card sk-card"><span className="sk sk-head" /><SkeletonLines lines={4} /></div>}
      </div>
    </div>
  )
}

/** Placeholder table rows. */
export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden={r > 0 ? 'true' : undefined}>
          {Array.from({ length: cols }, (_, c) => <td key={c}><span className="sk sk-line" style={{ width: `${[70, 90, 55, 40][c % 4]}%` }} /></td>)}
        </tr>
      ))}
    </>
  )
}

/** Lazy loading: show `step` items first, then `step` more each time the end of the list scrolls into view. */
export function useLazyCount(total: number, step = 40) {
  const [count, setCount] = useState(step)
  const sentinel = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || count >= total) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(total, c + step))
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [count, total, step])
  return { count: Math.min(count, total), sentinel, more: count < total }
}

/** The row at the end of a lazy list: loads the next part when it scrolls into view. */
export function LoadMore({ sentinel, more, shown, total }: { sentinel: React.RefObject<HTMLDivElement | null>; more: boolean; shown: number; total: number }) {
  if (!more) return null
  return (
    <div ref={sentinel} className="load-more" role="status">
      <span className="sk-dot" aria-hidden="true" /><span className="sk-dot" aria-hidden="true" /><span className="sk-dot" aria-hidden="true" />
      <span className="small muted">Showing {shown} of {total}. Scroll to load more.</span>
    </div>
  )
}
