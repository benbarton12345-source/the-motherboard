import { useEffect } from 'react'

// Small confirm popover anchored near a tap — used to confirm backfilling a
// past day on a habit or weekly-goal grid. Fixed-positioned so it escapes any
// clipped/overflow containers; clamped to stay on-screen.
export default function ConfirmPopover({ x, y, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const left = Math.max(8, Math.min(x - 100, window.innerWidth - 216))
  const top = Math.min(y + 10, window.innerHeight - 96)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div
        className="fixed z-50 w-[208px] bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl"
        style={{ left, top }}
      >
        <div className="text-xs text-gray-300 mb-3 leading-snug">{message}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 px-2 py-1.5 bg-emerald-400 text-gray-950 text-[11px] font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-1.5 text-[11px] text-gray-500 hover:text-white tracking-widest uppercase transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
