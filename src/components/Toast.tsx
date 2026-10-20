import { useEffect } from 'react'

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 4000)
    return () => clearTimeout(id)
  }, [message, onDone])

  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-[fade-in_150ms_ease-out]">
      <div className="flex items-center gap-2.5 rounded-full bg-zinc-900 py-2.5 pr-5 pl-3 text-sm text-white shadow-lg">
        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-xs">✓</span>
        {message}
        <span className="text-zinc-400">Queue updated.</span>
      </div>
    </div>
  )
}
