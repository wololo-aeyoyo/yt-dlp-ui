import { api, setToken, getToken } from './api.js'
import { VideoInfo, ResultCard, HealthCard, FormatsTable } from './components.jsx'

const AUDIO_QUALITIES = ['96k', '128k', '192k', '320k']

// Build the command registry. `io` provides output + state helpers from App.
export function createRegistry(io) {
  const commands = {}

  const def = (spec) => {
    commands[spec.name] = spec
    for (const a of spec.aliases || []) commands[a] = spec
  }

  def({
    name: 'help',
    desc: 'list available commands',
    usage: 'help [command]',
    run: (args) => {
      if (args[0] && commands[args[0]]) {
        const c = commands[args[0]]
        io.out(`  ${c.name}  —  ${c.desc}`)
        io.dim(`  usage: ${c.usage}`)
        return
      }
      io.node(<HelpTable />)
    },
  })

  def({
    name: 'register',
    desc: 'create a new account and sign in',
    usage: 'register   (prompts for username + password)',
    run: async (args) => {
      let u = args[0]
      let p = args[1]
      if (!u) u = (await io.ask('new username: '))?.trim()
      if (!u) return io.warn('register: aborted.')
      if (!p) {
        p = await io.ask('new password: ', { mask: true })
        if (p == null) return io.warn('register: aborted.')
        const confirm = await io.ask('retype new password: ', { mask: true })
        if (confirm == null) return io.warn('register: aborted.')
        if (p !== confirm) return io.err('passwords do not match — nothing changed.')
      }
      if (!p) return io.warn('register: aborted.')
      if (p.length < 8) return io.err('password must be at least 8 characters.')
      io.sys(`creating account "${u}"...`)
      const r = await api.register(u, p)
      setToken(r.access_token)
      io.setUser(u)
      io.ok(`account created. authenticated as ${u}.`)
    },
  })

  def({
    name: 'login',
    desc: 'authenticate and store a session token',
    usage: 'login   (prompts for username + password)',
    run: async (args) => {
      let u = args[0]
      let p = args[1]
      if (!u) u = (await io.ask('login: '))?.trim()
      if (!u) return io.warn('login: aborted.')
      if (!p) p = await io.ask('password: ', { mask: true })
      if (!p) return io.warn('login: aborted.')
      io.sys(`authenticating ${u}...`)
      const r = await api.login(u, p)
      setToken(r.access_token)
      io.setUser(u)
      io.ok(`access granted. welcome, ${u}.`)
    },
  })

  def({
    name: 'whoami',
    desc: 'show the currently authenticated user',
    usage: 'whoami',
    run: async () => {
      if (!getToken()) return io.err('not authenticated — run `login`')
      const me = await api.me()
      const name = me?.username || me?.user || io.user || 'unknown'
      io.out(typeof me === 'object' ? JSON.stringify(me) : String(me))
      io.setUser(name)
    },
  })

  def({
    name: 'logout',
    desc: 'destroy the local session token',
    usage: 'logout',
    run: () => {
      setToken(null)
      io.setUser(null)
      io.warn('session terminated. token wiped.')
    },
  })

  def({
    name: 'health',
    desc: 'ping the backend service',
    usage: 'health',
    run: async () => {
      io.sys('pinging backend...')
      const r = await api.health()
      io.node(<HealthCard data={r} />)
    },
  })

  def({
    name: 'info',
    aliases: ['inspect'],
    desc: 'fetch metadata + available formats for a URL',
    usage: 'info <url>',
    run: async (args) => {
      const url = args[0]
      if (!url) return io.err('usage: info <url>')
      io.sys(`probing ${url} ...`)
      const data = await api.info(url)
      io.node(<VideoInfo data={data} />)
      io.dim(`tip: download a specific stream with \`dl ${url} <format_id>\``)
    },
  })

  def({
    name: 'formats',
    desc: 'list only the downloadable formats for a URL',
    usage: 'formats <url>',
    run: async (args) => {
      const url = args[0]
      if (!url) return io.err('usage: formats <url>')
      io.sys(`enumerating streams for ${url} ...`)
      const data = await api.info(url)
      io.out(`${data.total_formats} formats // ${data.title}`)
      io.node(<FormatsTable formats={data.formats} />)
    },
  })

  def({
    name: 'download',
    aliases: ['dl', 'get'],
    desc: 'download a video (uploads to chibisafe, returns a link)',
    usage: 'download <url> [format_id]',
    run: async (args) => {
      const [url, formatId] = args
      if (!url) return io.err('usage: download <url> [format_id]')
      io.sys(`requesting download${formatId ? ` [fmt ${formatId}]` : ''}...`)
      io.sys('this can take a while — yt-dlp is fetching + remuxing.')
      const r = await api.download(url, formatId)
      io.node(<ResultCard data={r} kind="video" />)
    },
  })

  def({
    name: 'mp3',
    aliases: ['convert', 'audio'],
    desc: 'extract audio and convert to mp3',
    usage: 'mp3 <url> [96k|128k|192k|320k]',
    run: async (args) => {
      const [url, q] = args
      if (!url) return io.err('usage: mp3 <url> [96k|128k|192k|320k]')
      if (q && !AUDIO_QUALITIES.includes(q))
        return io.err(`invalid quality "${q}" — choose: ${AUDIO_QUALITIES.join(', ')}`)
      io.sys(`extracting audio${q ? ` @ ${q}` : ''}...`)
      const r = await api.convert(url, q)
      io.node(<ResultCard data={r} kind="audio" />)
    },
  })

  def({
    name: 'stream',
    desc: 'download a video straight to your browser (no chibisafe)',
    usage: 'stream <url> [format_id]',
    run: async (args) => {
      const [url, formatId] = args
      if (!url) return io.err('usage: stream <url> [format_id]')
      io.sys('streaming bytes to browser... hold tight.')
      const res = await api.stream(url, formatId)
      const blob = await res.blob()
      const name = filenameFromResponse(res) || 'download.mp4'
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000)
      io.ok(`saved ${name} (${humanSize(blob.size)}) to your downloads.`)
    },
  })

  def({
    name: 'clear',
    aliases: ['cls'],
    desc: 'wipe the screen',
    usage: 'clear',
    run: () => io.clear(),
  })

  def({
    name: 'banner',
    aliases: ['logo'],
    desc: 'reprint the boot banner',
    usage: 'banner',
    run: () => io.banner(),
  })

  def({
    name: 'theme',
    desc: 'switch phosphor color: green | amber | ice',
    usage: 'theme <green|amber|ice>',
    run: (args) => {
      const t = args[0]
      const themes = ['green', 'amber', 'ice']
      if (!themes.includes(t)) return io.err(`usage: theme <${themes.join('|')}>`)
      io.setTheme(t)
      io.ok(`phosphor set to ${t}.`)
    },
  })

  def({
    name: 'sites',
    desc: 'open the list of yt-dlp supported sites',
    usage: 'sites',
    run: () => {
      const url = 'https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md'
      window.open(url, '_blank', 'noopener')
      io.out(`opened: ${url}`)
    },
  })

  return commands
}

