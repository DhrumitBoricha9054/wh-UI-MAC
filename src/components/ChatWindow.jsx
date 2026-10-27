import { useMemo, useEffect, useState, useRef, memo, useCallback, forwardRef } from 'react'
import { useChat } from '../state/ChatContext'
import { DeleteByDateButton } from './DeleteByDateModal'
import { Virtuoso } from 'react-virtuoso'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfjsWorker

/* ── Memoized message bubble ── */
const MessageBubble = memo(function MessageBubble({ message, meName, isHighlighted }) {
  const isMe = useMemo(() => {
    if (!meName) return message.author === 'You'
    return message.author.trim().toLowerCase() === meName.trim().toLowerCase()
  }, [message.author, meName])

  // Format timestamp to show only hour:min am/pm
  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const mins = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${mins} ${ampm}`;
  };

  // Remove <attached: ...> from content if still present
  let cleanContent = message.content.replace(/<\s*attached:[^>]+>/gi, '').trim();

  // Make URLs clickable
  const urlRegex = /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)(?![^<]*>)/gi;
  const renderContent = (text) => {
    const parts = [];
    let lastIdx = 0;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(text.slice(lastIdx, match.index));
      }
      parts.push(
        <a
          key={match[0] + match.index}
          href={match[0]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#53bdeb', wordBreak: 'break-all', textDecoration: 'underline' }}
        >
          {match[0]}
        </a>
      );
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
      parts.push(text.slice(lastIdx));
    }
    return parts;
  };

  return (
    <div
      className={`bubble ${isMe ? 'me' : 'other'}`}
      data-message-id={message.id}
      style={isHighlighted ? { backgroundColor: '#00b89420', transition: 'background-color 0.3s ease' } : undefined}
    >
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderContent(cleanContent)}</div>
      {message.media && (
        <div className="media">
          {message.media.type === 'image' && message.media.url && (
            <ClickableImage src={message.media.url} alt={message.media.name} />
          )}
          {message.media.type === 'video' && message.media.url && (
            <ClickableVideo src={message.media.url} />
          )}
          {message.media.type === 'audio' && message.media.url && (
            <ClickableAudio src={message.media.url} />
          )}
          {message.media.type === 'pdf' && message.media.url && (
            <ClickablePdf src={message.media.url} name={message.media.name} />
          )}
          {(!message.media.url || message.media.type === 'file') && (
            <div>
              <a href={message.media.url || '#'} download={message.media.name} style={{ color: '#53bdeb' }}>
                {message.media.name || 'attachment'}
              </a>
            </div>
          )}
        </div>
      )}
      <div className={`meta ${isMe ? 'me' : 'other'}`}>
        <span>{message.author}</span>
        <span>•</span>
        <span>{formatTime(message.timestamp)}</span>
      </div>
    </div>
  )
})

/* ── Custom Scroller with wallpaper background ── */
const ChatScroller = forwardRef(function ChatScroller(props, ref) {
  return (
    <div
      {...props}
      ref={ref}
      className="messages chat-wallpaper"
      style={{
        ...props.style,
        outline: 'none',
      }}
      tabIndex={0}
    />
  )
})

/* ── Custom List wrapper ── */
const ChatListWrapper = forwardRef(function ChatListWrapper(props, ref) {
  return (
    <div
      {...props}
      ref={ref}
      style={{
        ...props.style,
      }}
    />
  )
})

/* ── Custom Item wrapper preserving flex column layout for bubble alignment ── */
const ChatItemContent = forwardRef(function ChatItemContent(props, ref) {
  return (
    <div
      {...props}
      ref={ref}
      style={{
        ...props.style,
        display: 'flex',
        flexDirection: 'column',
        padding: '2px 16px',
      }}
    />
  )
})

/* ── Main Chat Window ── */
export default function ChatWindow() {
  const { chats, activeChatId, globalUserName, messagesByChatId, isLoadingMessages, openDeleteByDateModal } = useChat()
  const activeChat = chats.find((c) => c.id === activeChatId)
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [floatingDate, setFloatingDate] = useState(null)
  const [showFloatingDate, setShowFloatingDate] = useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const virtuosoRef = useRef(null)
  const floatingDateTimeoutRef = useRef(null)

  // Helper to format date as WhatsApp style (e.g., Fri, 3 Oct)
  const formatDate = useCallback((ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    ) {
      return 'Today';
    }
    if (
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()
    ) {
      return 'Yesterday';
    }
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  }, []);

  // Group messages by date string
  const groupMessagesByDate = useCallback((messages) => {
    const groups = [];
    let lastDate = null;
    messages.forEach((msg) => {
      const dateStr = formatDate(msg.timestamp);
      if (dateStr !== lastDate) {
        groups.push({ type: 'date', date: dateStr, key: `date-${dateStr}-${msg.id}` });
        lastDate = dateStr;
      }
      groups.push({ type: 'msg', message: msg, key: msg.id });
    });
    return groups;
  }, [formatDate]);

  // Filter messages based on search query
  const filteredMessages = useMemo(() => {
    const activeMessages = messagesByChatId[activeChatId] || []
    if (!activeChat || !messageSearchQuery.trim()) return activeMessages

    const query = messageSearchQuery.toLowerCase()
    return activeMessages.filter(msg =>
      msg.content.toLowerCase().includes(query) ||
      msg.author.toLowerCase().includes(query)
    )
  }, [activeChat, messageSearchQuery, messagesByChatId, activeChatId])

  // Grouped items for virtuoso
  const groupedItems = useMemo(() => {
    return groupMessagesByDate(filteredMessages)
  }, [filteredMessages, groupMessagesByDate])

  // Track floating date from visible range
  const handleRangeChanged = useCallback(({ startIndex }) => {
    // Find the most recent date separator at or before startIndex
    for (let i = startIndex; i >= 0; i--) {
      if (groupedItems[i]?.type === 'date') {
        setFloatingDate(groupedItems[i].date)
        break
      }
    }

    // Show floating date briefly on scroll
    setShowFloatingDate(true)
    if (floatingDateTimeoutRef.current) {
      clearTimeout(floatingDateTimeoutRef.current)
    }
    floatingDateTimeoutRef.current = setTimeout(() => {
      setShowFloatingDate(false)
    }, 1500)
  }, [groupedItems])

  // Find next/previous search result
  const findNextResult = useCallback((direction = 1) => {
    if (filteredMessages.length === 0) return

    let newIndex = currentMessageIndex + direction
    if (newIndex >= filteredMessages.length) newIndex = 0
    if (newIndex < 0) newIndex = filteredMessages.length - 1

    setCurrentMessageIndex(newIndex)

    // Find the message in groupedItems
    const targetMsg = filteredMessages[newIndex]
    const groupedIndex = groupedItems.findIndex(
      item => item.type === 'msg' && item.message.id === targetMsg.id
    )

    if (groupedIndex >= 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: groupedIndex,
        align: 'center',
        behavior: 'smooth'
      })

      // Highlight the message temporarily
      setHighlightedMessageId(targetMsg.id)
      setTimeout(() => {
        setHighlightedMessageId(null)
      }, 2000)
    }
  }, [filteredMessages, currentMessageIndex, groupedItems])

  // Auto-clear highlight
  useEffect(() => {
    return () => {
      if (floatingDateTimeoutRef.current) {
        clearTimeout(floatingDateTimeoutRef.current)
      }
    }
  }, [])

  // Reset search state when chat changes
  useEffect(() => {
    setMessageSearchQuery('')
    setCurrentMessageIndex(-1)
    setIsSearchOpen(false)
    setHighlightedMessageId(null)
  }, [activeChatId])

  // Render each item in the virtuoso list
  const itemContent = useCallback((index, item) => {
    if (item.type === 'date') {
      return (
        <div className="date-separator-virtual" data-date={item.date}>
          <span className="date-text">{item.date}</span>
        </div>
      )
    }
    return (
      <MessageBubble
        message={item.message}
        meName={globalUserName}
        isHighlighted={item.message.id === highlightedMessageId}
      />
    )
  }, [globalUserName, highlightedMessageId])

  // Compute item key for stable rendering
  const computeItemKey = useCallback((index, item) => {
    return item?.key || index
  }, [])

  return (
    <main className="chat-window" role="main">
      {!activeChat && (
        <div className="empty-state-full">
          <div className="empty-state-icon">
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="#00a884" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            </svg>
          </div>
          <div className="empty-state-title">WhatsApp Chat Viewer</div>
          <div className="empty-state-subtitle">Select a chat from the sidebar to view messages.<br />Import a ZIP export to get started.</div>
        </div>
      )}
      {activeChat && isLoadingMessages && (
        <div className="loading-chat-state">
          <div className="chat-loading-spinner"></div>
          <span>Loading messages...</span>
        </div>
      )}

      {activeChat && !isLoadingMessages && (
        <>
          {/* Message Search Bar - collapsible on mobile */}
          <div className={`message-search-container ${isSearchOpen ? 'search-open' : ''}`}>
            <div className="search-grid">
              <button
                className="search-toggle-btn"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                aria-label="Toggle search"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <div className="search-input-wrapper">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  placeholder="Search in this chat..."
                  value={messageSearchQuery}
                  onChange={(e) => setMessageSearchQuery(e.target.value)}
                  className="message-search-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (e.shiftKey) findNextResult(-1)
                      else findNextResult(1)
                    }
                    if (e.key === 'Escape') {
                      setMessageSearchQuery('')
                      setCurrentMessageIndex(-1)
                      setIsSearchOpen(false)
                    }
                  }}
                />
              </div>
              <DeleteByDateButton onClick={openDeleteByDateModal} />
              {messageSearchQuery && (
                <>
                  <div className="search-results-info">
                    {filteredMessages.length > 0 ? (
                      <span>{currentMessageIndex + 1} of {filteredMessages.length}</span>
                    ) : (
                      <span>No results</span>
                    )}
                  </div>
                  <button
                    onClick={() => findNextResult(-1)}
                    className="search-nav-btn prev-btn"
                    disabled={filteredMessages.length === 0}
                    title="Previous (Shift+Enter)"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => findNextResult(1)}
                    className="search-nav-btn next-btn"
                    disabled={filteredMessages.length === 0}
                    title="Next (Enter)"
                  >
                    ›
                  </button>
                  <button
                    onClick={() => {
                      setMessageSearchQuery('')
                      setCurrentMessageIndex(-1)
                    }}
                    className="clear-search"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="virtuoso-container" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {/* Floating date badge */}
            {floatingDate && (
              <div className={`floating-date-badge ${showFloatingDate ? 'visible' : ''}`}>
                <span className="date-text">{floatingDate}</span>
              </div>
            )}

            {groupedItems.length === 0 && messageSearchQuery ? (
              <div className="empty-messages">No messages found for "{messageSearchQuery}"</div>
            ) : groupedItems.length === 0 && !messageSearchQuery ? (
              <div className="empty-messages">No messages available for this chat</div>
            ) : (
              <Virtuoso
                ref={virtuosoRef}
                data={groupedItems}
                initialTopMostItemIndex={groupedItems.length - 1}
                followOutput="smooth"
                rangeChanged={handleRangeChanged}
                itemContent={itemContent}
                computeItemKey={computeItemKey}
                components={{
                  Scroller: ChatScroller,
                  List: ChatListWrapper,
                  Item: ChatItemContent,
                }}
                increaseViewportBy={{ top: 200, bottom: 200 }}
              />
            )}
          </div>
        </>
      )}
      <style jsx>{`
        /* Empty state - full screen */
        .empty-state-full {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #8696a0;
          text-align: center;
          padding: 32px;
          background: radial-gradient(ellipse at center, rgba(0, 168, 132, 0.03) 0%, transparent 70%);
        }
        .empty-state-icon {
          margin-bottom: 16px;
          animation: float 3s ease-in-out infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .empty-state-title {
          font-size: 22px;
          font-weight: 600;
          color: #e9edef;
          margin-bottom: 8px;
        }
        .empty-state-subtitle {
          font-size: 14px;
          line-height: 1.6;
          color: #8696a0;
          max-width: 340px;
        }

        /* Loading state */
        .loading-chat-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          gap: 16px;
          color: #8696a0;
          font-size: 14px;
        }
        .chat-loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #1f2c33;
          border-top: 3px solid #00a884;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .empty-messages {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #8696a0;
          font-size: 14px;
        }

        /* Virtuoso container */
        .virtuoso-container {
          display: flex;
          flex-direction: column;
        }

        /* WhatsApp wallpaper pattern */
        .chat-wallpaper {
          background-color: #0b141a;
          background-image:
            radial-gradient(circle at 20% 50%, rgba(0, 168, 132, 0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(0, 168, 132, 0.02) 0%, transparent 40%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }

        /* Floating date badge */
        .floating-date-badge {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 15;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }
        .floating-date-badge.visible {
          opacity: 1;
        }
        .floating-date-badge .date-text {
          color: rgba(225, 225, 225, 0.85);
          font-weight: 500;
          font-size: 12.5px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
          background: rgba(18, 28, 34, 0.92);
          border-radius: 7px;
          padding: 5px 16px;
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
          display: inline-block;
          backdrop-filter: blur(8px);
        }

        /* Date separator inside virtualized list */
        .date-separator-virtual {
          display: flex;
          justify-content: center;
          padding: 8px 0;
          margin: 12px 0 4px 0;
        }
        
        .date-separator-virtual .date-text {
          color: rgba(225, 225, 225, 0.85);
          font-weight: 500;
          font-size: 12.5px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
          background: rgba(18, 28, 34, 0.85);
          border-radius: 7px;
          padding: 5px 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
          display: inline-block;
        }

        /* Search Container */
        .message-search-container {
          padding: 8px 12px;
          border-bottom: 1px solid rgba(14, 23, 28, 0.8);
          background: var(--panel-2, #1f2c33);
        }

        .search-toggle-btn {
          display: none;
        }
        
        .search-grid {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        
        .search-input-wrapper {
          position: relative;
          flex: 1;
          min-width: 0;
        }
        
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #8696a0;
          pointer-events: none;
          z-index: 1;
        }
        
        .message-search-input {
          width: 100%;
          padding: 8px 12px 8px 36px;
          background: #111b21;
          border: 1px solid rgba(134, 150, 160, 0.15);
          border-radius: 8px;
          color: #cfe2ea;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s ease;
          box-sizing: border-box;
        }
        
        .message-search-input:focus {
          border-color: #00a884;
        }
        
        .message-search-input::placeholder {
          color: #8696a0;
        }
        
        .search-results-info {
          font-size: 12px;
          color: #8696a0;
          white-space: nowrap;
          padding: 4px 8px;
          background: #111b21;
          border-radius: 6px;
          border: 1px solid rgba(134, 150, 160, 0.15);
        }
        
        .search-nav-btn {
          background: #111b21;
          border: 1px solid rgba(134, 150, 160, 0.15);
          color: #cfe2ea;
          cursor: pointer;
          padding: 0;
          border-radius: 6px;
          font-size: 16px;
          transition: all 0.15s ease;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .search-nav-btn:hover:not(:disabled) {
          background: #2a3942;
          border-color: #00a884;
        }
        
        .search-nav-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        
        .clear-search {
          background: #111b21;
          border: 1px solid rgba(134, 150, 160, 0.15);
          color: #8696a0;
          cursor: pointer;
          padding: 0;
          border-radius: 6px;
          font-size: 13px;
          transition: all 0.15s ease;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .clear-search:hover {
          color: #cfe2ea;
          background: #2a3942;
          border-color: #00a884;
        }
        
        /* Mobile search: collapsible */
        @media (max-width: 768px) {
          .message-search-container {
            padding: 6px 12px;
          }
          .search-toggle-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: none;
            color: #8696a0;
            cursor: pointer;
            padding: 6px;
            border-radius: 50%;
            transition: background 0.15s ease;
          }
          .search-toggle-btn:hover {
            background: rgba(134, 150, 160, 0.15);
          }
          .message-search-container:not(.search-open) .search-input-wrapper,
          .message-search-container:not(.search-open) .search-results-info,
          .message-search-container:not(.search-open) .search-nav-btn,
          .message-search-container:not(.search-open) .clear-search {
            display: none;
          }
          .message-search-container.search-open .search-toggle-btn {
            display: none;
          }
          .message-search-container.search-open {
            padding: 8px 12px;
          }
        }
      `}</style>
    </main>
  )
}

function ClickableImage({ src, alt }) {
  const { openMedia, activeChatId } = useChat()
  return <img src={src} alt={alt} loading="lazy" onClick={() => openMedia(activeChatId, src)} style={{ cursor: 'zoom-in' }} />
}

function ClickableVideo({ src }) {
  const { openMedia, activeChatId } = useChat()
  return (
    <div onClick={() => openMedia(activeChatId, src)} style={{ cursor: 'zoom-in' }}>
      <video src={src} controls preload="none" />
    </div>
  )
}

function ClickableAudio({ src }) {
  const { openMedia, activeChatId } = useChat()
  return (
    <div onClick={() => openMedia(activeChatId, src)}>
      <audio src={src} controls preload="none" />
    </div>
  )
}

function ClickablePdf({ src, name }) {
  const { openMedia, activeChatId } = useChat()
  return (
    <LazyPdfThumbnail src={src} name={name} onClick={() => openMedia(activeChatId, src)} />
  )
}

/* ── Lazy PDF thumbnail: only renders when visible ── */
function LazyPdfThumbnail({ src, name, onClick }) {
  const [isVisible, setIsVisible] = useState(false)
  const [thumb, setThumb] = useState(null)
  const containerRef = useRef(null)

  // Observe visibility
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Render thumbnail only when visible
  useEffect(() => {
    if (!isVisible) return
    let cancelled = false
    async function renderThumb() {
      try {
        const loadingTask = getDocument(src)
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1 })
        const targetWidth = 160
        const scale = targetWidth / viewport.width
        const scaled = page.getViewport({ scale: scale })
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = Math.floor(scaled.width)
        canvas.height = Math.floor(scaled.height)
        await page.render({ canvasContext: ctx, viewport: scaled }).promise
        if (!cancelled) setThumb(canvas.toDataURL('image/png'))
      } catch {
        if (!cancelled) setThumb(null)
      }
    }
    renderThumb()
    return () => { cancelled = true }
  }, [src, isVisible])

  return (
    <div ref={containerRef} onClick={onClick} style={{ cursor: 'zoom-in', display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative', width: 160, borderRadius: 6, overflow: 'hidden', background: '#1f2c33', border: '1px solid #0e171c' }}>
        {thumb ? (
          <img src={thumb} alt={name || 'PDF'} style={{ display: 'block', width: '100%' }} />
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>
            {isVisible ? 'Loading PDF…' : '📄 PDF'}
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, left: 6, background: '#000000a0', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>PDF</div>
      </div>
      <span style={{ color: '#53bdeb', textDecoration: 'underline', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'document.pdf'}</span>
    </div>
  )
}
