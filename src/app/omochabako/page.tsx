'use client'
import { useState } from 'react'

export default function OmochaBako() {
  const [ok, setOk] = useState(false)
  const fire = async () => {
    const r = await fetch('/api/trigger', { method: 'POST' })
    const j = await r.json()
    setOk(!!j.ok)
  }
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <h2 className="text-xl font-bold">おもちゃ箱</h2>
        <p className="text-sm text-gray-500">片付けたら押してね</p>
        <button onClick={fire} className="rounded-2xl border px-4 py-3">片付けた！</button>
        {ok && <div className="text-green-600 text-sm">チャットがはじまるよ！ /chat を見てね</div>}
      </div>
    </main>
  )
}