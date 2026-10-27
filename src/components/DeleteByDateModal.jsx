import { useCallback, useEffect, useState } from 'react'
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
  const { deleteMessagesByDate, goBack } = useChat()
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

  useEffect(() => {
    if (!open || !chatId) return
    let cancelled = false
    async function loadRange() {
      setLoadingRange(true)
      setError('')
      setConfirming(false)
      try {
        const token = localStorage.getItem('auth_token')
        const data = await apiGetMessageDateRange(chatId, token)
        if (cancelled) return
        const min = toDateInputValue(data.minTimestamp)
        const max = toDateInputValue(data.maxTimestamp)
        setMinDate(min)
        setMaxDate(max)
        setStartDate(min)
        setEndDate(max)
        setTotal(data.total ?? 0)
        setNullTimestampCount(data.nullTimestampCount ?? 0)
      } catch (err) {
        if (cancelled) return
        if (err?.status === 404) {
          setError(err.message || 'Chat not found')
          setTimeout(() => goBack?.(), 800)
          return
        }
        setError(err.message || 'Failed to load date range')
      } finally {
        if (!cancelled) setLoadingRange(false)
      }
    }
    loadRange()
    return () => { cancelled = true }
  }, [open, chatId, goBack])

  useEffect(() => {
    if (!open || !chatId || !startDate || !endDate) {
      setMatchingCount(null)
      return
    }
    if (startDate > endDate) {
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
        setMatchingCount(data.matchingCount ?? 0)
      } catch (err) {
        setMatchingCount(null)
        setError(err.message || 'Failed to preview messages')
      } finally {
        setLoadingPreview(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [open, chatId, startDate, endDate])

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
    startDate <= endDate &&
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
      setError(err.message || 'Failed to delete messages')
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
              Only this chat is affected. Messages outside the selected dates stay.
            </p>

            {loadingRange ? (
              <div className="date-delete-status">Loading date range…</div>
            ) : noMessages ? (
              <div className="date-delete-status">No messages in this chat</div>
            ) : (
              <div className="date-delete-fields">
                <label>
                  Start date
                  <input
                    type="date"
                    value={startDate}
                    min={minDate || undefined}
                    max={endDate || maxDate || undefined}
                    onChange={(e) => { setConfirming(false); setStartDate(e.target.value) }}
                    disabled={deleting}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || minDate || undefined}
                    max={maxDate || undefined}
                    onChange={(e) => { setConfirming(false); setEndDate(e.target.value) }}
                    disabled={deleting}
                  />
                </label>
              </div>
            )}

            {nullTimestampCount > 0 && (
              <p className="date-delete-note">
                {nullTimestampCount} message{nullTimestampCount === 1 ? '' : 's'} without a timestamp will not be removed.
              </p>
            )}

            <div className="date-delete-count">
              {loadingPreview && 'Counting messages…'}
              {!loadingPreview && matchingCount != null && `${matchingCount} messages in this range`}
            </div>

            {error && <div className="date-delete-error">{error}</div>}

            {confirming && canDelete && (
              <p className="date-delete-confirm">
                Delete {matchingCount} messages from {formatDisplayDate(startDate)} to {formatDisplayDate(endDate)}? This cannot be undone.
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
          background: rgba(0, 0, 0, 0.55);
          z-index: 1200;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .date-delete-modal {
          width: min(460px, 100%);
          background: #233138;
          border-radius: 16px 16px 0 0;
          padding: 20px 20px 24px;
          color: #e9edef;
        }
        @media (min-width: 769px) {
          .date-delete-overlay {
            align-items: center;
          }
          .date-delete-modal {
            border-radius: 12px;
            padding: 22px;
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
        }
        .date-delete-close {
          background: none;
          border: none;
          color: #8696a0;
          cursor: pointer;
          font-size: 18px;
          padding: 2px 6px;
        }
        .date-delete-helper,
        .date-delete-note,
        .date-delete-status,
        .date-delete-count {
          color: #8696a0;
          font-size: 13px;
          line-height: 1.45;
          margin: 10px 0 0;
        }
        .date-delete-fields {
          display: grid;
          gap: 12px;
          margin-top: 16px;
        }
        .date-delete-fields label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          color: #8696a0;
        }
        .date-delete-fields input {
          background: #111b21;
          border: 1px solid rgba(134, 150, 160, 0.25);
          border-radius: 8px;
          color: #e9edef;
          padding: 10px 12px;
          font-size: 14px;
        }
        .date-delete-error {
          color: #ff6b6b;
          font-size: 13px;
          margin-top: 10px;
        }
        .date-delete-confirm {
          color: #f5c2c2;
          font-size: 13px;
          margin: 12px 0 0;
          line-height: 1.45;
        }
        .date-delete-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 18px;
        }
        .date-delete-cancel,
        .date-delete-submit {
          border: none;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .date-delete-cancel {
          background: #2a3942;
          color: #e9edef;
        }
        .date-delete-submit {
          background: #e74c3c;
          color: #fff;
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
          border: 1px solid rgba(0, 168, 132, 0.4);
          padding: 10px 16px;
          border-radius: 8px;
          z-index: 1300;
          font-size: 13px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
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
          }
          .date-delete-icon-btn:hover {
            background: rgba(255,255,255,0.08);
            color: #ff8a80;
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
        }
        .date-delete-open-btn:hover {
          background: #3a2a2a;
          color: #ff8a80;
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
