export function parseWhatsAppText(textContent) {
  const normalize = (s) =>
    s
      .replace(/[\u200e\u200f]/g, '') // LTR/RTL marks
      .replace(/[\u00a0\u202f]/g, ' ') // NBSP / NNBSP
      .replace(/[\u2013\u2014]/g, '-') // en dash / em dash → hyphen
  const lines = normalize(textContent).split(/\r?\n/)
  const entries = []

  const patterns = [
    // 12/31/24, 9:41 PM - John Doe: Message
    /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\s+-\s+([^:]+):\s+([\s\S]*)$/i,
    // [12/31/24, 9:41:09 PM] John Doe: Message
    /^\[(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\]\s+([^:]+):\s+([\s\S]*)$/i,
    // 2024-12-31, 21:41 - John Doe: Message (ISO date, 24h)
    /^(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+([^:]+):\s+([\s\S]*)$/
  ]

  for (let raw of lines) {
    const line = raw.trim()
    if (!line) continue
    let match = null
    let used = null
    for (const p of patterns) {
      const m = line.match(p)
      if (m) { match = m; used = p; break }
    }
    if (match) {
      const [, dateStr, timeStr, author, content] = match
      entries.push({
        id: `${entries.length}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: `${dateStr} ${timeStr}`,
        author,
        content,
      })
    } else if (entries.length > 0) {
      entries[entries.length - 1].content += `\n${line}`
    }
  }
  return entries
}

export function inferMediaType(filename) {
  const lower = filename.toLowerCase()
  if (/(\.png|\.jpe?g|\.gif|\.webp)$/.test(lower)) return 'image'
  if (/(\.mp4|\.webm|\.mov|\.m4v)$/.test(lower)) return 'video'
  if (/(\.mp3|\.wav|\.ogg|\.m4a)$/.test(lower)) return 'audio'
  if (/(\.pdf)$/.test(lower)) return 'pdf'
  return 'file'
}


