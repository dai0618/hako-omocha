'use client'
import { useEffect, useRef, useState } from 'react'

import Link from 'next/link'

export default function RegisterPage() {
  const [image, setImage] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // カメラ起動（リアカメラ希望）
  useEffect(() => {
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (e) {
        console.warn('camera error', e)
      }
    })()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // 正方形で撮影
  const takePhoto = async () => {
    const video = videoRef.current
    if (!video) return
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return

    const size = Math.min(vw, vh) // 正方形クロップ
    const sx = (vw - size) / 2
    const sy = (vh - size) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.9))
    if (!blob) return
    const file = new File([blob], `toy-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setImage(file)
  }

  const submit = async () => {
    if (!image) return
    setLoading(true)
    const fd = new FormData()
    fd.append('image', image)
    fd.append('name', name)
    const resp = await fetch('/api/toys', { method: 'POST', body: fd })
    // エラーハンドリングは省略（前のAPI側の段階別エラーで十分）
    await resp.json()
    setLoading(false)
  }

  return (
    <main className="p-4 space-y-6">
      <Link href="/">
        <h2 className="text-xl font-bold mt-2 mb-6">はこおもちゃ</h2>
      </Link>

      {/* プレビュー（正方形枠） */}
      <div className="relative w-full max-w-sm mx-auto">
        <div className="aspect-square rounded-2xl overflow-hidden border">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
        {/* 必要ならここに絶対配置でガイド枠を重ねる */}
      </div>

      {/* ボタン類：余白をしっかり確保 */}
      <div className="w-full max-w-sm mx-auto grid gap-4">
        <button
          onClick={takePhoto}
          className="rounded-2xl border px-4 py-3 mx-auto w-40 bg-white text-black font-bold mt-2"
        >
          写真をとる
        </button>

        <input
          placeholder="おもちゃの名前を入力してね！"
          value={name}
          onChange={(e)=>setName(e.target.value)}
          className="w-full border rounded-2xl px-4 py-3 text-[16px] mt-5"
        />

        <button
          onClick={submit}
          disabled={loading || !image}
          className="rounded-2xl border px-4 py-3 disabled:opacity-50"
        >
          {loading ? '登録中…' : '登録する'}
        </button>
      </div>

      {/* ペルソナ表示は削除済み */}
      {/* 画像アップロードボタン（ファイル選択）も削除済み */}
    </main>
  )
}
