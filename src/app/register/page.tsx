'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function RegisterPage() {
  const [image, setImage] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false) // ← メタデータ読み込み完了フラグ
  const [err, setErr] = useState<string>('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // カメラ起動（リアカメラ希望）
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

        // iOS Safari 対策
        video.setAttribute('playsinline', 'true')
        video.playsInline = true
        video.muted = true
        video.srcObject = stream

        // メタデータ読み込み待ち
        await new Promise<void>((resolve) => {
          const onReady = () => {
            video.removeEventListener('loadedmetadata', onReady)
            resolve()
          }
          if (video.readyState >= 1 && video.videoWidth && video.videoHeight) {
            resolve()
          } else {
            video.addEventListener('loadedmetadata', onReady, { once: true })
          }
        })

        await video.play()
        // 一部ブラウザは play 後に寸法が確定するので再確認
        if (!video.videoWidth || !video.videoHeight) {
          await new Promise((r) => setTimeout(r, 50))
        }

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
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // 正方形で撮影
  const takePhoto = async () => {
    setErr('')
    const video = videoRef.current
    if (!video) return

    // 念のための保険：寸法が 0 の場合は短時間待ってリトライ
    let vw = video.videoWidth
    let vh = video.videoHeight
    if (!vw || !vh) {
      await new Promise((r) => setTimeout(r, 50))
      vw = video.videoWidth
      vh = video.videoHeight
    }
    if (!vw || !vh) {
      setErr('カメラがまだ準備中です。数秒待ってからもう一度お試しください。')
      return
    }

    const size = Math.min(vw, vh) // 正方形クロップ
    const sx = (vw - size) / 2
    const sy = (vh - size) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.9)
    )
    if (!blob) {
      setErr('画像の生成に失敗しました')
      return
    }
    const file = new File([blob], `toy-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setImage(file)
  }

  const submit = async () => {
    if (!image) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('image', image)
      fd.append('name', name)
      const resp = await fetch('/api/toys', { method: 'POST', body: fd })
      await resp.json()
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-4 space-y-6">
      <Link href="/">
        <h2 className="text-xl font-bold mt-2 mb-6">はこおもちゃ</h2>
      </Link>

      <div className="relative w-full max-w-sm mx-auto">
        <div className="aspect-square rounded-2xl overflow-hidden border">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="w-full max-w-sm mx-auto grid gap-4">
        <button
          onClick={takePhoto}
          disabled={!ready}
          className="rounded-2xl border px-4 py-3 mx-auto w-40 bg-white text-black font-bold mt-2 disabled:opacity-50"
        >
          写真をとる
        </button>

        {image && (
          <div className="text-center text-sm opacity-80">
            撮影済み: {image.name}（{Math.round(image.size / 1024)} KB）
          </div>
        )}

        <input
          placeholder="おもちゃの名前を入力してね！"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-2xl px-4 py-3 text-[16px] mt-5"
        />

        <button
          onClick={submit}
          disabled={loading || !image}
          className="rounded-2xl border px-4 py-3 disabled:opacity-50"
        >
          {loading ? '登録中…' : '登録する'}
        </button>

        {err && <p className="text-red-600 text-sm">{err}</p>}
      </div>
    </main>
  )
}
