# yt-dlp // terminal

A Hollywood-hacker, zsh-style CRT terminal frontend for the
[yt-dlp backend](https://yt-dlp.wololoaeyoyo.com). Built with React + Vite.

Green phosphor, scanlines, flicker, blinking caret — drive the whole downloader
by typing commands.

## Run

```bash
npm install
npm run dev      # http://localhost:1337
```

`npm run build` produces a static bundle in `dist/`.

### CORS / proxy

In dev, all `/api/*` requests are proxied to `https://yt-dlp.wololoaeyoyo.com`
(see `vite.config.js`) so the browser never hits CORS. For a production deploy,
either put the static build behind a reverse proxy that forwards `/api`, or set
`VITE_API_BASE=https://yt-dlp.wololoaeyoyo.com` at build time (requires the
backend to send CORS headers).

## Commands

| command | what it does |
|---|---|
| `login <user> <pass>` | authenticate, token stored in localStorage |
| `register <user> <pass>` | create account (password ≥ 8 chars) |
| `whoami` / `logout` | session info / wipe token |
| `info <url>` | metadata + available formats |
| `formats <url>` | just the stream table |
| `dl <url> [format_id]` | download → returns a chibisafe link |
| `mp3 <url> [96k\|128k\|192k\|320k]` | extract audio as mp3 → link |
| `stream <url> [format_id]` | download straight into your browser |
| `health` · `sites` · `theme <green\|amber\|ice>` · `clear` · `help` | utilities |

Keys: `↑/↓` history · `Tab` autocomplete · `Ctrl+L` clear.

## Notes

- Auth is JWT Bearer, persisted in `localStorage` under `ytdlp.jwt`.
- The backend's `/api/auth/register` was observed returning **HTTP 500** server-side;
  the UI surfaces that error rather than failing silently. Use `login` with an
  existing account if registration is down.
