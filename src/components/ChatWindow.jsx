import { useMemo, useEffect, useState, useRef } from 'react'
import { useChat } from '../state/ChatContext'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfjsWorker

function MessageBubble({ message, meName }) {
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
    hours = hours ? hours : 12; // the hour '0' should be '12'
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
    <div className={`bubble ${isMe ? 'me' : 'other'}`} data-message-id={message.id}>
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
              <a href={message.media.url || '#'} download={message.media.name} style={{ color: '#53beb' }}>
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
}

export default function ChatWindow() {
  const { chats, activeChatId, globalUserName, messagesByChatId, isLoadingMessages } = useChat()
  const activeChat = chats.find((c) => c.id === activeChatId)
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1)
  const messagesContainerRef = useRef(null)

  // Helper to format date as WhatsApp style (e.g., Fri, 3 Oct)
  const formatDate = (ts) => {
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
  };

  // Group messages by date string
  const groupMessagesByDate = (messages) => {
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
  };

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

  // Find next/previous search result
  const findNextResult = (direction = 1) => {
    if (filteredMessages.length === 0) return
    
    let newIndex = currentMessageIndex + direction
    if (newIndex >= filteredMessages.length) newIndex = 0
    if (newIndex < 0) newIndex = filteredMessages.length - 1
    
    setCurrentMessageIndex(newIndex)
    
    // Scroll to the message
    const messageElement = document.querySelector(`[data-message-id="${filteredMessages[newIndex].id}"]`)
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      messageElement.style.backgroundColor = '#00b89420'
      setTimeout(() => {
        messageElement.style.backgroundColor = ''
      }, 2000)
    }
  }

  useEffect(() => {
    // Wait for DOM paint before scrolling for big chats
    const scrollToBottom = () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    };
    setTimeout(scrollToBottom, 0);

    // Scroll again after images/media load
    const messagesDiv = messagesContainerRef.current;
    if (messagesDiv) {
      const mediaElements = messagesDiv.querySelectorAll('img, video, audio');
      let loadedCount = 0;
      const handleMediaLoad = () => {
        loadedCount++;
        if (loadedCount === mediaElements.length) {
          scrollToBottom();
        }
      };
      mediaElements.forEach((el) => {
        if (el.complete || el.readyState === 4) {
          loadedCount++;
        } else {
          el.addEventListener('load', handleMediaLoad);
          el.addEventListener('loadeddata', handleMediaLoad);
        }
      });
      // If all media already loaded, scroll immediately
      if (loadedCount === mediaElements.length) {
        scrollToBottom();
      }
      // Cleanup listeners
      return () => {
        mediaElements.forEach((el) => {
          el.removeEventListener('load', handleMediaLoad);
          el.removeEventListener('loadeddata', handleMediaLoad);
        });
      };
    }
    return () => {};
  }, [activeChatId, filteredMessages]);

  return (
    <main className="chat-window" role="main">
      {!activeChat && (
        <div className="empty-state">Select a chat to view messages</div>
      )}
      {activeChat && isLoadingMessages && (
        <div className="loading-state">Loading messages...</div>
      )}
      {activeChat && !isLoadingMessages && (
        <>
          {/* Message Search Bar */}
          <div className="message-search-container">
            <div className="search-grid">
              <div className="search-input-wrapper">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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
                  }}
                />
              </div>
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

          <div className="messages" ref={messagesContainerRef} tabIndex={0} style={{ outline: 'none' }} onMouseDown={(e) => e.stopPropagation()}>
            {filteredMessages.length === 0 && messageSearchQuery ? (
              <div className="empty-state">No messages found for "{messageSearchQuery}"</div>
            ) : filteredMessages.length === 0 && !messageSearchQuery ? (
              <div className="empty-state">No messages available for this chat</div>
            ) : (
              groupMessagesByDate(filteredMessages).map((item) =>
                item.type === 'date' ? (
                  <div
                    key={item.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      margin: '32px 0 16px 0',
                    }}
                  >
                    <span
                      style={{
                        color: '#cfd8dc',
                        fontWeight: 600,
                        fontSize: 16,
                        letterSpacing: 0.5,
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 8,
                        padding: '6px 24px',
                        boxShadow: '0 1px 4px #0002',
                        display: 'inline-block',
                        minWidth: 120,
                        maxWidth: 240,
                        textAlign: 'center',
                      }}
                    >
                      {item.date}
                    </span>
                  </div>
                ) : (
                  <MessageBubble key={item.key} message={item.message} meName={globalUserName} />
                )
              )
            )}
          </div>
        </>
      )}
      <style jsx>{`
        .message-search-container {
          padding: 12px 16px;
          border-bottom: 1px solid #0e171c;
          background: #0f1b21;
        }
        
        .search-grid {
          display: grid;
          grid-template-columns: 1fr auto auto auto auto;
          gap: 12px;
          align-items: center;
        }
        
        .search-input-wrapper {
          position: relative;
          grid-column: 1;
          min-width: 250px;
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
          padding: 10px 12px 10px 36px;
          background: #1f2c33;
          border: 1px solid #0e171c;
          border-radius: 6px;
          color: #cfe2ea;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s ease;
          box-sizing: border-box;
        }
        
        .message-search-input:focus {
          border-color: #00b894;
        }
        
        .message-search-input::placeholder {
          color: #8696a0;
        }
        
        .search-results-info {
          grid-column: 2;
          font-size: 12px;
          color: #8696a0;
          white-space: nowrap;
          min-width: 70px;
          text-align: center;
          padding: 4px 8px;
          background: #1f2c33;
          border-radius: 4px;
          border: 1px solid #0e171c;
        }
        
        .search-nav-btn {
          background: #1f2c33;
          border: 1px solid #0e171c;
          color: #cfe2ea;
          cursor: pointer;
          padding: 0;
          border-radius: 4px;
          font-size: 16px;
          transition: all 0.2s ease;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .prev-btn {
            .messages {
              padding: 24px 4px 4px 4px;
              font-size: 13px;
            }
          grid-column: 4;
        }
        
        .search-nav-btn:hover:not(:disabled) {
          background: #2a3942;
          border-color: #00b894;
        }
        
        .search-nav-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .clear-search {
          grid-column: 5;
          background: #1f2c33;
          border: 1px solid #0e171c;
          color: #8696a0;
          cursor: pointer;
          padding: 0;
          border-radius: 4px;
          font-size: 14px;
          transition: all 0.2s ease;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .clear-search:hover {
          color: #cfe2ea;
          background: #2a3942;
          border-color: #00b894;
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
          .search-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          
          .search-input-wrapper {
            grid-column: 1;
            min-width: auto;
          }
          
          .search-results-info {
            grid-column: 1;
            justify-self: center;
          }
          
          .prev-btn {
            grid-column: 1;
            justify-self: start;
          }
          
          .next-btn {
            grid-column: 1;
            justify-self: center;
          }
          
          .clear-search {
            grid-column: 1;
            justify-self: end;
          }
          
          .search-nav-btn,
          .clear-search {
            width: 32px;
            height: 32px;
            font-size: 14px;
          }
        }
        
        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #8696a0;
          font-size: 14px;
          font-style: italic;
        }
        
        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #8696a0;
          font-size: 14px;
        }
      `}</style>
    </main>
  )
}

