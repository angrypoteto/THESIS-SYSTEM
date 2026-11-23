import { useEffect, useState } from 'react'
import { LoadMore, useLazyCount } from '../components/Skeleton'
import { SkeletonLines } from '../components/Skeleton'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Note { id: number; title: string; body: string; link: string | null; created_at: string; read_at: string | null }

/** Every notice from the office in one list, newest first (redesign, Nov 24). Opening the page marks them as read. */
export function Messages() {
  const [notes, setNotes] = useState<Note[] | null>(null)
  useEffect(() => {
    let live = true
    supabase.from('notifications').select('id,title,body,link,created_at,read_at').order('created_at', { ascending: false }).limit(100)
      .then(async ({ data }) => {
        if (!live) return
        const list = (data as Note[]) ?? []
        setNotes(list)
        const unread = list.filter((n) => !n.read_at).map((n) => n.id)
        if (unread.length) {
          await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread)
          window.dispatchEvent(new Event('messages-read'))
        }
      })
    return () => {
      live = false
    }
  }, [])
  const route = (link: string | null) => (link ? link.replace(/^#/, '') : null)

  const lazy = useLazyCount((notes?.length ?? 0), 40)
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p>Every notice from the Mandaluyong Educational Service Office, newest first. The exam schedule, passing the exam, the interview schedule and requests for a clearer copy are also sent to your email.</p>
        </div>
      </div>
      <section className="card" aria-label="Messages" style={{ padding: 0, overflow: 'hidden' }}>
        {notes == null && <div style={{ padding: 22 }}><SkeletonLines lines={6} /></div>}
        {notes?.length === 0 && (
          <div className="moment"><h2 style={{ margin: 0 }}>No messages yet</h2><p>When the office checks your documents or schedules your exam or interview, the notice appears here.</p></div>
        )}
        {notes?.slice(0, lazy.count).map((n) => (
          <article key={n.id} className={`msg ${n.read_at ? '' : 'unread'}`}>
            <div className="msg-head">
              <b>{!n.read_at && <span className="msg-dot" aria-label="New" />}{n.title}</b>
              <time className="small muted" dateTime={n.created_at}>{new Date(n.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
            </div>
            <p>{n.body}</p>
            {route(n.link) && <Link className="btn btn-plain small" to={route(n.link)!}>Open</Link>}
          </article>
        ))}
      
          <LoadMore sentinel={lazy.sentinel} more={lazy.more} shown={lazy.count} total={(notes?.length ?? 0)} /></section>
    </>
  )
}
