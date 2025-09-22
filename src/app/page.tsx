'use client'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold">はこおもちゃ</h1>
        <p className="text-xs text-gray-500">おもちゃを登録して、お片付けしたらおしゃべり開始！</p>
        <div className="grid gap-4">
          <Link href="/register" className="w-70 mx-auto rounded-2xl border px-4 py-3">おもちゃを登録</Link>
          <Link href="/chat" className="w-70 mx-auto rounded-2xl border px-4 py-3">おもちゃのチャット</Link>
        </div>
        <div>
          {/* <Link href="/omochabako" className="text-xs underline">/omochabako（お片付けボタン）</Link> */}
        </div>
      </div>
    </main>
  )
}