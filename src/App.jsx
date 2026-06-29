import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRegistry } from './commands.jsx'
import { ApiError, getToken } from './api.js'

const BANNER = String.raw`
░█░█░▀█▀░░░░░█░█░█▀█░█░░░█▀█░█░░░█▀█
░░█░░░█░░▄▄▄░█▄█░█░█░█░░░█░█░█░░░█░█
░░▀░░░▀░░░░░░▀░▀░▀▀▀░▀▀▀░▀▀▀░▀▀▀░▀▀▀
  ╷          ╷ .  .╷ ╷ .  .╷ .╷   .╷
  .          .     ╎ .     ╎  ╎    .
                   .       .  .
`

const BOOT = [
  ['sys', '[ booting wololo-net terminal · v1.0.0 ]'],
  ['ok', '[  ok  ] mounting /dev/phosphor'],
  ['ok', '[  ok  ] establishing uplink → yt-dlp.wololoaeyoyo.com'],
  ['ok', '[  ok  ] loading yt-dlp core · thousands of extractors online'],
  ['ok', '[  ok  ] entropy pool seeded · cookies armed'],
  ['banner', BANNER],
  ['dim', '         downloader terminal · unauthorized access is logged ;)'],
]

let _id = 0
const nextId = () => ++_id

export default function App() {
  const [lines, setLines] = useState([])
  const [input, setInput] = useState('')
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState('green')
  const [busy, setBusy] = useState(false)
  const [booting, setBooting] = useState(true)

  const history = useRef([])
  const histIdx = useRef(-1)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const userRef = useRef(null)
  userRef.current = user

  // ---- output helpers (stable) ----
  const push = useCallback((kind, payload) => {
    setLines((prev) => [...prev, { id: nextId(), kind, ...payload }])
  }, [])

  const io = useMemo(
    () => ({
      out: (text) => push('text', { tone: 'out', text }),
      ok: (text) => push('text', { tone: 'ok', text }),
      err: (text) => push('text', { tone: 'err', text }),
      sys: (text) => push('text', { tone: 'sys', text }),
      warn: (text) => push('text', { tone: 'warn', text }),
      dim: (text) => push('text', { tone: 'dim', text }),
      node: (node) => push('node', { node }),
      clear: () => setLines([]),
      banner: () => push('banner', { text: BANNER }),
      setUser: (u) => setUser(u),
      get user() {
        return userRef.current
      },
      setTheme: (t) => setTheme(t),
    }),
    [push],
  )

  const registry = useMemo(() => createRegistry(io), [io])

  // ---- boot sequence ----
  useEffect(() => {
    let t = 0
    const timers = []
    BOOT.forEach((entry, i) => {
      t += i === 0 ? 120 : entry[0] === 'banner' ? 320 : 200
      timers.push(
        setTimeout(() => {
          if (entry[0] === 'banner') push('banner', { text: entry[1] })
          else push('text', { tone: entry[0], text: entry[1] })
        }, t),
      )
    })
    timers.push(
      setTimeout(() => {
        if (getToken()) io.sys('session token found · run `whoami` to verify identity.')
        io.out('type `help` for commands · `login <user> <pass>` to authenticate.')
        setBooting(false)
      }, t + 260),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- autoscroll + focus ----
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, busy])

  const focusInput = () => {
    if (window.getSelection()?.toString()) return
    inputRef.current?.focus()
  }

  // ---- command execution ----
  const run = useCallback(
    async (raw) => {
      const trimmed = raw.trim()
      push('prompt', { text: raw, user: userRef.current })
      if (!trimmed) return
      history.current.unshift(trimmed)
      histIdx.current = -1

      const tokens = trimmed.split(/\s+/)
      const name = tokens[0].toLowerCase()
      const args = tokens.slice(1)
      const cmd = registry[name]

      if (!cmd) {
        io.err(`command not found: ${name}`)
        io.dim('type `help` for the list of commands.')
        return
      }

      setBusy(true)
      try {
        await cmd.run(args, args.join(' '))
      } catch (e) {
        if (e instanceof ApiError) {
          io.err(`✖ ${e.message}${e.status ? ` [${e.status}]` : ''}`)
        } else {
          io.err(`✖ ${e.message || 'unknown error'}`)
        }
      } finally {
        setBusy(false)
      }
    },
    [io, push, registry],
  )

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (busy) return
      const val = input
      setInput('')
      run(val)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const h = history.current
      if (histIdx.current < h.length - 1) {
        histIdx.current++
        setInput(h[histIdx.current])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histIdx.current > 0) {
        histIdx.current--
        setInput(history.current[histIdx.current])
      } else {
        histIdx.current = -1
        setInput('')
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      autocomplete()
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([])
    }
  }

  const autocomplete = () => {
    const parts = input.split(/\s+/)
    if (parts.length !== 1 || !parts[0]) return
    const frag = parts[0].toLowerCase()
    const names = [...new Set(Object.values(registry).map((c) => c.name))]
    const matches = names.filter((n) => n.startsWith(frag))
    if (matches.length === 1) setInput(matches[0] + ' ')
    else if (matches.length > 1) {
      push('prompt', { text: input, user: userRef.current })
      io.dim(matches.join('   '))
    }
  }

  return (
    <div className={`crt theme-${theme}`} onClick={focusInput}>
      <div className="scanlines" aria-hidden />
      <div className="vignette" aria-hidden />
      <div className="flicker" aria-hidden />

      <header className="titlebar">
        <span className="dot r" />
        <span className="dot y" />
        <span className="dot g" />
        <span className="title">wololo@yt-dlp:~ — zsh</span>
        <span className={`status ${getToken() ? 'auth' : ''}`}>
          {user ? `◉ ${user}` : getToken() ? '◉ session' : '○ guest'}
        </span>
      </header>

      <main className="screen" ref={scrollRef}>
        {lines.map((ln) => (
          <Line key={ln.id} ln={ln} />
        ))}

        {busy && (
          <div className="line working">
            <Spinner /> working<span className="dots" />
          </div>
        )}

        {!booting && !busy && (
          <div className="line inputline">
            <Prompt user={user} />
            <input
              ref={inputRef}
              className="cmd"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              autoFocus
            />
          </div>
        )}
      </main>
    </div>
  )
}

function Line({ ln }) {
  if (ln.kind === 'node') return <div className="line node">{ln.node}</div>
  if (ln.kind === 'banner') return <pre className="banner">{ln.text}</pre>
  if (ln.kind === 'prompt')
    return (
      <div className="line">
        <Prompt user={ln.user} />
        <span className="echo">{ln.text}</span>
      </div>
    )
  return <div className={`line tone-${ln.tone}`}>{ln.text}</div>
}

function Prompt({ user }) {
  return (
    <span className="ps1">
      <span className="ps1-user">{user || 'guest'}</span>
      <span className="ps1-at">@</span>
      <span className="ps1-host">yt-dlp</span>
      <span className="ps1-arrow"> ❯ </span>
    </span>
  )
}

function Spinner() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % frames.length), 80)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <span className="spinner">{frames[i]}</span>
}
