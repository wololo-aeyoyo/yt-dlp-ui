// Rich terminal output blocks for command results.

export function VideoInfo({ data }) {
  const meta = [
    ['title', data.title],
    ['uploader', data.uploader],
    ['duration', data.duration_string || (data.duration ? `${data.duration}s` : null)],
    ['views', fmtNum(data.view_count)],
    ['likes', fmtNum(data.like_count)],
    ['uploaded', fmtDate(data.upload_date)],
    ['extractor', data.extractor],
    ['id', data.id],
  ].filter(([, v]) => v != null && v !== '')

  return (
    <div className="card">
      <div className="card-bar">▚ TARGET ACQUIRED ▚</div>
      <div className="info-body">
        {data.thumbnail && (
          <a className="thumb" href={data.thumbnail} target="_blank" rel="noopener">
            <img src={data.thumbnail} alt="" loading="lazy" />
          </a>
        )}
        <div className="kv">
          {meta.map(([k, v]) => (
            <div className="kv-row" key={k}>
              <span className="kv-k">{k.padEnd(10, '·')}</span>
              <span className="kv-v">{String(v)}</span>
            </div>
          ))}
          {data.webpage_url && (
            <div className="kv-row">
              <span className="kv-k">{'source'.padEnd(10, '·')}</span>
              <a className="kv-v link" href={data.webpage_url} target="_blank" rel="noopener">
                {data.webpage_url}
              </a>
            </div>
          )}
        </div>
      </div>
      <div className="formats-head">{data.total_formats} FORMATS</div>
      <FormatsTable formats={data.formats} />
    </div>
  )
}

export function FormatsTable({ formats = [] }) {
  const top = [...formats].sort(byQuality).slice(0, 40)
  return (
    <div className="ftable">
      <div className="ftable-row ftable-head">
        <span className="c-id">id</span>
        <span className="c-ext">ext</span>
        <span className="c-res">resolution</span>
        <span className="c-fps">fps</span>
        <span className="c-av">a/v</span>
        <span className="c-note">note</span>
        <span className="c-size">size</span>
      </div>
      {top.map((f) => (
        <div className="ftable-row" key={f.format_id}>
          <span className="c-id">{f.format_id}</span>
          <span className="c-ext">{f.ext}</span>
          <span className="c-res">{f.resolution || '—'}</span>
          <span className="c-fps">{f.fps ? Math.round(f.fps) : '—'}</span>
          <span className="c-av">
            {f.has_video ? <b className="on">V</b> : <span className="off">·</span>}
            {f.has_audio ? <b className="on">A</b> : <span className="off">·</span>}
          </span>
          <span className="c-note">{f.format_note || (f.vcodec && f.vcodec !== 'none' ? f.vcodec : f.acodec) || ''}</span>
          <span className="c-size">{humanSize(f.filesize || f.filesize_approx)}</span>
        </div>
      ))}
      {formats.length > top.length && (
        <div className="ftable-more">…{formats.length - top.length} more (raw via `info`)</div>
      )}
    </div>
  )
}

export function ResultCard({ data, kind }) {
  const chibi = data.chibisafe || {}
  return (
    <div className="card result">
      <div className="card-bar ok">✔ {kind === 'audio' ? 'AUDIO EXTRACTED' : 'DOWNLOAD COMPLETE'}</div>
      <div className="kv">
        <Row k="title" v={data.title} />
        <Row k="file" v={data.filename} />
        <Row k="size" v={data.file_size_human || humanSize(data.file_size_bytes)} />
        {kind === 'audio' && <Row k="quality" v={data.audio_quality} />}
        {data.mime_type && <Row k="mime" v={data.mime_type} />}
      </div>
      {chibi.url && (
        <a className="grab" href={chibi.url} target="_blank" rel="noopener" download>
          ▶ GRAB FILE :: {chibi.name || 'download'}
        </a>
      )}
    </div>
  )
}

export function HealthCard({ data }) {
  const ok = data?.status === 'ok' || data?.status === 'healthy' || data?.ok === true || data === 'ok'
  return (
    <div className="card">
      <div className={`card-bar ${ok ? 'ok' : 'warn'}`}>
        {ok ? '● SYSTEMS NOMINAL' : '● RESPONSE'}
      </div>
      <pre className="raw">{typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)}</pre>
    </div>
  )
}

function Row({ k, v }) {
  if (v == null || v === '') return null
  return (
    <div className="kv-row">
      <span className="kv-k">{k.padEnd(8, '·')}</span>
      <span className="kv-v">{String(v)}</span>
    </div>
  )
}

function byQuality(a, b) {
  const h = (f) => parseInt(String(f.resolution || '').split('x')[1] || f.height || 0, 10) || 0
  const av = (f) => (f.has_video ? 2 : 0) + (f.has_audio ? 1 : 0)
  return av(b) - av(a) || h(b) - h(a)
}

function humanSize(bytes) {
  if (!bytes) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function fmtNum(n) {
  if (n == null) return null
  return n.toLocaleString('en-US')
}

function fmtDate(d) {
  if (!d || d.length !== 8) return d || null
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}
