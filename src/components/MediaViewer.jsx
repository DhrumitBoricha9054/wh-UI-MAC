import { useEffect, useMemo } from 'react'
import { useChat } from '../state/ChatContext'

export default function MediaViewer() {
  const { viewer, closeMedia, stepMedia } = useChat()

  const current = useMemo(() => {
    if (!viewer.open || !viewer.mediaList || viewer.mediaList.length === 0) return null
    const item = viewer.mediaList[Math.max(0, Math.min(viewer.index, viewer.mediaList.length - 1))]
    return { list: viewer.mediaList, item, index: viewer.index, count: viewer.mediaList.length }
  }, [viewer])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeMedia() }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepMedia(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepMedia(-1) }
    }
    if (viewer.open) {
      document.addEventListener('keydown', onKey, { capture: true })
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey, { capture: true })
      document.body.style.overflow = ''
    }
  }, [viewer.open, closeMedia, stepMedia])

  if (!viewer.open || !current) return null

  return (
    <div
      className="media-viewer-overlay"
      onClick={closeMedia}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); stepMedia(1) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); stepMedia(-1) }
      }}
    >
      <div className="media-viewer" onClick={(e) => e.stopPropagation()}>
        {current.item.type === 'image' && (
          <img src={current.item.url} alt={current.item.name || 'image'} />
        )}
        {current.item.type === 'video' && (
          <video src={current.item.url} controls autoPlay />
        )}
        {current.item.type === 'audio' && (
          <audio src={current.item.url} controls autoPlay />
        )}
        {current.item.type === 'pdf' && (
          <div style={{ width: '80vw', height: '80vh', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <iframe src={current.item.url} title={current.item.name || 'document.pdf'} style={{ width: '100%', height: '100%', background: '#fff', borderRadius: 8 }} />
            <a href={current.item.url} download={current.item.name || 'document.pdf'} style={{ color: '#53bdeb', alignSelf: 'flex-end' }}>Download PDF</a>
          </div>
        )}
      </div>
      <div className="media-viewer-nav">
        <button onClick={(e) => { e.stopPropagation(); stepMedia(-1) }} aria-label="Previous">‹</button>
        <div className="counter">{current.index + 1} / {current.count}</div>
        <button onClick={(e) => { e.stopPropagation(); stepMedia(1) }} aria-label="Next">›</button>
      </div>
      <button className="media-viewer-close" onClick={closeMedia} aria-label="Close">
        ✕
      </button>
    </div>
  )
}


