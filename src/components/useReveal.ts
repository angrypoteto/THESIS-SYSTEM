import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const TARGETS = '.card, .stat, .do-now, .cert, .hero2-text, .glass-path, .cycle-card, .msg, .next-step, .profile-save'

/**
 * Scroll animation (owner, Nov 24): cards below the screen fade and rise into place when they scroll into view.
 * Anything already on screen is left alone, so nothing waits to appear; with reduced motion nothing animates.
 */
export function useReveal() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.classList.add('reveal-in')
        io.unobserve(e.target)
      }
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 })
    const seen = new WeakSet<Element>()
    const scan = () => {
      document.querySelectorAll(TARGETS).forEach((el) => {
        if (seen.has(el) || el.closest('.drawer, .action-bar, .scroll-box')) return
        seen.add(el)
        // only what starts below the screen is animated
        if (el.getBoundingClientRect().top < window.innerHeight) return
        el.classList.add('reveal')
        io.observe(el)
      })
    }
    // a fast scroll or a jump can skip over a card without it ever "entering" the screen: show everything that is
    // now above the bottom edge, so nothing stays invisible
    let raf = 0
    const sweep = () => {
      raf = 0
      document.querySelectorAll('.reveal:not(.reveal-in)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) { el.classList.add('reveal-in'); io.unobserve(el) }
      })
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(sweep) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    scan()
    const mo = new MutationObserver(() => scan())
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pathname])
}
