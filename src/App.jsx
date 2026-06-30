import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRegistry } from './commands.jsx'
import { api, ApiError, getToken, setToken, usernameFromToken, isTokenExpired } from './api.js'

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
  const [prompt, setPrompt] = useState(null) // active interactive prompt: { label, mask, resolve }

  const history = useRef([])
  const histIdx = useRef(-1)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const userRef = useRef(null)
  userRef.current = user
  const promptRef = useRef(null)
  promptRef.current = prompt
  const interactiveRef = useRef(false) // true while a command is mid-prompt sequence

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
      // Interactive TTY-style prompt. Returns the typed value, or null if
      // the user aborted with Ctrl+C / Esc. Masked prompts hide the value.
      ask: (label, opts = {}) =>
        new Promise((resolve) => {
          interactiveRef.current = true
          setInput('')
          setPrompt({ label, mask: !!opts.mask, resolve })
          requestAnimationFrame(() => inputRef.current?.focus())
        }),
    }),
    [push],
  )

  const registry = useMemo(() => createRegistry(io), [io])

  // ---- restore a persisted session from localStorage on load ----
  const restoreSession = useCallback(async () => {
    if (!getToken()) {
      io.out('type `help` for commands · `login` to authenticate.')
      return
    }
    // clear obviously-dead tokens without bothering the network
    if (isTokenExpired()) {
      setToken(null)
      setUser(null)
      io.warn('stored session expired — run `login` to authenticate.')
      return
    }
    // optimistic identity from the JWT, then verify against the backend
    const cached = usernameFromToken()
    if (cached) setUser(cached)
    io.sys(`restoring session${cached ? ` · ${cached}` : ''} — verifying token…`)
    try {
      const me = await api.me()
      const name = me?.username || me?.user || me?.sub || cached || 'user'
      setUser(name)
      io.ok(`session restored. welcome back, ${name}.`)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setToken(null)
        setUser(null)
        io.warn('stored session rejected — run `login` to authenticate.')
      } else {
        // backend unreachable: keep the cached session rather than logging out
        io.dim('could not reach backend — using cached session (run `whoami` later).')
      }
    }
  }, [io])

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
        setBooting(false)
        restoreSession()
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
        interactiveRef.current = false
        setPrompt(null)
        setBusy(false)
      }
    },
    [io, push, registry],
  )

  // ---- interactive prompt resolution ----
  const finishPrompt = (value, { aborted = false } = {}) => {
    const p = promptRef.current
    if (!p) return
    // echo the answered line into scrollback (never reveal a masked value)
    push('promptecho', {
      label: p.label,
      value: aborted ? '^C' : p.mask ? '' : value,
      mask: p.mask,
      aborted,
    })
    setInput('')
    setPrompt(null)
    p.resolve(aborted ? null : value)
  }

  const onKeyDown = (e) => {
    // interactive prompt mode captures input instead of the command line
    if (promptRef.current) {
      if (e.key === 'Enter') {
        e.preventDefault()
        finishPrompt(input)
      } else if (e.key === 'Tab') {
        e.preventDefault()
      } else if ((e.key === 'c' && e.ctrlKey) || e.key === 'Escape') {
        e.preventDefault()
        finishPrompt(null, { aborted: true })
      }
      return
    }

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

        {busy && !prompt && !interactiveRef.current && (
          <div className="line working">
            <Spinner /> working<span className="dots" />
          </div>
        )}

        {!booting && (prompt || !busy) && (
          <div className="line inputline">
            {prompt ? (
              <span className="ps1 prompt-label">{prompt.label}</span>
            ) : (
              <Prompt user={user} />
            )}
            {prompt?.mask ? (
              <span className="maskwrap">
                <input
                  ref={inputRef}
                  className="cmd masked"
                  type="text"
                  name="masked-secret"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  data-1p-ignore
                  autoFocus
                />
                <span className="maskghost" aria-hidden>
                  {'*'.repeat(input.length)}
                  <span className="caret" />
                </span>
              </span>
            ) : (
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
            )}
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
  if (ln.kind === 'promptecho')
    return (
      <div className="line">
        <span className="ps1 prompt-label">{ln.label}</span>
        <span className={ln.aborted ? 'tone-err' : 'echo'}>{ln.value}</span>
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
