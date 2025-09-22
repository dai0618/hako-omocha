'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import type { Toy, ChatMessage } from '@/types'

type GenerateResponse = {
  replies: ChatMessage[]
}

export default function ChatPage() {
  const [toys, setToys] = useState<Toy[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [round, setRound] = useState(0)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')

  // 1) 初期ロード
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('toys').select('*')
      if (!error && data) setToys(data as Toy[])
    }
    load()
  }, [])

  // 2) cleanup_triggers をRealtimeで監視（最初のラリー開始）
  useEffect(() => {
    const ch = supabase
      .channel('cleanup_triggers')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cleanup_triggers' },
        () => {
          if (round === 0) void nextRound()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, messages, toys])

  // Supabaseの画像URL→data URL(base64)
  const fetchAsDataUrl = async (url: string): Promise<string> => {
    const res = await fetch(url)
    if (!res.ok) throw new Error('image fetch failed')
    const blob = await res.blob()
    const arrayBuf = await blob.arrayBuffer()
    const b64 = Buffer.from(arrayBuf).toString('base64')
    const mime = blob.type || 'image/jpeg'
    return `data:${mime};base64,${b64}`
  }

  const nextRound = async (): Promise<void> => {
    if (busy || round >= 5 || toys.length === 0) return
    setBusy(true)

    // 最初のラリーだけ代表おもちゃの画像を dataURL で同送
    let firstRoundImage: string | undefined
    let firstToyId: string | undefined
    if (round === 0 && toys[0]?.image_url) {
      try {
        firstRoundImage = await fetchAsDataUrl(toys[0].image_url)
        firstToyId = toys[0].id
      } catch (e) {
        console.warn('image fetch -> dataURL failed', e)
      }
    }

    try {
      const resp = await fetch('/api/chat/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toys, history: messages, firstRoundImage, firstToyId }),
      })
      if (!resp.ok) throw new Error('generate api failed')
      const json: GenerateResponse = await resp.json()
      setMessages((m) => [...m, ...(json.replies || [])])
      setRound((r) => r + 1)
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  const sendUser = async (): Promise<void> => {
    if (!input.trim()) return
    const userMsg: ChatMessage = { role: 'user', content: input }
    setMessages((m) => [...m, userMsg])
    const prev = input
    setInput('')
    setBusy(true)
    try {
      const resp = await fetch('/api/chat/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toys, history: [...messages, userMsg], userInput: prev }),
      })
      if (!resp.ok) throw new Error('generate api failed')
      const json: GenerateResponse = await resp.json()
      setMessages((m) => [...m, ...(json.replies || [])])
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col">
      {/* ヘッダー */}
      <header className="px-4 pt-4">
        <Link href="/" className="inline-block">
          <h2 className="text-xl font-bold mt-2 mb-6">はこおもちゃ</h2>
        </Link>
      </header>

      {/* メッセージリスト（送信バーの分だけ下に余白） */}
      <ul className="flex-1 overflow-y-auto px-4 pb-[96px] space-y-2">
        {messages.map((m, i) => (
          <li key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className="inline-block max-w-[80%] rounded-2xl border px-3 py-2 text-sm">
              {m.name ? <b className="mr-1">{m.name}：</b> : null}
              {m.content}
              {m.imageDataUrl && (
                <div className="mt-2">
                  <Image
                    src={m.imageDataUrl}
                    alt=""
                    width={512}
                    height={512}
                    className="rounded-xl h-auto w-full max-w-[320px]"
                    unoptimized
                    priority
                  />
                </div>
              )}
            </div>
          </li>
        ))}
        {round >= 5 && (
          <li className="text-center text-xs text-gray-500 py-2">
            おもちゃ同士の会話は止まりました（5ラリー）。でも人間の入力には答えるよ。
          </li>
        )}
      </ul>

      {/* 送信バー（下固定・iOSセーフエリア対応） */}
      <div
        className="fixed left-0 right-0 bottom-0 border-t bg-white/90 backdrop-blur
                   supports-[padding:max(0px)]:[padding-bottom:env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto max-w-screen-sm px-4 py-3">
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-2xl px-3 py-2 text-[16px] border-black text-black"
              placeholder="メッセージを入力"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendUser()
              }}
            />
            <button
              onClick={() => void sendUser()}
              disabled={busy}
              className="rounded-2xl border px-4 border-black text-black disabled:opacity-50"
            >
              送信
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
