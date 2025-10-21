'use client'
import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="relative min-h-dvh w-full overflow-hidden">
      {/* 背景画像 */}
      <Image
        src="/bg.png"
        alt=""
        fill
        priority
        className="-z-10 object-cover"
        sizes="100vw"
      />

      {/* コンテンツ */}
      <div className="mx-auto max-w-sm px-6 pt-10 pb-[120px] flex min-h-dvh flex-col items-center justify-center">
        {/* タイトルロゴ（中央より少し上） */}
        <div className="-translate-y-6 mb-6">
          <Image
            src="/title.png"
            alt="はこおもちゃ"
            width={320}
            height={120}
            priority
            className="h-auto w-[70vw] max-w-[320px]"
          />
        </div>

        {/* 画像ボタン */}
        <div className="w-full grid gap-5">
          <Link href="/register" aria-label="おもちゃを登録">
            <div className="mx-auto w-3/4 max-w-[180px]">
              <Image
                src="/register.png"
                alt="おもちゃを登録"
                width={600}
                height={180}
                className="w-full h-auto rounded-2xl shadow-md active:scale-[0.98] transition"
                priority
              />
            </div>
          </Link>

          <Link href="/chat" aria-label="おもちゃのチャット">
            <div className="mx-auto w-3/4 max-w-[180px]">
              <Image
                src="/chat.png"
                alt="おもちゃのチャット"
                width={600}
                height={180}
                className="w-full h-auto rounded-2xl shadow-md active:scale-[0.98] transition"
                priority
              />
            </div>
          </Link>
        </div>

        <p className="mt-3 text-center text-white text-xs leading-relaxed drop-shadow-md">
          おもちゃをとうろくして、<br />
          おかたづけをしたら、おしゃべりスタート
        </p>

        {/* セーフエリア考慮（iOS） */}
        <div className="supports-[padding:max(0px)]:[padding-bottom:env(safe-area-inset-bottom)]" />
      </div>
    </main>
  )
}
