import { useRef, useState } from 'react'
import { useChat } from '../state/ChatContext'
import { apiUploadZip } from '../lib/api'

export default function Topbar() {
  const inputRef = useRef(null)
  const { importFromZip, toggleSidebar, logout, globalUserName, setGlobalName, importStats, fetchChatsFromAPI } = useChat()
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const handleLogout = () => {
    if (logout) {
      logout()
    } else {
      localStorage.clear()
      window.location.href = '/'
    }
  }

  return (
    <>
      <div className="topbar">
        <button className="icon-button" aria-label="Open sidebar" onClick={toggleSidebar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6h18M3 12h18M3 18h18"
              stroke="#cfd8dc" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="title">WhatsApp Chat Viewer</div>

        <div className="user-name-section">
          <label htmlFor="globalUserName" style={{ color: '#8696a0', fontSize: 12, marginRight: 8 }}>
            Your name:
          </label>
          <input
            id="globalUserName"
            placeholder="Type exactly as it appears in chat"
            value={globalUserName || ''}
            onChange={(e) => setGlobalName(e.target.value)}
            style={{
              background: '#0f1b21', 
              border: '1px solid #0e171c', 
              color: '#cfe2ea',
              borderRadius: 8, 
              padding: '6px 8px', 
              fontSize: 12, 
              width: 200,
              marginRight: 16
            }}
          />
        </div>

        <div className="actions">
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              try {
                const token = localStorage.getItem('auth_token')
                if (token) {
                  const result = await apiUploadZip(file, token)
                  const { addedChats, updatedChats, addedMessages, skippedMessages, savedMedia } = result || {}
                  alert(`Upload complete\nAdded chats: ${addedChats ?? 0}\nUpdated chats: ${updatedChats ?? 0}\nAdded messages: ${addedMessages ?? 0}\nSkipped messages: ${skippedMessages ?? 0}\nSaved media: ${savedMedia ?? 0}`)
                  // Refresh chat list after successful upload
                  await fetchChatsFromAPI()
                } else {
                  await importFromZip(file)
                }
              } catch (err) {
                if (err?.status === 401) {
                  alert('Session expired. Please log in again.')
                  localStorage.removeItem('auth_token')
                  localStorage.removeItem('auth_user')
                  window.location.reload()
                  return
                }
                alert(err.message || 'Failed to import/upload ZIP')
              }
            }}
            style={{ display: 'none' }}
          />
          <button onClick={() => inputRef.current?.click()}>
            Import ZIP
          </button>

          {/* Modern Red Logout Button */}
          <button className="logout-btn" onClick={() => setShowLogoutModal(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" 
              width="16" height="16" fill="currentColor"
              viewBox="0 0 16 16" style={{ marginRight: '6px' }}>
              <path d="M6 12V9h4V7H6V4L0 8l6 4z"/>
              <path d="M13 2H9v2h4v8H9v2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
            </svg>
            Logout
          </button>
        </div>
      </div>

      {/* Import Statistics Notification */}
      {importStats && (
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

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg xmlns="http://www.w3.org/2000/svg"
                width="36" height="36" fill="#ff4d4d"
                viewBox="0 0 16 16">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
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
        .topbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 16px;
          background: #0f1b21;
          border-bottom: 1px solid #0e171c;
        }
        
        .user-name-section {
          display: flex;
          align-items: center;
          margin-left: auto;
          margin-right: 16px;
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
        
        .user-name-section input {
          transition: border-color 0.2s ease;
        }
        
        .user-name-section input:focus {
          outline: none;
          border-color: #00b894;
        }
        
        .logout-btn {
          background: #ff4d4d;
          color: white;
          padding: 8px 14px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          border: none;
          cursor: pointer;
          transition: background 0.3s ease;
        }
        .logout-btn:hover {
          background: #e04343;
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
        
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}
