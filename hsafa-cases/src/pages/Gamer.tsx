import { Gamepad2 } from 'lucide-react'

const GAMER_HASEEF_ID = import.meta.env.VITE_GAMER_HASEEF_ID ?? ''

export default function GamerPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
        <Gamepad2 size={32} className="text-emerald-400" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">Gamer</h2>
      <p className="text-zinc-500 max-w-md">
        A simple game that Haseef can play.
      </p>
      {GAMER_HASEEF_ID && (
        <p className="text-xs text-zinc-600 font-mono mt-2">Haseef: {GAMER_HASEEF_ID}</p>
      )}
    </div>
  )
}