function ClickableImage({ src, alt }) {
  const { openMedia, activeChatId } = useChat()
  return <img src={src} alt={alt} onClick={() => openMedia(activeChatId, src)} style={{ cursor: 'zoom-in' }} />
}

function ClickableVideo({ src }) {
  const { openMedia, activeChatId } = useChat()
  return (
    <div onClick={() => openMedia(activeChatId, src)} style={{ cursor: 'zoom-in' }}>
      <video src={src} controls />
    </div>
  )
}

function ClickableAudio({ src }) {
  const { openMedia, activeChatId } = useChat()
  return (
    <div onClick={() => openMedia(activeChatId, src)}>
      <audio src={src} controls />
    </div>
  )
}

function ClickablePdf({ src, name }) {
  const { openMedia, activeChatId } = useChat()
  return (
    <PdfThumbnail src={src} name={name} onClick={() => openMedia(activeChatId, src)} />
  )
}

function PdfThumbnail({ src, name, onClick }) {
  const [thumb, setThumb] = useState(null)
  useEffect(() => {
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
  }, [src])

  return (
    <div onClick={onClick} style={{ cursor: 'zoom-in', display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative', width: 160, borderRadius: 6, overflow: 'hidden', background: '#1f2c33', border: '1px solid #0e171c' }}>
        {thumb ? (
          <img src={thumb} alt={name || 'PDF'} style={{ display: 'block', width: '100%' }} />
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>Loading PDF…</div>
        )}
        <div style={{ position: 'absolute', top: 6, left: 6, background: '#000000a0', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>PDF</div>
      </div>
      <span style={{ color: '#53bdeb', textDecoration: 'underline', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'document.pdf'}</span>
    </div>
  )
}


