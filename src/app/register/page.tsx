'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function RegisterPage() {
  const [image, setImage] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState<string>('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('theme-pink')
    document.body.classList.add('theme-pink')
    return () => {
      document.documentElement.classList.remove('theme-pink')
      document.body.classList.remove('theme-pink')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('この端末/ブラウザはカメラに対応していません')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) return
        streamRef.current = stream

        const video = videoRef.current
        if (!video) return
        video.setAttribute('playsinline', 'true')
        video.playsInline = true
        video.muted = true
        video.srcObject = stream

        await new Promise<void>((resolve) => {
          const onReady = () => {
            video.removeEventListener('loadedmetadata', onReady)
            resolve()
          }
          if (video.readyState >= 1 && video.videoWidth && video.videoHeight) resolve()
          else video.addEventListener('loadedmetadata', onReady, { once: true })
        })

        await video.play()
        if (!video.videoWidth || !video.videoHeight) await new Promise(r => setTimeout(r, 50))
        if (!video.videoWidth || !video.videoHeight) {
          setErr('カメラ映像の初期化に失敗しました')
          return
        }
        setReady(true)
      } catch (e) {
        console.warn('camera error', e)
        setErr('カメラの起動に失敗しました。権限やHTTPS接続をご確認ください。')
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const takePhoto = async () => {
    setErr('')
    const video = videoRef.current
    if (!video) return
    let vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) { await new Promise(r=>setTimeout(r,50)); vw = video.videoWidth; vh = video.videoHeight }
    if (!vw || !vh) { setErr('カメラがまだ準備中です。数秒待ってもう一度。'); return }

    const size = Math.min(vw, vh), sx = (vw - size)/2, sy = (vh - size)/2
    const canvas = document.createElement('canvas')
    canvas.width = size; canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
    const blob = await new Promise<Blob|null>(res => canvas.toBlob(res, 'image/jpeg', 0.9))
    if (!blob) { setErr('画像の生成に失敗しました'); return }
    setImage(new File([blob], `toy-${Date.now()}.jpg`, { type: 'image/jpeg' }))
  }

  const submit = async () => {
    if (!name.trim()) {
      alert('おもちゃの名前を入力してください')
      return
    }
    if (!image) {
      alert('写真を撮影してください')
      return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('image', image)
      fd.append('name', name)
      await fetch('/api/toys', { method: 'POST', body: fd })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      /* ▼ 全体をもっと下に：上パディング増量 */
      className="relative min-h-[100dvh] p-4 pt-28 sm:pt-32
                 supports-[padding:max(0px)]:[padding-top:env(safe-area-inset-top)]"
    >
      {/* ヘッダー（戻るボタン） */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-transparent
                         supports-[padding:max(0px)]:[padding-top:env(safe-area-inset-top)]">
        <div className="relative h-14 flex items-center">
          <Link href="/" className="absolute left-4 inline-block active:scale-95" aria-label="ホームに戻る">
            <Image src="/back.png" alt="ホームに戻る" width={40} height={40} priority />
          </Link>
          {/* <h1 className="mx-auto text-base font-semibold text-pink-700">おもちゃ登録</h1> */}
        </div>
      </header>

      {/* ヘッダー以外は中央寄り配置 */}
      <section className="max-w-[520px] mx-auto mt-30 grid gap-6 justify-items-center text-center">
        {/* カメラプレビュー */}
        <div className="relative w-[70vw] max-w-[480px]">
          <div className="aspect-square rounded-2xl overflow-hidden border border-pink-300 bg-white/40">
            <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
          </div>
        </div>

        {/* ▼ カメラボタン：白枠（ボーダー＆白背景）を完全に削除 */}
        <button
          onClick={takePhoto}
          disabled={!ready}
          className="mx-auto active:scale-95 bg-transparent text-[#fc8cc2] p-0"
          aria-label="写真をとる"
          /* 枠を出さないために focus:outline-none も付与 */
        >
          <span className="sr-only">写真をとる</span>
          <Image src="/camera.png" alt="" width={96} height={96} className="h-auto w-15" priority />
        </button>

        {image && (
          <div className="text-center text-sm opacity-80">
            撮影済み: {image.name}（{Math.round(image.size / 1024)} KB）
          </div>
        )}

        {/* 入力欄（縦長・横短／中央ぞろえ） */}
        <div className="w-full flex justify-center">
          <input
            placeholder="おもちゃなまえを入力"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-56 sm:w-64 border rounded-4xl px-4 py-5 text-[13px]
                      bg-white text-[#fc8cc2] caret-[#fc8cc2] placeholder:text-[#fc8cc2]
                      shadow-sm text-center"
          />
        </div>

        {/* 登録ボタン（入力欄と同サイズ／中央ぞろえ） */}
        <button
          onClick={submit}
          disabled={loading}
          className="w-56 sm:w-64 border rounded-4xl px-4 py-5 text-[13px]
                    bg-[#fc8cc2] text-white border-white
                    hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed text-center"
          aria-label="登録する"
        >
          とうろくする　♡
        </button>


        {err && <p className="text-red-600 text-sm text-center">{err}</p>}
      </section>
    </main>
  )
}
