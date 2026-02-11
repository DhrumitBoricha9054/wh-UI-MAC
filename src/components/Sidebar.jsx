import { useChat } from '../state/ChatContext'
import { useState, useMemo, useCallback, useRef } from 'react'

export default function Sidebar() {
  const { chats, activeChatId, setActiveChatId, isSidebarOpen, closeSidebar, deleteChat, deleteMultipleChats, clearAllChats, globalUserName, isLoadingChats } = useChat()
  const [isPerformingBulkAction, setIsPerformingBulkAction] = useState(false)
  const [isDeletingSingle, setIsDeletingSingle] = useState(null) // chatId being deleted
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChats, setSelectedChats] = useState(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)

  // Custom delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState(null) // { type: 'single'|'bulk', chatId, chatName, count }
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const openDeleteDialog = (type, { chatId, chatName, count } = {}) => {
    setDeleteError(null)
    setDeleteDialog({ type, chatId, chatName, count })
  }

  const closeDeleteDialog = () => {
    if (!isDeleting) {
      setDeleteDialog(null)
      setDeleteError(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteDialog) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      if (deleteDialog.type === 'single') {
        const resp = await deleteChat(deleteDialog.chatId)
        if (!resp || !resp.ok) {
          setDeleteError('Failed to delete chat on server.')
          setIsDeleting(false)
          return
        }
      } else if (deleteDialog.type === 'bulk') {
        const resp = await deleteMultipleChats(Array.from(selectedChats))
        if (!resp || !resp.ok) {
          setDeleteError('Failed to delete selected chats on server.')
          setIsDeleting(false)
          return
        }
        setSelectedChats(new Set())
        setIsSelectionMode(false)
      }
      setDeleteDialog(null)
    } catch (err) {
      console.error('Delete failed:', err)
      setDeleteError('Something went wrong. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

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

  // Get display name for a chat
  const getChatDisplayName = useCallback((chat) => {
    if (chat.participants && globalUserName) {
      const others = chat.participants.filter(
        p => p && p.toLowerCase() !== globalUserName.toLowerCase()
      )
      if (others.length > 1) return 'Group'
      if (others.length === 1) return others[0]
    }
    return chat.name
  }, [globalUserName])

  // Get subtitle for a chat
  const getChatSubtitle = useCallback((chat) => {
    if (chat.participants && globalUserName) {
      const others = chat.participants.filter(
        p => p && p.toLowerCase() !== globalUserName.toLowerCase()
      )
      if (others.length > 1) return others.join(', ')
    }
    const count = chat.messageCount || chat.messages?.length || 0
    return `${count} message${count !== 1 ? 's' : ''}`
  }, [globalUserName])

  // Get last message preview
  const getLastMessagePreview = useCallback((chat) => {
    const msgs = chat.messages
    if (!msgs || msgs.length === 0) return ''
    const last = msgs[msgs.length - 1]
    if (!last) return ''
    let text = last.content || ''
    text = text.replace(/<\s*attached:[^>]+>/gi, '').trim()
    if (last.media) {
      if (last.media.type === 'image') text = '📷 Photo'
      else if (last.media.type === 'video') text = '🎥 Video'
      else if (last.media.type === 'audio') text = '🎵 Audio'
      else if (last.media.type === 'pdf') text = '📄 PDF'
      else text = '📎 File'
    }
    if (text.length > 45) text = text.slice(0, 45) + '...'
    return text
  }, [])

  // Avatar color from name
  const getAvatarColor = useCallback((name) => {
    const colors = [
      '#00a884', '#25d366', '#128c7e', '#075e54',
      '#34b7f1', '#00bcd4', '#7c4dff', '#e91e63',
      '#ff5722', '#ff9800', '#ffc107', '#009688'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }, [])

  return (
    <>
      <div className={`overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`} id="sidebar">
        {/* Search Bar */}
        <div className="search-container">
          <div className="search-input-wrapper">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
          <div className="loading-state">
            <div className="loading-spinner"></div>
            Loading chats...
          </div>
        )}

        {!isLoadingChats && filteredChats.length === 0 && searchQuery && (
          <div className="search-no-results">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}>
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            No chats found for "{searchQuery}"
          </div>
        )}

        {!isLoadingChats && filteredChats.length === 0 && !searchQuery && (
          <div className="empty-state-sidebar">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>No chats yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Import a ZIP to get started</div>
          </div>
        )}

        {/* Bulk Delete Controls */}
        {filteredChats.length > 0 && isSelectionMode && (
          <div className="bulk-controls">
            <div className="bulk-controls-left">
              {selectedChats.size > 0 && (
                <button
                  className="delete-selected"
                  onClick={() => openDeleteDialog('bulk', { count: selectedChats.size })}
                  disabled={isPerformingBulkAction}
                >
                  {`Delete Selected (${selectedChats.size})`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Chat List */}
        <div className="chat-list">
          {filteredChats.map((chat) => {
            const displayName = getChatDisplayName(chat)
            const subtitle = getChatSubtitle(chat)
            const preview = getLastMessagePreview(chat)
            const avatarColor = getAvatarColor(displayName)
            const isGroup = chat.participants && globalUserName &&
              chat.participants.filter(p => p && p.toLowerCase() !== globalUserName.toLowerCase()).length > 1

            return (
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
                  {/* Avatar */}
                  <div className="chat-item-avatar" style={{ background: avatarColor }}>
                    {isGroup ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span>{displayName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="chat-text">
                    <div className="chat-item-header">
                      <span className="chat-item-name">{displayName}</span>
                      <span className="chat-item-meta">
                        {(chat.messageCount || chat.messages?.length || 0)} msgs
                      </span>
                    </div>
                    <div className="chat-item-preview">
                      {preview || subtitle}
                    </div>
                  </div>
                </div>

                {/* Delete Button */}
                <button
                  className="delete-chat-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    openDeleteDialog('single', { chatId: chat.id, chatName: displayName })
                  }}
                  title="Delete chat"
                  disabled={isDeletingSingle === chat.id}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      {/* Custom Delete Confirmation Dialog */}
      {deleteDialog && (
        <div className="delete-dialog-overlay" onClick={closeDeleteDialog}>
          <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="delete-dialog-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="#e74c3c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="10" y1="11" x2="10" y2="17" stroke="#e74c3c" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="11" x2="14" y2="17" stroke="#e74c3c" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="delete-dialog-title">
              {deleteDialog.type === 'single' ? 'Delete Chat?' : `Delete ${deleteDialog.count} Chat${deleteDialog.count !== 1 ? 's' : ''}?`}
            </h3>
            <p className="delete-dialog-message">
              {deleteDialog.type === 'single'
                ? <>Messages with <strong>{deleteDialog.chatName}</strong> will be permanently removed. This action cannot be undone.</>
                : <>The selected {deleteDialog.count} chat{deleteDialog.count !== 1 ? 's' : ''} will be permanently removed. This action cannot be undone.</>
              }
            </p>
            {deleteError && (
              <div className="delete-dialog-error">{deleteError}</div>
            )}
            <div className="delete-dialog-actions">
              <button
                className="delete-dialog-cancel"
                onClick={closeDeleteDialog}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="delete-dialog-confirm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="btn-spinner"></span>
                    Deleting...
                  </>
                ) : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .search-container {
          padding: 10px 14px;
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
          border-color: #00a884;
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
          padding: 40px 16px;
          text-align: center;
          color: #8696a0;
          font-size: 14px;
        }
        
        .empty-state-sidebar {
          padding: 60px 16px;
          text-align: center;
          color: #8696a0;
          font-size: 15px;
        }
        
        .loading-state {
          padding: 40px 16px;
          text-align: center;
          color: #8696a0;
          font-size: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        
        .loading-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid #1f2c33;
          border-top: 3px solid #00a884;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
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

        /* Chat List */
        .chat-list {
          overflow-y: auto;
          flex: 1;
        }
        
        .chat-item {
          display: flex;
          align-items: center;
          gap: 0;
          padding: 0 8px 0 0;
          cursor: pointer;
          transition: background-color 0.15s ease;
          border-bottom: 1px solid rgba(134, 150, 160, 0.08);
          position: relative;
        }
        
        .chat-item:hover {
          background-color: #202c33;
        }
        
        .chat-item.active {
          background-color: #2a3942;
        }
        .chat-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #00a884;
          border-radius: 0 3px 3px 0;
        }
        
        .chat-checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
          margin-left: 12px;
          accent-color: #00a884;
        }
        
        .chat-content {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 8px 12px 14px;
        }

        .chat-item-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: white;
          font-size: 20px;
          font-weight: 600;
        }

        .chat-text {
          flex: 1;
          min-width: 0;
        }

        .chat-item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 2px;
        }

        .chat-item-name {
          font-weight: 600;
          font-size: 15px;
          color: #e9edef;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
        }

        .chat-item-meta {
          font-size: 11px;
          color: #667781;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .chat-item-preview {
          font-size: 13px;
          color: #8696a0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.3;
        }
        
        .delete-chat-btn {
          background: none;
          border: none;
          color: #8696a0;
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          transition: all 0.2s ease;
          opacity: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .chat-item:hover .delete-chat-btn {
          opacity: 1;
        }
        
        .delete-chat-btn:hover {
          color: #e74c3c;
          background: rgba(231, 76, 60, 0.1);
        }

        /* Mobile adjustments */
        @media (max-width: 768px) {
          .chat-item-avatar {
            width: 50px;
            height: 50px;
            font-size: 22px;
          }
          .chat-content {
            padding: 14px 8px 14px 16px;
          }
          .chat-item-name {
            font-size: 16px;
          }
          .chat-item-preview {
            font-size: 14px;
          }
          .delete-chat-btn {
            opacity: 0.5;
            padding: 10px;
          }
        }

        /* ===== Delete Confirmation Dialog ===== */
        .delete-dialog-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: dialogFadeIn 0.2s ease;
        }

        @keyframes dialogFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .delete-dialog {
          background: #233138;
          border-radius: 14px;
          padding: 28px 24px 20px;
          max-width: 340px;
          width: 100%;
          text-align: center;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04);
          animation: dialogSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes dialogSlideUp {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .delete-dialog-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(231, 76, 60, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }

        .delete-dialog-title {
          font-size: 18px;
          font-weight: 600;
          color: #e9edef;
          margin: 0 0 8px;
        }

        .delete-dialog-message {
          font-size: 14px;
          color: #8696a0;
          line-height: 1.5;
          margin: 0 0 20px;
        }

        .delete-dialog-message strong {
          color: #e9edef;
          font-weight: 600;
        }

        .delete-dialog-error {
          padding: 8px 12px;
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid rgba(231, 76, 60, 0.25);
          border-radius: 8px;
          color: #ff6b6b;
          font-size: 13px;
          margin-bottom: 16px;
        }

        .delete-dialog-actions {
          display: flex;
          gap: 10px;
        }

        .delete-dialog-cancel,
        .delete-dialog-confirm {
          flex: 1;
          padding: 11px 16px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .delete-dialog-cancel {
          background: rgba(134, 150, 160, 0.12);
          color: #e9edef;
        }

        .delete-dialog-cancel:hover {
          background: rgba(134, 150, 160, 0.2);
        }

        .delete-dialog-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .delete-dialog-confirm {
          background: #e74c3c;
          color: white;
        }

        .delete-dialog-confirm:hover {
          background: #d63031;
        }

        .delete-dialog-confirm:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          flex-shrink: 0;
        }
      `}</style>
    </>
  )
}