function HelpTable() {
  const rows = [
    ['login', 'authenticate (prompts you)'],
    ['register', 'create an account (prompts you)'],
    ['whoami', 'show current user'],
    ['logout', 'destroy session'],
    ['info <url>', 'metadata + formats'],
    ['formats <url>', 'list streams only'],
    ['dl <url> [fmt]', 'download video → link'],
    ['mp3 <url> [q]', 'convert to mp3 → link'],
    ['stream <url> [fmt]', 'download to browser'],
    ['health', 'ping backend'],
    ['sites', 'supported sites'],
    ['theme <name>', 'green | amber | ice'],
    ['clear', 'wipe screen'],
    ['banner', 'reprint banner'],
    ['help [cmd]', 'this list'],
  ]
  return (
    <div className="help">
      <div className="help-head">AVAILABLE COMMANDS</div>
      <div className="help-grid">
        {rows.map(([cmd, desc]) => (
          <div className="help-row" key={cmd}>
            <span className="help-cmd">{cmd}</span>
            <span className="help-desc">{desc}</span>
          </div>
        ))}
      </div>
      <div className="help-foot">↑/↓ history · tab autocomplete · ctrl+l clears</div>
    </div>
  )
}

function filenameFromResponse(res) {
  const cd = res.headers.get('content-disposition')
  if (!cd) return null
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd)
  return m ? decodeURIComponent(m[1]) : null
}

function humanSize(bytes) {
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(1)} ${u[i]}`
}
