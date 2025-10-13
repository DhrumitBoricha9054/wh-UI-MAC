import { useChat } from '../state/ChatContext'
import { useState, useMemo, useCallback } from 'react'

export default function Sidebar() {
  const { chats, activeChatId, setActiveChatId, isSidebarOpen, closeSidebar, deleteChat, deleteMultipleChats, clearAllChats, globalUserName, isLoadingChats } = useChat()
  const [isPerformingBulkAction, setIsPerformingBulkAction] = useState(false)
  const [isDeletingSingle, setIsDeletingSingle] = useState(null) // chatId being deleted
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChats, setSelectedChats] = useState(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)

  // Filter chats based on search query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats
    
    const query = searchQuery.toLowerCase()
    return chats.filter(chat => {
      // Search in chat name
      if (chat.name.toLowerCase().includes(query)) return true
      
      // Search in participants (excluding current user)
      const otherParticipants = chat.participants.filter(p => 
        !globalUserName || p.toLowerCase() !== globalUserName.toLowerCase()
      )
      if (otherParticipants.some(p => p.toLowerCase().includes(query))) return true
      
      // Search in message content (first 100 messages for performance)
      const messagesToSearch = chat.messages.slice(0, 100)
      return messagesToSearch.some(msg => 
        msg.content.toLowerCase().includes(query) || 
        msg.author.toLowerCase().includes(query)
      )
    })
  }, [chats, searchQuery, globalUserName])

  // Get display participants (excluding current user)
  const getDisplayParticipants = useCallback((participants) => {
    if (!globalUserName) return participants
    return participants.filter(p => p.toLowerCase() !== globalUserName.toLowerCase())
  }, [globalUserName])

  return (
    <>
      <div className={`overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        {/* Search Bar */}
        <div className="search-container">
          <div className="search-input-wrapper">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search chats, messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="clear-search"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {isLoadingChats && (
          <div className="loading-state">Loading chats...</div>
        )}
        
        {!isLoadingChats && filteredChats.length === 0 && searchQuery && (
          <div className="search-no-results">No chats found for "{searchQuery}"</div>
        )}
        
        {!isLoadingChats && filteredChats.length === 0 && !searchQuery && (
          <div className="empty-state">No chats available</div>
        )}
        
        {/* Bulk Delete Controls */}
        {filteredChats.length > 0 && (
          <div className="bulk-controls">
            <div className="bulk-controls-left">
              {/* <button
                className={`selection-toggle ${isSelectionMode ? 'active' : ''}`}
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode)
                  setSelectedChats(new Set())
                }}
              >
                {isSelectionMode ? 'Cancel' : 'Select'}
              </button> */}
              
              {isSelectionMode && selectedChats.size > 0 && (
                <button
                  className="delete-selected"
                  onClick={async () => {
                    if (!window.confirm(`Are you sure you want to delete ${selectedChats.size} chat(s)? This cannot be undone.`)) return
                    setIsPerformingBulkAction(true)
                    try {
                      const resp = await deleteMultipleChats(Array.from(selectedChats))
                      if (!resp || !resp.ok) {
                        // server reported failure
                        window.alert('Failed to delete selected chats on server.')
                        return
                      }
                      // success: clear selection and exit selection mode
                      setSelectedChats(new Set())
                      setIsSelectionMode(false)
                    } catch (err) {
                      console.error('Delete selected failed:', err)
                      window.alert('Failed to delete selected chats. See console for details.')
                    } finally {
                      setIsPerformingBulkAction(false)
                    }
                  }}
                  disabled={isPerformingBulkAction}
                >
                  {isPerformingBulkAction ? 'Deleting...' : `Delete Selected (${selectedChats.size})`}
                </button>
              )
              }
            </div>
            
            {/* <button
              className="clear-all"
              onClick={async () => {
                if (!window.confirm('Are you sure you want to delete all chats? This cannot be undone.')) return
                try {
                  setIsPerformingBulkAction(true)
                  await clearAllChats()
                } catch (err) {
                  console.error('Clear all chats failed:', err)
                } finally {
                  setIsPerformingBulkAction(false)
                }
              }}
              disabled={isPerformingBulkAction}
            >
              {isPerformingBulkAction ? 'Clearing...' : 'Clear All'}
            </button> */}
          </div>
        )}
        
        {filteredChats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
          >
            {/* Selection Checkbox */}
            {isSelectionMode && (
              <input
                type="checkbox"
                checked={selectedChats.has(chat.id)}
                onChange={(e) => {
                  const newSelected = new Set(selectedChats)
                  if (e.target.checked) {
                    newSelected.add(chat.id)
                  } else {
                    newSelected.delete(chat.id)
                  }
                  setSelectedChats(newSelected)
                }}
                className="chat-checkbox"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            
            {/* Chat Content */}
            <div 
              className="chat-content"
              onClick={() => {
                setActiveChatId(chat.id)
                closeSidebar()
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {(() => {
                  // Show other party name(s) if possible
                  if (chat.participants && globalUserName) {
                    const others = chat.participants.filter(
                      p => p && p.toLowerCase() !== globalUserName.toLowerCase()
                    );
                    if (others.length > 0) {
                      return others.join(', ');
                    }
                  }
                  // fallback to chat.name
                  return chat.name;
                })()}
              </div>
              <div style={{ fontSize: 12, color: '#8696a0' }}>
                {getDisplayParticipants(chat.participants).join(', ') || 'No other participants'}
              </div>
              <div style={{ fontSize: 11, color: '#667781', marginTop: 4 }}>
                {chat.messageCount || chat.messages?.length || 0} message{(chat.messageCount || chat.messages?.length || 0) !== 1 ? 's' : ''}
              </div>
            </div>
            
            {/* Delete Button */}
            <button
              className="delete-chat-btn"
              onClick={async (e) => {
                e.stopPropagation()
                if (!window.confirm(`Are you sure you want to delete "${chat.name}"? This cannot be undone.`)) return
                setIsDeletingSingle(chat.id)
                try {
                  const resp = await deleteChat(chat.id)
                  if (!resp || !resp.ok) {
                    window.alert('Failed to delete chat on server')
                  }
                } catch (err) {
                  console.error('Delete chat failed:', err)
                  window.alert('Failed to delete chat. See console for details.')
                } finally {
                  setIsDeletingSingle(null)
                }
              }}
              title="Delete chat"
              disabled={isDeletingSingle === chat.id}
            >
              {isDeletingSingle === chat.id ? 'Deleting...' : '🗑️'}
            </button>
          </div>
        ))}
      </aside>

      <style jsx>{`
        .search-container {
          padding: 16px;
          border-bottom: 1px solid #0e171c;
        }
        
        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        
        .search-icon {
          position: absolute;
          left: 12px;
          color: #8696a0;
          pointer-events: none;
        }
        
        .search-input {
          width: 100%;
          padding: 10px 12px 10px 36px;
          background: #1f2c33;
          border: 1px solid #0e171c;
          border-radius: 8px;
          color: #cfe2ea;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s ease;
        }
        
        .search-input:focus {
          border-color: #00b894;
        }
        
        .search-input::placeholder {
          color: #8696a0;
        }
        
        .clear-search {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: #8696a0;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          font-size: 12px;
          transition: color 0.2s ease;
        }
        
        .clear-search:hover {
          color: #cfe2ea;
          background: #2a3942;
        }
        
        .search-no-results {
          padding: 20px 16px;
          text-align: center;
          color: #8696a0;
          font-size: 14px;
        }
        
        .bulk-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #0e171c;
          background: #1f2c33;
        }
        
        .bulk-controls-left {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        
        .selection-toggle {
          padding: 6px 12px;
          background: #2a3942;
          border: 1px solid #0e171c;
          border-radius: 6px;
          color: #cfe2ea;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
        }
        
        .selection-toggle:hover {
          background: #3a4a52;
        }
        
        .selection-toggle.active {
          background: #00b894;
          color: white;
        }
        
        .delete-selected {
          padding: 6px 12px;
          background: #e74c3c;
          border: 1px solid #c0392b;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
        }
        
        .delete-selected:hover {
          background: #c0392b;
        }
        
        .clear-all {
          padding: 6px 12px;
          background: #e74c3c;
          border: 1px solid #c0392b;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
        }
        
        .clear-all:hover {
          background: #c0392b;
        }
        
        .chat-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          cursor: pointer;
          transition: background-color 0.2s ease;
          border-bottom: 1px solid #0e171c;
        }
        
        .chat-item:hover {
          background-color: #2a3942;
        }
        
        .chat-item.active {
          background-color: #00b894;
          color: white;
        }
        
        .chat-checkbox {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        
        .chat-content {
          flex: 1;
          min-width: 0;
        }
        
        .delete-chat-btn {
          background: none;
          border: none;
          color: #8696a0;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          font-size: 14px;
          transition: all 0.2s ease;
          opacity: 0;
        }
        
        .chat-item:hover .delete-chat-btn {
          opacity: 1;
        }
        
        .delete-chat-btn:hover {
          color: #e74c3c;
          background: #2a3942;
        }
        
        .empty-state {
          padding: 20px 16px;
          text-align: center;
          color: #8696a0;
          font-size: 14px;
        }
        
        .loading-state {
          padding: 20px 16px;
          text-align: center;
          color: #8696a0;
          font-size: 14px;
          font-style: italic;
        }
      `}</style>
    </>
  )
}


