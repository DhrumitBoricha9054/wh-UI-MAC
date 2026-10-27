import { useCallback, useEffect, useState, useRef } from 'react'
import { useChat } from '../state/ChatContext'
import { apiGetMessageDateRange, apiPreviewMessagesByDate } from '../lib/api'

function toDateInputValue(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/)
    return match ? match[0] : ''
  }
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function DeleteByDateModal({ open, onClose, chatId, chatName }) {
  const { deleteMessagesByDate, goBack, setChats } = useChat()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minDate, setMinDate] = useState('')
  const [maxDate, setMaxDate] = useState('')
  const [total, setTotal] = useState(null)
  const [nullTimestampCount, setNullTimestampCount] = useState(0)
  const [matchingCount, setMatchingCount] = useState(null)
  const [loadingRange, setLoadingRange] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast] = useState('')
  const exitTimeoutRef = useRef(null)

  const reset = useCallback(() => {
    setStartDate('')
    setEndDate('')
    setMinDate('')
    setMaxDate('')
    setTotal(null)
    setNullTimestampCount(0)
    setMatchingCount(null)
    setLoadingRange(false)
    setLoadingPreview(false)
    setDeleting(false)
    setError('')
    setConfirming(false)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current)
    }
  }, [])

  // Load date range when modal opens
  useEffect(() => {
    if (!open || !chatId) {
      reset()
      return
    }

    let cancelled = false
    async function loadRange() {
      setLoadingRange(true)
      setError('')
      setConfirming(false)
      try {
        const token = localStorage.getItem('auth_token')
        const data = await apiGetMessageDateRange(chatId, token)
        if (cancelled) return

        const min = toDateInputValue(data?.minTimestamp)
        const max = toDateInputValue(data?.maxTimestamp)
        setMinDate(min)
        setMaxDate(max)
        setStartDate(min)
        setEndDate(max)
        setTotal(data?.total ?? (min && max ? 1 : 0))
        setNullTimestampCount(data?.nullTimestampCount ?? 0)
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load date range:', err)

        // Only go back to chat list if chat was genuinely not found / deleted (404 with "Chat not found")
        const isChatNotFound = err?.status === 404 && /chat not found/i.test(err?.message || '')
        if (isChatNotFound) {
          setError('Chat was deleted or not found. Returning to list…')
          onClose?.()
          if (typeof setChats === 'function') {
            setChats(prev => prev.filter(c => c.id !== chatId.toString()))
          }
          exitTimeoutRef.current = setTimeout(() => {
            goBack?.()
          }, 800)
          return
        }

        // If 404 because no messages in this chat, or empty date range
        if (err?.status === 404 || /no messages/i.test(err?.message || '')) {
          setTotal(0)
          setMinDate('')
          setMaxDate('')
          setStartDate('')
          setEndDate('')
          return
        }

        // Keep modal open and show error message
        setError(err?.message || 'Failed to load date range')
      } finally {
        if (!cancelled) setLoadingRange(false)
      }
    }

    loadRange()
    return () => {
      cancelled = true
    }
  }, [open, chatId, goBack, onClose, reset, setChats])

  // Validate dates order
  const isDateOrderInvalid = Boolean(startDate && endDate && startDate > endDate)

  // Preview matching messages count with debounce
  useEffect(() => {
    if (!open || !chatId || !startDate || !endDate) {
      setMatchingCount(null)
      return
    }

    if (isDateOrderInvalid) {
      setMatchingCount(0)
      setError('startDate must be before or equal to endDate')
      return
    }

    const token = localStorage.getItem('auth_token')
    const timer = setTimeout(async () => {
      setLoadingPreview(true)
      setError('')
      try {
        const data = await apiPreviewMessagesByDate(chatId, { startDate, endDate }, token)
        setMatchingCount(data?.matchingCount ?? 0)
      } catch (err) {
        setMatchingCount(null)
        if (err?.status === 400 && /before or equal/i.test(err?.message || '')) {
          setError('startDate must be before or equal to endDate')
        } else {
          setError(err?.message || 'Failed to preview messages')
        }
      } finally {
        setLoadingPreview(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [open, chatId, startDate, endDate, isDateOrderInvalid])

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const noMessages = total === 0
  const canDelete = Boolean(
    chatId &&
    startDate &&
    endDate &&
    !isDateOrderInvalid &&
    matchingCount > 0 &&
    !loadingRange &&
    !loadingPreview &&
    !deleting &&
    !noMessages
  )

  const handleClose = () => {
    if (deleting) return
    reset()
    onClose?.()
  }

  const handleSwapDates = () => {
    setConfirming(false)
    const temp = startDate
    setStartDate(endDate)
    setEndDate(temp)
    setError('')
  }

  const handleDelete = async () => {
    if (!canDelete) return
    if (!confirming) {
      setConfirming(true)
      return
    }

    setDeleting(true)
    setError('')
    try {
      const res = await deleteMessagesByDate(chatId, startDate, endDate)
      const deleted = res?.deleted ?? matchingCount ?? 0
      setToast(`Deleted ${deleted} messages`)
      reset()
      onClose?.()
    } catch (err) {
      setConfirming(false)
      if (err?.status === 404 && /message not found/i.test(err?.message || '')) {
        setError('Messages were already deleted or not found. Refreshing thread…')
      } else {
        setError(err?.message || 'Failed to delete messages')
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {toast && <div className="date-delete-toast">{toast}</div>}
      {open && (
        <div className="date-delete-overlay" onClick={handleClose}>
          <div className="date-delete-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="date-delete-header">
              <h2>Delete messages in “{chatName || 'this chat'}”</h2>
              <button className="date-delete-close" onClick={handleClose} aria-label="Close" disabled={deleting}>✕</button>
            </div>
            <p className="date-delete-helper">
              Only this chat is affected. Messages outside the selected dates stay. Empty chats remain until deleted from the chat list.
            </p>

            {loadingRange ? (
              <div className="date-delete-status">
                <div className="date-spinner"></div>
                Loading date range…
              </div>
            ) : noMessages ? (
              <div className="date-delete-status no-msgs">No messages in this chat</div>
            ) : (
              <div className="date-delete-fields">
                <label>
                  Start date
                  <input
                    type="date"
                    className={isDateOrderInvalid ? 'date-input-error' : ''}
                    value={startDate}
                    min={minDate || undefined}
                    max={endDate || maxDate || undefined}
                    onChange={(e) => {
                      setConfirming(false)
                      setStartDate(e.target.value)
                    }}
                    disabled={deleting}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    className={isDateOrderInvalid ? 'date-input-error' : ''}
                    value={endDate}
                    min={startDate || minDate || undefined}
                    max={maxDate || undefined}
                    onChange={(e) => {
                      setConfirming(false)
                      setEndDate(e.target.value)
                    }}
                    disabled={deleting}
                  />
                </label>
              </div>
            )}

            {isDateOrderInvalid && (
              <div className="date-order-warning">
                <span>Start date must be before or equal to end date.</span>
                <button type="button" className="date-swap-btn" onClick={handleSwapDates}>
                  Swap dates
                </button>
              </div>
            )}

            {nullTimestampCount > 0 && !noMessages && (
              <p className="date-delete-note">
                ℹ️ {nullTimestampCount} message{nullTimestampCount === 1 ? '' : 's'} without a timestamp will not be removed.
              </p>
            )}

            {!noMessages && (
              <div className="date-delete-count">
                {loadingPreview && <span className="preview-loading">Counting messages…</span>}
                {!loadingPreview && matchingCount != null && (
                  <span className={matchingCount === 0 ? 'count-zero' : 'count-positive'}>
                    {matchingCount} message{matchingCount === 1 ? '' : 's'} in this range
                  </span>
                )}
              </div>
            )}

            {error && <div className="date-delete-error">{error}</div>}

            {confirming && canDelete && (
              <p className="date-delete-confirm">
                ⚠️ Delete <strong>{matchingCount} messages</strong> from <strong>{formatDisplayDate(startDate)}</strong> to <strong>{formatDisplayDate(endDate)}</strong>? This cannot be undone.
              </p>
            )}

            <div className="date-delete-actions">
              <button className="date-delete-cancel" onClick={handleClose} disabled={deleting}>Cancel</button>
              <button
                className="date-delete-submit"
                onClick={handleDelete}
                disabled={!canDelete}
              >
                {deleting ? 'Deleting…' : confirming ? `Delete ${matchingCount} messages` : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .date-delete-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          z-index: 1200;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: dateFadeIn 0.2s ease-out;
        }
        @keyframes dateFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .date-delete-modal {
          width: min(460px, 100%);
          background: #233138;
          border-radius: 16px 16px 0 0;
          padding: 20px 20px 24px;
          color: #e9edef;
          box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.5);
          max-height: 90vh;
          overflow-y: auto;
        }
        @media (min-width: 769px) {
          .date-delete-overlay {
            align-items: center;
          }
          .date-delete-modal {
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
          }
        }
        .date-delete-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .date-delete-header h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 600;
          line-height: 1.35;
          color: #e9edef;
        }
        .date-delete-close {
          background: none;
          border: none;
          color: #8696a0;
          cursor: pointer;
          font-size: 20px;
          padding: 2px 6px;
          line-height: 1;
          border-radius: 4px;
          transition: color 0.15s, background 0.15s;
        }
        .date-delete-close:hover {
          color: #e9edef;
          background: rgba(255, 255, 255, 0.08);
        }
        .date-delete-helper {
          color: #8696a0;
          font-size: 13px;
          line-height: 1.45;
          margin: 8px 0 0;
        }
        .date-delete-status {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #8696a0;
          font-size: 13px;
          line-height: 1.45;
          margin: 16px 0 4px;
          padding: 12px;
          background: #111b21;
          border-radius: 8px;
        }
        .date-delete-status.no-msgs {
          color: #aebac1;
          font-style: italic;
        }
        .date-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0, 168, 132, 0.3);
          border-top-color: #00a884;
          border-radius: 50%;
          animation: dateSpin 0.7s linear infinite;
        }
        @keyframes dateSpin {
          to { transform: rotate(360deg); }
        }
        .date-delete-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 16px;
        }
        @media (max-width: 480px) {
          .date-delete-fields {
            grid-template-columns: 1fr;
          }
        }
        .date-delete-fields label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          color: #8696a0;
          font-weight: 500;
        }
        .date-delete-fields input {
          background: #111b21;
          border: 1px solid rgba(134, 150, 160, 0.25);
          border-radius: 8px;
          color: #e9edef;
          padding: 10px 12px;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .date-delete-fields input:focus {
          border-color: #00a884;
          box-shadow: 0 0 0 2px rgba(0, 168, 132, 0.2);
        }
        .date-delete-fields input.date-input-error {
          border-color: #e74c3c !important;
          box-shadow: 0 0 0 2px rgba(231, 76, 60, 0.25) !important;
        }
        .date-order-warning {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(231, 76, 60, 0.12);
          border: 1px solid rgba(231, 76, 60, 0.3);
          border-radius: 8px;
          padding: 8px 12px;
          margin-top: 10px;
          font-size: 12px;
          color: #ff8a80;
          gap: 8px;
        }
        .date-swap-btn {
          background: #e74c3c;
          border: none;
          color: white;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .date-swap-btn:hover {
          background: #c0392b;
        }
        .date-delete-note {
          color: #ffd600;
          font-size: 12px;
          line-height: 1.4;
          margin: 10px 0 0;
          background: rgba(255, 214, 0, 0.08);
          border-radius: 6px;
          padding: 6px 10px;
        }
        .date-delete-count {
          color: #8696a0;
          font-size: 13px;
          line-height: 1.45;
          margin: 12px 0 0;
          min-height: 18px;
        }
        .date-delete-count .count-positive {
          color: #00a884;
          font-weight: 500;
        }
        .date-delete-count .count-zero {
          color: #8696a0;
        }
        .date-delete-error {
          color: #ff6b6b;
          font-size: 13px;
          margin-top: 10px;
          background: rgba(231, 76, 60, 0.12);
          border-radius: 6px;
          padding: 8px 10px;
        }
        .date-delete-confirm {
          color: #f5c2c2;
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.4);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          margin: 14px 0 0;
          line-height: 1.45;
        }
        .date-delete-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }
        .date-delete-cancel,
        .date-delete-submit {
          border: none;
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
        }
        .date-delete-cancel {
          background: #2a3942;
          color: #e9edef;
        }
        .date-delete-cancel:hover:not(:disabled) {
          background: #374248;
        }
        .date-delete-submit {
          background: #e74c3c;
          color: #fff;
        }
        .date-delete-submit:hover:not(:disabled) {
          background: #c0392b;
        }
        .date-delete-submit:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .date-delete-toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          background: #111b21;
          color: #e9edef;
          border: 1px solid rgba(0, 168, 132, 0.6);
          padding: 10px 18px;
          border-radius: 8px;
          z-index: 1300;
          font-size: 13px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          animation: dateToastIn 0.25s ease-out;
        }
        @keyframes dateToastIn {
          from { transform: translate(-50%, 12px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </>
  )
}

export function DeleteByDateButton({ onClick, variant = 'button', disabled }) {
  if (variant === 'icon') {
    return (
      <button
        type="button"
        className="date-delete-icon-btn"
        onClick={onClick}
        disabled={disabled}
        title="Delete messages by date"
        aria-label="Delete messages by date"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <style>{`
          .date-delete-icon-btn {
            background: none;
            border: none;
            color: #cfd8dc;
            padding: 8px;
            cursor: pointer;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: background 0.15s, color 0.15s;
          }
          .date-delete-icon-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.08);
            color: #ff8a80;
          }
          .date-delete-icon-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }
        `}</style>
      </button>
    )
  }

  return (
    <button
      type="button"
      className="date-delete-open-btn"
      onClick={onClick}
      disabled={disabled}
      title="Delete messages by date"
    >
      Delete messages by date
      <style>{`
        .date-delete-open-btn {
          flex-shrink: 0;
          background: #2a3942;
          color: #e9edef;
          border: 1px solid rgba(231, 76, 60, 0.45);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .date-delete-open-btn:hover:not(:disabled) {
          background: #3a2a2a;
          color: #ff8a80;
          border-color: rgba(231, 76, 60, 0.7);
        }
        .date-delete-open-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        @media (max-width: 768px) {
          .chat-window .date-delete-open-btn {
            display: none;
          }
        }
      `}</style>
    </button>
  )
}
