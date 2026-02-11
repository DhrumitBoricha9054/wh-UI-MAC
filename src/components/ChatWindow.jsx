import { useMemo, useEffect, useLayoutEffect, useState, useRef } from 'react'
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
  const [stuckDateKey, setStuckDateKey] = useState(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const messagesContainerRef = useRef(null)
  const dateElementsRef = useRef(new Map())

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

  // Track which date should be stuck at top
  useEffect(() => {
    const messagesDiv = messagesContainerRef.current;
    if (!messagesDiv || filteredMessages.length === 0) {
      setStuckDateKey(null);
      // Clear all stuck-original classes
      dateElementsRef.current.forEach((el) => {
        if (el) el.classList.remove('stuck-original');
      });
      return;
    }

    const updateStuckDate = () => {
      const container = messagesContainerRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      const containerRect = container.getBoundingClientRect();

      // Get all date elements and their positions, sorted by position
      const dateEntries = Array.from(dateElementsRef.current.entries())
        .map(([dateKey, element]) => {
          if (!element) return null;
          const elementRect = element.getBoundingClientRect();
          const elementTop = element.offsetTop; // Original position in the document
          return { dateKey, element, elementTop, elementRect };
        })
        .filter(Boolean)
        .sort((a, b) => a.elementTop - b.elementTop);

      // Find the last date that has scrolled past the top (should be stuck)
      let stuckKey = null;
      for (const { dateKey, elementTop } of dateEntries) {
        // If the original position has scrolled past the top, this date should be stuck
        if (elementTop <= scrollTop + 50) {
          stuckKey = dateKey;
        } else {
          break;
        }
      }

      setStuckDateKey(stuckKey);

      // Update visibility: hide original content when stuck and original position is scrolled past
      dateEntries.forEach(({ dateKey, element, elementTop, elementRect }) => {
        if (dateKey === stuckKey) {
          // Check if the original position is above the viewport
          // When elementTop < scrollTop, the original position has scrolled past
          // When elementRect.top is near containerRect.top, it's stuck at the top
          const isOriginalScrolledPast = elementTop < scrollTop - 10;
          const isStuckAtTop = Math.abs(elementRect.top - containerRect.top) < 30;

          if (isOriginalScrolledPast && isStuckAtTop) {
            element.classList.add('stuck-original');
          } else {
            element.classList.remove('stuck-original');
          }
        } else {
          element.classList.remove('stuck-original');
        }
      });
    };

    // Initial update after a short delay to ensure DOM is ready
    const initialTimeout = setTimeout(updateStuckDate, 150);

    // Update on scroll with throttling
    let scrollTimeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateStuckDate, 16); // ~60fps
    };

    messagesDiv.addEventListener('scroll', handleScroll, { passive: true });

    // Also update when messages change
    const changeTimeout = setTimeout(updateStuckDate, 300);

    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(changeTimeout);
      clearTimeout(scrollTimeout);
      messagesDiv.removeEventListener('scroll', handleScroll);
      // Cleanup classes
      dateElementsRef.current.forEach((el) => {
        if (el) el.classList.remove('stuck-original');
      });
    };
  }, [activeChatId, filteredMessages]);

  // Track if user has manually scrolled (don't auto-scroll if they have)
  const userHasScrolledRef = useRef(false);
  const lastScrollHeightRef = useRef(0);

  // Immediate scroll on chat change using useLayoutEffect (runs synchronously)
  useLayoutEffect(() => {
    if (!activeChatId || !messagesContainerRef.current) return;

    const messagesDiv = messagesContainerRef.current;
    const currentHeight = messagesDiv.scrollHeight;

    // Only auto-scroll if this is a new chat or content grew significantly
    // Reset user scroll flag when chat changes
    if (activeChatId) {
      userHasScrolledRef.current = false;
    }

    // Scroll immediately if content height increased or it's a new chat
    if (currentHeight > lastScrollHeightRef.current || !lastScrollHeightRef.current) {
      messagesDiv.scrollTop = currentHeight;
      lastScrollHeightRef.current = currentHeight;
    }
  }, [activeChatId, filteredMessages.length]);

  // Track user scroll to prevent auto-scroll when user scrolls up
  useEffect(() => {
    const messagesDiv = messagesContainerRef.current;
    if (!messagesDiv) return;

    const handleScroll = () => {
      const isAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 50;
      userHasScrolledRef.current = !isAtBottom;
    };

    messagesDiv.addEventListener('scroll', handleScroll, { passive: true });
    return () => messagesDiv.removeEventListener('scroll', handleScroll);
  }, [activeChatId]);

  // Use ResizeObserver to scroll as content grows (for long chats loading progressively)
  useEffect(() => {
    if (!activeChatId || !messagesContainerRef.current) return;

    const messagesDiv = messagesContainerRef.current;
    let resizeObserver = null;

    // Only auto-scroll if user hasn't manually scrolled up
    const shouldAutoScroll = () => {
      return !userHasScrolledRef.current;
    };

    // Scroll to bottom helper
    const scrollToBottom = () => {
      if (messagesDiv && shouldAutoScroll()) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        lastScrollHeightRef.current = messagesDiv.scrollHeight;
      }
    };

    // Use ResizeObserver to detect when content height changes
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newHeight = entry.target.scrollHeight;
          if (newHeight > lastScrollHeightRef.current && shouldAutoScroll()) {
            // Content grew, scroll to bottom
            requestAnimationFrame(() => {
              scrollToBottom();
            });
          }
          lastScrollHeightRef.current = newHeight;
        }
      });

      resizeObserver.observe(messagesDiv);
    }

    // Fallback: Also handle media loading (non-blocking)
    const mediaElements = messagesDiv.querySelectorAll('img[src], video[src], audio[src]');
    const handleMediaLoad = () => {
      if (shouldAutoScroll()) {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }
    };

    mediaElements.forEach((el) => {
      if (!el.complete && el.readyState !== 4) {
        el.addEventListener('load', handleMediaLoad, { once: true });
        el.addEventListener('loadeddata', handleMediaLoad, { once: true });
      }
    });

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      mediaElements.forEach((el) => {
        el.removeEventListener('load', handleMediaLoad);
        el.removeEventListener('loadeddata', handleMediaLoad);
      });
    };
  }, [activeChatId, filteredMessages.length]);

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

          <div className="messages chat-wallpaper" ref={messagesContainerRef} tabIndex={0} style={{ outline: 'none' }} onMouseDown={(e) => e.stopPropagation()}>
            {filteredMessages.length === 0 && messageSearchQuery ? (
              <div className="empty-messages">No messages found for "{messageSearchQuery}"</div>
            ) : filteredMessages.length === 0 && !messageSearchQuery ? (
              <div className="empty-messages">No messages available for this chat</div>
            ) : (
              groupMessagesByDate(filteredMessages).map((item) =>
                item.type === 'date' ? (
                  <div
                    key={item.key}
                    ref={(el) => {
                      if (el) {
                        dateElementsRef.current.set(item.key, el);
                      } else {
                        dateElementsRef.current.delete(item.key);
                      }
                    }}
                    data-date-key={item.key}
                    data-date={item.date}
                    className={`date-separator ${stuckDateKey === item.key ? 'stuck-original' : ''}`}
                  >
                    <span className="date-text">{item.date}</span>
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

        /* WhatsApp wallpaper pattern */
        .chat-wallpaper {
          background-color: #0b141a;
          background-image:
            radial-gradient(circle at 20% 50%, rgba(0, 168, 132, 0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(0, 168, 132, 0.02) 0%, transparent 40%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
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
        
        /* Date separator */
        .date-separator {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          justify-content: center;
          padding: 8px 0;
          margin: 16px 0 8px 0;
          background: linear-gradient(to bottom, rgba(11, 20, 26, 0.95) 0%, rgba(11, 20, 26, 0.8) 60%, transparent 100%);
          backdrop-filter: blur(6px);
        }
        
        .date-text {
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
        
        .date-separator.stuck-original .date-text {
          opacity: 0;
          pointer-events: none;
        }
        
        .date-separator.stuck-original::after {
          content: attr(data-date);
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
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
          white-space: nowrap;
          z-index: 11;
          pointer-events: none;
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


