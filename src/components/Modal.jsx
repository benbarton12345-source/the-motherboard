export default function Modal({ title, onClose, onSave, saveLabel = 'Save', saveDisabled = false, saving = false, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
          <h2 className="text-sm tracking-widest uppercase text-gray-400">{title}</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto p-5 flex-1 space-y-4">
          {children}
        </div>
        <div className="flex items-center gap-3 p-5 border-t border-gray-800 shrink-0">
          <button
            onClick={onSave}
            disabled={saveDisabled || saving}
            className="px-4 py-2 bg-emerald-400 text-gray-950 text-xs font-bold tracking-widest uppercase rounded hover:bg-emerald-300 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-white tracking-widest uppercase transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}
