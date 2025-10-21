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

  // --- 初期ロード: おもちゃ一覧 ---
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('toys').select('*')
      if (!error && data) setToys(data as Toy[])
    }
    load()
  }, [])

  // --- Realtime 監視（最初のラリー開始） ---
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

  // 次ラリー
  const nextRound = async (): Promise<void> => {
    if (busy || round >= 5 || toys.length === 0) return
    setBusy(true)

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

  // 送信
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

  // --- 丸アイコン（おもちゃ写真）解決ロジック ---
  // ChatMessage に toyId があれば最優先で該当Toyの image_url を使う。
  // なければ name で一致するToyを探す。見つからなければユーザー/デフォルトにフォールバック。
  const getAvatarSrc = (m: ChatMessage): string => {
    // toyId 優先
    const byId = (m as any).toyId
      ? toys.find((t) => t.id === (m as any).toyId)
      : undefined
    if (byId?.image_url) return byId.image_url

    // name で推測
    if (m.name) {
      const byName = toys.find((t) => t.name === m.name)
      if (byName?.image_url) return byName.image_url
    }

    // ロール別フォールバック
    if (m.role === 'user') return '/user.png' // 任意のデフォルトユーザーアイコン（置いてなければ作成）
    return '/toy.png' // 任意のデフォルトおもちゃアイコン（置いてなければ作成）
  }

  return (
    <main className="min-h-dvh flex flex-col" style={{ backgroundColor: '#fffcf0' }}>
      {/* ヘッダー */}
      <header className="px-4 pt-3 pb-3 bg-[#02ad48] text-white">
        <div className="mx-auto max-w-screen-sm flex items-center gap-3">
          <Link href="/" aria-label="戻る" className="shrink-0">
            <Image src="/back.png" alt="back" width={28} height={28} priority />
          </Link>
          <h2 className="text-xl font-bold leading-none">はこおもちゃ</h2>
        </div>
      </header>

      {/* メッセージリスト */}
      <ul className="flex-1 overflow-y-auto px-4 pb-[120px] pt-3 space-y-3 mx-auto w-full max-w-screen-sm">
        {messages.map((m, i) => {
          const isUser = m.role === 'user'
          const avatar = getAvatarSrc(m)
          return (
            <li key={i} className={`flex items-start ${isUser ? 'justify-end' : 'justify-start'}`}>
              {/* 左側（相手）/ 右側（自分）でアイコンの位置を切り替え */}
              {!isUser && (
                <Image
                  src={avatar}
                  alt=""
                  width={36}
                  height={36}
                  className="rounded-full mr-2 mt-0.5 border border-black/10"
                  unoptimized
                />
              )}

              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed border
                ${isUser ? 'bg-white/90 border-black/20' : 'bg-white/90 border-black/20'}`}
              >
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

              {isUser && (
                <Image
                  src={avatar}
                  alt=""
                  width={36}
                  height={36}
                  className="rounded-full ml-2 mt-0.5 border border-black/10"
                  unoptimized
                />
              )}
            </li>
          )
        })}
        {round >= 5 && (
          <li className="text-center text-xs text-gray-600 py-2">
            おもちゃ同士の会話は止まりました（5ラリー）。でも人間の入力には答えるよ。
          </li>
        )}
      </ul>

      {/* 送信バー（下固定・iOSセーフエリア） */}
      <div
        className="fixed left-0 right-0 bottom-0 border-t border-black/10 bg-[#02ad48] backdrop-blur
                  supports-[padding:max(0px)]:[padding-bottom:env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto max-w-screen-sm px-4 py-3">
          <div className="flex gap-2 items-center">
            <input
              className="flex-1 h-12 rounded-2xl px-3 text-[16px] bg-white text-black border border-black/20"
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
              aria-label="送信"
              title="送信"
              className="shrink-0 h-12 w-12 p-0 bg-transparent border-0 disabled:opacity-50"
            >
              <Image
                src="/send.png"
                alt="send"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
                priority
              />
            </button>
          </div>
        </div>
      </div>

    </main>
  )
}
