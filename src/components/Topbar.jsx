import { useRef, useState } from 'react'
import { useChat } from '../state/ChatContext'
import { apiUploadZip, apiUploadPreview, apiUploadConfirm } from '../lib/api'


async function apiChangePassword(oldPassword, newPassword, token) {
  const res = await fetch('https://whatsapp-api.otix.in/api/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ oldPassword, newPassword })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Failed to change password')
  return data
}

export default function Topbar() {
  const inputRef = useRef(null)
  const { importFromZip, toggleSidebar, logout, goBack, globalUserName, setGlobalName, importStats, fetchChatsFromAPI, activeChatId, chats, messagesByChatId } = useChat()
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showChangePwdModal, setShowChangePwdModal] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')
  const [zipResponse, setZipResponse] = useState(null)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // Two-step import state
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState('suggested') // 'suggested', 'new', or a chat id
  const [isConfirming, setIsConfirming] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const handleLogout = () => {
    if (logout) {
      logout()
    } else {
      localStorage.clear()
      window.location.href = '/'
    }
  }

  const handleChangePassword = async () => {
    setPwdError('')
    setPwdSuccess('')
    setPwdLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const result = await apiChangePassword(oldPwd, newPwd, token)
      if (result.ok) {
        setPwdSuccess('Password changed successfully!')
        setOldPwd('')
        setNewPwd('')

        setTimeout(() => setShowChangePwdModal(false), 1200)
        setTimeout(() => setPwdSuccess(''), 1150)
      } else {
        setPwdError('Failed to change password')
      }
    } catch (err) {
      setPwdError(err.message || 'Failed to change password')
    } finally {
      setPwdLoading(false)
    }
  }

  // Format date range nicely
  const formatDateRange = (from, to) => {
    const opts = { month: 'short', day: 'numeric', year: 'numeric' }
    try {
      const fromDate = new Date(from)
      const toDate = new Date(to)
      if (isNaN(fromDate) || isNaN(toDate)) return `${from} → ${to}`
      return `${fromDate.toLocaleDateString('en-US', opts)} → ${toDate.toLocaleDateString('en-US', opts)}`
    } catch {
      return `${from} → ${to}`
    }
  }

  // Get confidence badge color
  const getConfidenceBadge = (confidence) => {
    if (confidence >= 80) return { color: '#00b894', bg: 'rgba(0, 184, 148, 0.15)', label: 'Strong match' }
    if (confidence >= 50) return { color: '#ffd600', bg: 'rgba(255, 214, 0, 0.15)', label: 'Possible match' }
    return { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', label: 'Weak match' }
  }

  // Get match reason text
  const getMatchReason = (matchStep) => {
    switch (matchStep) {
      case 'exact_name': return 'Same chat name'
      case 'participant_overlap': return 'Similar members'
      case 'generic_name_with_overlap': return 'Possible match'
      default: return 'Auto-detected'
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''

    if (!file) return

    const token = localStorage.getItem('auth_token')

    // For logged-in users, use two-step preview flow
    if (token) {
      setPreviewLoading(true)
      setPreviewError('')
      setShowPreviewModal(true)
      setPreviewData(null)
      setSelectedTarget('suggested')

      try {
        const result = await apiUploadPreview(file, token)
        console.log('📦 Preview API response:', JSON.stringify(result, null, 2))
        setPreviewData(result)
        // Pre-select suggested match if available, otherwise default to "new"
        if (result.suggestedMatch) {
          setSelectedTarget('suggested')
        } else {
          setSelectedTarget('new')
        }
      } catch (err) {
        if (err?.status === 401) {
          alert('Session expired. Please log in again.')
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_user')
          window.location.reload()
          return
        }
        setPreviewError(err.message || 'Failed to preview ZIP file')
      } finally {
        setPreviewLoading(false)
      }
      return
    }

    // For non-logged-in users, use the old direct import
    setIsUploading(true)
    setUploadProgress(0)
    try {
      await importFromZip(file)
      setUploadProgress(100)
      setTimeout(() => {
        setIsUploading(false)
        setUploadProgress(0)
      }, 500)
    } catch (err) {
      setIsUploading(false)
      setUploadProgress(0)
      alert(err.message || 'Failed to import ZIP')
    }
  }

  // Confirm import with selected target
  const handleConfirmImport = async () => {
    if (!previewData?.previewId) return

    const token = localStorage.getItem('auth_token')
    if (!token) return

    setIsConfirming(true)
    setPreviewError('')

    try {
      let targetChatId = null
      if (selectedTarget === 'suggested' && previewData.suggestedMatch) {
        targetChatId = previewData.suggestedMatch.chatId
      } else if (selectedTarget !== 'new' && selectedTarget !== 'suggested') {
        targetChatId = selectedTarget
      }

      const result = await apiUploadConfirm(previewData.previewId, targetChatId, token)
      setZipResponse(result)
      setShowPreviewModal(false)
      setPreviewData(null)
      // Refresh chat list
      await fetchChatsFromAPI()
    } catch (err) {
      if (err?.status === 410 || err?.status === 404) {
        setPreviewError('Preview expired. Please upload again.')
      } else if (err?.status === 401) {
        alert('Session expired. Please log in again.')
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
        window.location.reload()
        return
      } else {
        setPreviewError(err.message || 'Import failed. Please try again.')
      }
    } finally {
      setIsConfirming(false)
    }
  }

  const closePreviewModal = () => {
    setShowPreviewModal(false)
    setPreviewData(null)
    setPreviewError('')
    setSelectedTarget('suggested')
  }

  // Get active chat info for mobile header
  const activeChat = chats.find(c => c.id === activeChatId)
  const getActiveChatDisplayName = () => {
    if (!activeChat) return ''
    if (activeChat.participants && globalUserName) {
      const others = activeChat.participants.filter(
        p => p && p.toLowerCase() !== globalUserName.toLowerCase()
      )
      // Group chat: show actual group name
      if (others.length > 1) return activeChat.name
      // 1-on-1 chat: show the other person's name
      if (others.length === 1) return others[0]
    }
    return activeChat.name
  }

  // Get message count for active chat
  const activeMessageCount = activeChatId
    ? (messagesByChatId[activeChatId]?.length || activeChat?.messageCount || 0)
    : 0

  return (
    <div>
      {/* === MOBILE: Chat List Topbar (no active chat) === */}
      <div className="topbar topbar-mobile-list">
        <div className="topbar-left">
          <div className="title">WhatsApp Chat Viewer</div>
        </div>
        <div className="topbar-right">
          <button
            className="topbar-icon-btn"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="5" r="2" fill="#cfd8dc" />
              <circle cx="12" cy="12" r="2" fill="#cfd8dc" />
              <circle cx="12" cy="19" r="2" fill="#cfd8dc" />
            </svg>
          </button>
        </div>
      </div>

      {/* === MOBILE: Chat View Topbar (active chat) === */}
      <div className="topbar topbar-mobile-chat">
        <button className="back-btn" onClick={goBack} aria-label="Back to chat list">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#cfd8dc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="chat-info">
          <div className="chat-avatar">
            {getActiveChatDisplayName().charAt(0).toUpperCase()}
          </div>
          <div className="chat-details">
            <div className="chat-name">{getActiveChatDisplayName()}</div>
            <div className="chat-status">
              {(() => {
                if (!activeChat) return ''
                const others = activeChat.participants?.filter(
                  p => p && globalUserName && p.toLowerCase() !== globalUserName.toLowerCase()
                ) || []
                // Group: show participant names
                if (others.length > 1) {
                  return others.join(', ')
                }
                // 1-on-1: show message count
                return activeMessageCount > 0 ? `${activeMessageCount} messages` : 'tap for info'
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* === DESKTOP: Full Topbar === */}
      <div className="topbar topbar-desktop">
        <button className="icon-button" aria-label="Open sidebar" onClick={toggleSidebar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6h18M3 12h18M3 18h18"
              stroke="#cfd8dc" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="title">WhatsApp Chat Viewer</div>
        <div className="user-name-section">
          <label htmlFor="globalUserName" className="user-label">
            Your name:
          </label>
          <input
            id="globalUserName"
            placeholder="Type exactly as it appears in chat"
            value={globalUserName || ''}
            onChange={(e) => setGlobalName(e.target.value)}
            className="user-input"
          />
        </div>
        <div className="actions">
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            disabled={isUploading}
          />
          <button
            onClick={() => !isUploading && inputRef.current?.click()}
            disabled={isUploading}
            className={isUploading ? 'uploading' : ''}
          >
            {isUploading ? (
              <>
                <div className="spinner"></div>
                Uploading...
              </>
            ) : (
              'Import ZIP'
            )}
          </button>
          <button
            onClick={() => setShowChangePwdModal(true)}
            className="change-pwd-btn"
            disabled={isUploading}
          >
            Change Password
          </button>
          {/* Modern Red Logout Button */}
          <button className="logout-btn" onClick={() => setShowLogoutModal(true)} disabled={isUploading}>
            <svg xmlns="http://www.w3.org/2000/svg"
              width="16" height="16" fill="currentColor"
              viewBox="0 0 16 16" style={{ marginRight: '6px' }}>
              <path d="M6 12V9h4V7H6V4L0 8l6 4z" />
              <path d="M13 2H9v2h4v8H9v2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
            </svg>
            Logout
          </button>
        </div>
      </div>

      {/* === MOBILE: Dropdown Menu === */}
      {showMobileMenu && (
        <>
          <div className="mobile-menu-overlay" onClick={() => setShowMobileMenu(false)}></div>
          <div className="mobile-dropdown-menu">
            {/* Your name input inside menu */}
            <div className="menu-name-input">
              <label htmlFor="globalUserNameMobile" className="menu-name-label">Your name</label>
              <input
                id="globalUserNameMobile"
                placeholder="Type name as it appears in chat"
                value={globalUserName || ''}
                onChange={(e) => setGlobalName(e.target.value)}
                className="menu-name-field"
              />
            </div>
            <div className="menu-divider"></div>
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              onChange={(e) => { handleFileUpload(e); setShowMobileMenu(false); }}
              style={{ display: 'none' }}
              disabled={isUploading}
            />
            <button onClick={() => { !isUploading && inputRef.current?.click(); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isUploading ? 'Uploading...' : 'Import ZIP'}
            </button>
            <button onClick={() => { setShowChangePwdModal(true); setShowMobileMenu(false); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Change Password
            </button>
            <button className="menu-logout" onClick={() => { setShowLogoutModal(true); setShowMobileMenu(false); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Logout
            </button>
          </div>
        </>
      )}

      {/* Change Password Modal */}
      {showChangePwdModal && (
        <div className="modal-overlay">
          <div className="modern-modal">
            <div className="modal-icon-large">
              {/* Lock icon SVG */}
              <svg width="48" height="48" fill="#ffd600" viewBox="0 0 24 24">
                <path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6-7V8a6 6 0 0 0-12 0v2a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-7a3 3 0 0 0-3-3zm-8-2a4 4 0 0 1 8 0v2H6V8zm11 12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v7z" />
              </svg>
            </div>
            <h2>Change Password</h2>
            <div className="modal-fields">
              <input
                type="password"
                placeholder="Old password"
                value={oldPwd}
                onChange={e => setOldPwd(e.target.value)}
                disabled={pwdLoading}
              />
              <input
                type="password"
                placeholder="New password"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                disabled={pwdLoading}
              />
              {pwdError && <div className="modal-error">{pwdError}</div>}
              {pwdSuccess && <div className="modal-success">{pwdSuccess}</div>}
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowChangePwdModal(false)} disabled={pwdLoading}>Cancel</button>
              <button className="confirm-btn" onClick={handleChangePassword} disabled={pwdLoading || !oldPwd || !newPwd}>
                {pwdLoading ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === Import Preview Modal === */}
      {showPreviewModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !isConfirming) closePreviewModal() }}>
          <div className="preview-modal">
            {/* Header */}
            <div className="preview-header">
              <div className="preview-header-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="#00b894" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2>Import Chat</h2>
              <p className="preview-subtitle">Choose where to import this chat</p>
            </div>

            {/* Loading State */}
            {previewLoading && (
              <div className="preview-loading">
                <div className="preview-spinner"></div>
                <span>Analyzing ZIP file...</span>
              </div>
            )}

            {/* Error State */}
            {previewError && !previewLoading && (
              <div className="preview-error-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#ff6b6b" strokeWidth="2" />
                  <path d="M12 8v4M12 16h.01" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>{previewError}</span>
              </div>
            )}

            {/* Preview Content */}
            {previewData && !previewLoading && (
              <>
                {/* Section A: ZIP Preview Info */}
                <div className="preview-info-card">
                  <div className="preview-info-row">
                    <span className="preview-info-label">Chat Name</span>
                    <span className="preview-info-value">{previewData.parsedChats?.[0]?.name || 'Unnamed Chat'}</span>
                  </div>
                  <div className="preview-info-row">
                    <span className="preview-info-label">Participants</span>
                    <span className="preview-info-value preview-participants">
                      {previewData.parsedChats?.[0]?.participants?.join(', ') || 'Unknown'}
                    </span>
                  </div>
                  <div className="preview-info-row">
                    <span className="preview-info-label">Messages</span>
                    <span className="preview-info-value">{previewData.parsedChats?.[0]?.messageCount || 0}</span>
                  </div>
                  {previewData.parsedChats?.[0]?.dateRange && (
                    <div className="preview-info-row">
                      <span className="preview-info-label">Date Range</span>
                      <span className="preview-info-value">
                        {formatDateRange(previewData.parsedChats[0].dateRange.from, previewData.parsedChats[0].dateRange.to)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Section B: Where to import */}
                <div className="preview-target-section">
                  <h3 className="preview-section-title">Import destination</h3>

                  {/* Suggested Match */}
                  {previewData.suggestedMatch && (() => {
                    const badge = getConfidenceBadge(previewData.suggestedMatch.confidence)
                    return (
                      <label
                        className={`preview-target-card suggested ${selectedTarget === 'suggested' ? 'selected' : ''}`}
                        onClick={() => setSelectedTarget('suggested')}
                      >
                        <input
                          type="radio"
                          name="importTarget"
                          checked={selectedTarget === 'suggested'}
                          onChange={() => setSelectedTarget('suggested')}
                        />
                        <div className="target-card-content">
                          <div className="target-card-top">
                            <span className="target-card-name">{previewData.suggestedMatch.chatName}</span>
                            <span className="confidence-badge" style={{ color: badge.color, background: badge.bg }}>
                              {previewData.suggestedMatch.confidence}% • {badge.label}
                            </span>
                          </div>
                          <div className="target-card-meta">
                            <span className="target-card-participants">
                              {previewData.suggestedMatch.participants?.join(', ')}
                            </span>
                            <span className="target-card-reason">
                              {getMatchReason(previewData.suggestedMatch.matchStep)}
                            </span>
                          </div>
                          <div className="recommended-tag">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#00b894" />
                            </svg>
                            Recommended
                          </div>
                        </div>
                      </label>
                    )
                  })()}

                  {/* Existing Chats List */}
                  {previewData.existingChats?.filter(c => c.id !== previewData.suggestedMatch?.chatId).length > 0 && (
                    <div className="preview-existing-section">
                      <div className="preview-existing-label">Or merge into another chat:</div>
                      <div className="preview-existing-list">
                        {previewData.existingChats
                          .filter(c => c.id !== previewData.suggestedMatch?.chatId)
                          .map(chat => (
                            <label
                              key={chat.id}
                              className={`preview-target-card ${selectedTarget === chat.id ? 'selected' : ''}`}
                              onClick={() => setSelectedTarget(chat.id)}
                            >
                              <input
                                type="radio"
                                name="importTarget"
                                checked={selectedTarget === chat.id}
                                onChange={() => setSelectedTarget(chat.id)}
                              />
                              <div className="target-card-content">
                                <div className="target-card-top">
                                  <span className="target-card-name">{chat.name}</span>
                                  <span className="target-card-count">{chat.messageCount} msgs</span>
                                </div>
                                <div className="target-card-meta">
                                  <span className="target-card-participants">
                                    {chat.participants?.join(', ') || 'No participants'}
                                  </span>
                                </div>
                              </div>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Create New Chat Option */}
                  <label
                    className={`preview-target-card new-chat ${selectedTarget === 'new' ? 'selected' : ''}`}
                    onClick={() => setSelectedTarget('new')}
                  >
                    <input
                      type="radio"
                      name="importTarget"
                      checked={selectedTarget === 'new'}
                      onChange={() => setSelectedTarget('new')}
                    />
                    <div className="target-card-content">
                      <div className="target-card-top">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M12 5v14M5 12h14" stroke="#00b894" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span className="target-card-name">Create as new chat</span>
                      </div>
                    </div>
                  </label>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="preview-actions">
              <button
                className="preview-cancel-btn"
                onClick={closePreviewModal}
                disabled={isConfirming}
              >
                Cancel
              </button>
              <button
                className="preview-import-btn"
                onClick={handleConfirmImport}
                disabled={isConfirming || previewLoading || (!previewData && !previewError)}
              >
                {isConfirming ? (
                  <>
                    <div className="spinner"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {isUploading && (
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <div className="progress-text">
            Uploading ZIP file... {Math.round(uploadProgress)}%
          </div>
        </div>
      )}

      {/* Import Statistics Notification */}
      {importStats && !isUploading && (
        <div className="import-notification">
          <div className="notification-content">
            <h4>Import Complete!</h4>
            <div className="stats">
              {importStats.added > 0 && (
                <span className="stat-item added">+{importStats.added} new chat{importStats.added !== 1 ? 's' : ''}</span>
              )}
              {importStats.updated > 0 && (
                <span className="stat-item updated">~{importStats.updated} chat{importStats.updated !== 1 ? 's' : ''} updated</span>
              )}
              {importStats.skipped > 0 && (
                <span className="stat-item skipped">-{importStats.skipped} duplicate{importStats.skipped !== 1 ? 's' : ''} skipped</span>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ZIP API Response Popup */}
      {zipResponse && (
        <div className="zip-response-popup">
          <div className="zip-response-content">
            <h4>ZIP Import Result</h4>
            <pre style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(zipResponse, null, 2)}</pre>
            <button className="zip-response-ok" onClick={() => setZipResponse(null)}>OK</button>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg xmlns="http://www.w3.org/2000/svg"
                width="36" height="36" fill="#ff4d4d"
                viewBox="0 0 16 16">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </div>
            <h3>Are you sure?</h3>
            <p>You will be logged out of your account.</p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowLogoutModal(false)}>Cancel</button>
              <button className="confirm-btn" onClick={handleLogout}>Yes, Logout</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .zip-response-ok {
          margin-top: 14px;
          background: #00b894;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 22px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .zip-response-ok:hover {
          background: #019c7d;
        }
        .zip-response-popup {
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          background: #222;
          color: #cfe2ea;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 2000;
          padding: 18px 24px;
          min-width: 260px;
          max-width: 90vw;
          animation: fadeIn 0.3s ease;
        }
        .zip-response-content h4 {
          margin: 0 0 8px 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #ffd600;
        }

        /* === TOPBAR BASE === */
        .topbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 0 16px;
          background: #1f2c33;
          border-bottom: 1px solid #0e171c;
          height: 56px;
          min-height: 56px;
        }

        /* === DESKTOP TOPBAR (default) === */
        .topbar-desktop {
          display: flex;
        }
        .topbar-mobile-list,
        .topbar-mobile-chat {
          display: none;
        }

        /* === MOBILE NAME BAR === */
        .mobile-name-bar {
          display: none;
        }

        /* === DESKTOP SPECIFIC === */        
        .user-name-section {
          display: flex;
          align-items: center;
          margin-left: auto;
          margin-right: 16px;
        }
        .user-label {
          color: #8696a0;
          font-size: 12px;
          margin-right: 8px;
          white-space: nowrap;
        }
        .user-input {
          background: #0f1b21;
          border: 1px solid #0e171c;
          color: #cfe2ea;
          border-radius: 8px;
          padding: 6px 8px;
          font-size: 12px;
          width: 200px;
          margin-right: 16px;
          transition: border-color 0.2s ease;
        }
        .user-input:focus {
          outline: none;
          border-color: #00b894;
        }
        .change-pwd-btn {
          background: #ffd600;
          color: #222;
          font-weight: 500;
        }
        
        .title {
          font-size: 1.2rem;
          font-weight: 600;
          color: #cfe2ea;
          white-space: nowrap;
        }
        
        .actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .actions button {
          background: #00b894;
          color: white;
          padding: 8px 14px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .actions button:hover:not(:disabled) {
          background: #019c7d;
        }
        
        .actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .actions button.uploading {
          background: #019c7d;
        }
        
        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .user-name-section input {
          transition: border-color 0.2s ease;
        }
        
        .user-name-section input:focus {
          outline: none;
          border-color: #00b894;
        }
        
        .logout-btn {
          background: #ff4d4d !important;
          color: white;
          padding: 8px 14px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          border: none;
          cursor: pointer;
          transition: background 0.3s ease;
        }
        .logout-btn:hover:not(:disabled) {
          background: #e04343 !important;
        }
        .logout-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* ============================================= */
        /* ========== MOBILE RESPONSIVE =============== */
        /* ============================================= */
        @media (max-width: 768px) {
          /* Hide desktop topbar on mobile */
          .topbar-desktop {
            display: none !important;
          }

          /* Show appropriate mobile topbar based on parent class */
          .chat-list-active .topbar-mobile-list {
            display: flex !important;
          }
          .chat-list-active .topbar-mobile-chat {
            display: none !important;
          }
          .chat-active .topbar-mobile-list {
            display: none !important;
          }
          .chat-active .topbar-mobile-chat {
            display: flex !important;
          }

          /* Mobile name bar */
          .mobile-name-bar {
            display: none;
            padding: 8px 16px;
            background: #1a2930;
            border-bottom: 1px solid #0e171c;
            align-items: center;
            gap: 8px;
          }
          .chat-list-active .mobile-name-bar {
            display: flex !important;
          }
          .chat-active .mobile-name-bar {
            display: none !important;
          }
          .mobile-name-bar .user-label {
            font-size: 12px;
            color: #8696a0;
            white-space: nowrap;
          }
          .mobile-name-bar .user-input {
            flex: 1;
            width: auto;
            margin-right: 0;
            font-size: 13px;
            padding: 8px 10px;
            background: #111b21;
            border: 1px solid #0e171c;
            border-radius: 8px;
            color: #cfe2ea;
          }

          /* Mobile List Topbar */
          .topbar-mobile-list {
            justify-content: space-between;
            padding: 0 12px;
            height: 56px;
            background: #1f2c33;
          }
          .topbar-mobile-list .topbar-left {
            display: flex;
            align-items: center;
          }
          .topbar-mobile-list .title {
            font-size: 1.15rem;
            font-weight: 700;
            color: #e9edef;
          }
          .topbar-mobile-list .topbar-right {
            display: flex;
            align-items: center;
            gap: 4px;
          }

          /* Mobile Chat Topbar */
          .topbar-mobile-chat {
            padding: 0 8px;
            height: 56px;
            background: #1f2c33;
            gap: 6px;
          }

          .back-btn {
            background: none;
            border: none;
            color: #cfd8dc;
            padding: 8px;
            cursor: pointer;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
          }
          .back-btn:hover {
            background: rgba(255,255,255,0.08);
          }

          .chat-info {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
            min-width: 0;
            cursor: pointer;
          }
          .chat-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #00a884, #00d4aa);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 700;
            color: #fff;
            flex-shrink: 0;
          }
          .chat-details {
            flex: 1;
            min-width: 0;
          }
          .chat-name {
            font-size: 15px;
            font-weight: 600;
            color: #e9edef;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .chat-status {
            font-size: 12px;
            color: #8696a0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          /* Mobile icon button */
          .topbar-icon-btn {
            background: none;
            border: none;
            color: #cfd8dc;
            padding: 8px;
            cursor: pointer;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
          }
          .topbar-icon-btn:hover {
            background: rgba(255,255,255,0.08);
          }

          /* Mobile Dropdown Menu */
          .mobile-menu-overlay {
            position: fixed;
            inset: 0;
            z-index: 999;
          }
          .mobile-dropdown-menu {
            position: fixed;
            top: 50px;
            right: 8px;
            background: #233138;
            border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            z-index: 1000;
            padding: 6px 0;
            min-width: 200px;
            animation: menuSlideDown 0.2s ease;
          }
          .mobile-dropdown-menu button {
            width: 100%;
            background: none;
            border: none;
            color: #e9edef;
            padding: 14px 20px;
            font-size: 15px;
            font-weight: 500;
            text-align: left;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 14px;
            transition: background 0.15s;
          }
          .mobile-dropdown-menu button:hover {
            background: rgba(255,255,255,0.06);
          }
          .mobile-dropdown-menu .menu-logout {
            color: #ff4d4d;
            border-top: 1px solid rgba(134, 150, 160, 0.1);
          }
          .menu-name-input {
            padding: 10px 16px 6px;
          }
          .menu-name-label {
            display: block;
            font-size: 11px;
            color: #8696a0;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .menu-name-field {
            width: 100%;
            padding: 8px 12px;
            background: #111b21;
            border: 1px solid rgba(134, 150, 160, 0.2);
            border-radius: 6px;
            color: #e9edef;
            font-size: 14px;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.2s ease;
          }
          .menu-name-field:focus {
            border-color: #00a884;
          }
          .menu-name-field::placeholder {
            color: #667781;
          }
          .menu-divider {
            height: 1px;
            background: rgba(134, 150, 160, 0.1);
            margin: 6px 0;
          }

          @keyframes menuSlideDown {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        }

        /* Progress Bar Styles */
        .progress-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: rgba(15, 27, 33, 0.95);
          padding: 12px 20px;
          z-index: 999;
          border-bottom: 1px solid #0e171c;
        }
        
        .progress-bar {
          width: 100%;
          height: 6px;
          background: #0e171c;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00b894, #00d4aa);
          border-radius: 3px;
          transition: width 0.3s ease;
          position: relative;
        }
        
        .progress-fill::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          animation: shimmer 1.5s infinite;
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .progress-text {
          color: #cfe2ea;
          font-size: 0.9rem;
          text-align: center;
          font-weight: 500;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100%;
          background: rgba(0,0,0,0.4);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .modal {
          background: white;
          border-radius: 12px;
          padding: 24px;
          width: 350px;
          max-width: 90vw;
          text-align: center;
          box-shadow: 0 20px 50px rgba(0,0,0,0.3);
          animation: fadeIn 0.3s ease;
        }
        .modal-icon {
          margin-bottom: 12px;
        }
        .modal h3 {
          margin: 0;
          font-size: 1.4rem;
          font-weight: 600;
          color: #2b3a2f;
        }
        .modal p {
          font-size: 0.95rem;
          margin: 10px 0 20px;
          color: #555;
        }
        .modal-actions {
          display: flex;
          justify-content: space-between;
        }
        .cancel-btn {
          background: #ccc;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .confirm-btn {
          background: #ff4d4d;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .confirm-btn:hover {
          background: #e04343;
        }
        @keyframes fadeIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        /* Import Notification Styles */
        .import-notification {
          position: fixed;
          top: 80px;
          right: 20px;
          background: white;
          border-radius: 12px;
          padding: 16px;
          width: 300px;
          max-width: 90vw;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 1000;
          animation: slideInRight 0.3s ease;
        }
        
        .notification-content h4 {
          margin: 0 0 12px 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #2b3a2f;
        }
        
        .stats {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .stat-item {
          font-size: 0.9rem;
          padding: 4px 8px;
          border-radius: 6px;
          font-weight: 500;
        }
        
        .stat-item.added {
          background: #e8f5e8;
          color: #2d5a2d;
        }
        
        .stat-item.updated {
          background: #fff3cd;
          color: #856404;
        }
        
        .stat-item.skipped {
          background: #f8d7da;
          color: #721c24;
        }

       /* Modern Change Password Modal Styles */
.modern-modal {
  background: #fff;
  border-radius: 28px;
  padding: 48px 32px 32px 32px;
  width: 440px;
  max-width: 95vw;
  box-shadow: 0 16px 48px rgba(0,0,0,0.18);
  text-align: center;
  animation: fadeIn 0.3s;
  position: relative;
}
.modal-icon-large {
  margin-bottom: 12px;
}
.modern-modal h2 {
  margin: 0 0 24px 0;
  font-size: 2rem;
  font-weight: 700;
  color: #263238;
  letter-spacing: 0.5px;
}
.modal-fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-bottom: 28px;
}
.modern-modal input[type="password"] {
  padding: 16px 18px;
  border-radius: 12px;
  border: none;
  background: #333;
  color: #fff;
  font-size: 1.15rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  outline: none;
  transition: box-shadow 0.2s;
}
.modern-modal input[type="password"]::placeholder {
  color: #bdbdbd;
  font-size: 1.1rem;
}
.modern-modal input[type="password"]:focus {
  box-shadow: 0 0 0 2px #ffd600;
}
.modal-error {
  color: #d32f2f;
  font-size: 1rem;
  margin-top: 2px;
}
.modal-success {
  color: #388e3c;
  font-size: 1rem;
  margin-top: 2px;
}
.modern-modal .modal-actions {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  margin-top: 12px;
}
.modern-modal .cancel-btn {
  background: #e0e0e0;
  color: #bdbdbd;
  border: none;
  padding: 16px 0;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1.15rem;
  flex: 1;
  cursor: pointer;
  transition: background 0.2s;
}
.modern-modal .cancel-btn:enabled {
  color: #333;
}
.modern-modal .cancel-btn:hover:enabled {
  background: #ccc;
}
.modern-modal .confirm-btn {
  background: #ff4d4d;
  color: #fff;
  border: none;
  padding: 16px 0;
  border-radius: 12px;
  font-weight: 700;
  font-size: 1.15rem;
  flex: 1;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  transition: background 0.2s;
}
.modern-modal .confirm-btn:hover:enabled {
  background: #e04343;
}
        
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        /* ====================================== */
        /* === IMPORT PREVIEW MODAL STYLES ====== */
        /* ====================================== */
        .preview-modal {
          background: #1a2730;
          border-radius: 20px;
          width: 520px;
          max-width: 95vw;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          animation: fadeIn 0.3s ease;
          padding: 28px;
        }
        .preview-modal::-webkit-scrollbar {
          width: 4px;
        }
        .preview-modal::-webkit-scrollbar-thumb {
          background: rgba(134, 150, 160, 0.3);
          border-radius: 2px;
        }

        .preview-header {
          text-align: center;
          margin-bottom: 24px;
        }
        .preview-header-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(0, 184, 148, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
        }
        .preview-header h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          color: #e9edef;
        }
        .preview-subtitle {
          margin: 6px 0 0;
          font-size: 0.9rem;
          color: #8696a0;
        }

        /* Loading */
        .preview-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 40px 0;
          color: #8696a0;
          font-size: 0.95rem;
        }
        .preview-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(0, 184, 148, 0.2);
          border-top: 3px solid #00b894;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        /* Error */
        .preview-error-box {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid rgba(255, 107, 107, 0.25);
          border-radius: 10px;
          color: #ff6b6b;
          font-size: 0.9rem;
          margin-bottom: 16px;
        }

        /* Info Card */
        .preview-info-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(134, 150, 160, 0.12);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
        }
        .preview-info-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 8px 0;
        }
        .preview-info-row:not(:last-child) {
          border-bottom: 1px solid rgba(134, 150, 160, 0.08);
        }
        .preview-info-label {
          font-size: 0.8rem;
          color: #8696a0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          flex-shrink: 0;
          margin-right: 12px;
        }
        .preview-info-value {
          font-size: 0.9rem;
          color: #e9edef;
          font-weight: 500;
          text-align: right;
        }
        .preview-participants {
          font-size: 0.85rem;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Target Section */
        .preview-target-section {
          margin-bottom: 20px;
        }
        .preview-section-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #8696a0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 12px;
        }

        /* Target Cards */
        .preview-target-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1.5px solid rgba(134, 150, 160, 0.12);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 8px;
        }
        .preview-target-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(134, 150, 160, 0.25);
        }
        .preview-target-card.selected {
          background: rgba(0, 184, 148, 0.08);
          border-color: #00b894;
        }
        .preview-target-card input[type="radio"] {
          margin-top: 3px;
          accent-color: #00b894;
          flex-shrink: 0;
        }
        .target-card-content {
          flex: 1;
          min-width: 0;
        }
        .target-card-top {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .target-card-name {
          font-size: 0.95rem;
          font-weight: 600;
          color: #e9edef;
        }
        .target-card-count {
          font-size: 0.8rem;
          color: #8696a0;
          margin-left: auto;
        }
        .confidence-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .target-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          flex-wrap: wrap;
        }
        .target-card-participants {
          font-size: 0.8rem;
          color: #8696a0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 280px;
        }
        .target-card-reason {
          font-size: 0.75rem;
          color: #5f7d8e;
          font-style: italic;
        }
        .recommended-tag {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #00b894;
          margin-top: 6px;
        }

        /* Existing Chats Section */
        .preview-existing-section {
          margin-top: 12px;
        }
        .preview-existing-label {
          font-size: 0.8rem;
          color: #667781;
          margin-bottom: 8px;
        }
        .preview-existing-list {
          max-height: 200px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .preview-existing-list::-webkit-scrollbar {
          width: 3px;
        }
        .preview-existing-list::-webkit-scrollbar-thumb {
          background: rgba(134, 150, 160, 0.25);
          border-radius: 2px;
        }

        /* New Chat Option */
        .preview-target-card.new-chat .target-card-top {
          gap: 10px;
        }
        .preview-target-card.new-chat .target-card-name {
          color: #00b894;
        }

        /* Actions */
        .preview-actions {
          display: flex;
          gap: 12px;
          margin-top: 4px;
        }
        .preview-cancel-btn {
          flex: 1;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: rgba(134, 150, 160, 0.15);
          color: #8696a0;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .preview-cancel-btn:hover:enabled {
          background: rgba(134, 150, 160, 0.25);
          color: #e9edef;
        }
        .preview-cancel-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .preview-import-btn {
          flex: 1;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: #00b894;
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .preview-import-btn:hover:enabled {
          background: #019c7d;
        }
        .preview-import-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Mobile adjustments for preview modal */
        @media (max-width: 768px) {
          .preview-modal {
            width: 100%;
            max-width: 100vw;
            max-height: 90vh;
            border-radius: 16px 16px 0 0;
            padding: 20px;
          }
          .preview-participants {
            max-width: 180px;
          }
          .target-card-participants {
            max-width: 180px;
          }
        }
      `}</style>
    </div>
  )
} 