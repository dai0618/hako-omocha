// /src/app/api/chat/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import type { ChatMessage, OAMessage, OAResponse, Toy } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toOAHistory(history: ChatMessage[]): OAMessage[] {
  return history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: [{ type: 'input_text', text: `${m.name ? `【${m.name}】` : ''}${m.content}` }],
  }))
}

// ---- Gemini i2i（text+image→image 一発変換）----
async function loadImageAsBase64(input: string): Promise<{ mime: string; base64: string }> {
  if (input.startsWith('data:')) {
    const m = input.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) throw new Error('Invalid data URL')
    return { mime: m[1], base64: m[2] }
  }
  const r = await fetch(input)
  if (!r.ok) throw new Error(`fetch input image failed: ${r.status}`)
  const blob = await r.blob()
  const buf = Buffer.from(await blob.arrayBuffer())
  return { mime: blob.type || 'image/png', base64: buf.toString('base64') }
}


async function generateImageTransformDataUrlGemini(
  inputImageUrlOrDataUrl: string,
  promptText = 'おもちゃタウンで遊んでいるおもちゃの様子。玩具の見た目は入力画像を忠実に維持。背景はカラフルで活気のある街並み。光は明るくポップ、広告風。正方形で高精細。'
): Promise<string> {
  const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!GEMINI_KEY) throw new Error('Gemini API key not set')

  // 1) モデル名：プレビュー環境なら "gemini-2.5-flash-image-preview" の必要がある場合あり
  const model =
    process.env.GEMINI_IMAGE_MODEL ||
    'gemini-2.5-flash-image' // ダメなら 'gemini-2.5-flash-image-preview' を試す

  // 2) 入力画像 → base64
  const { mime, base64 } = await (async () => {
    if (inputImageUrlOrDataUrl.startsWith('data:')) {
      const m = inputImageUrlOrDataUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!m) throw new Error('Invalid data URL')
      return { mime: m[1], base64: m[2] }
    } else {
      const r = await fetch(inputImageUrlOrDataUrl)
      if (!r.ok) throw new Error(`fetch input image failed: ${r.status}`)
      const blob = await r.blob()
      const buf = Buffer.from(await blob.arrayBuffer())
      return { mime: blob.type || 'image/png', base64: buf.toString('base64') }
    }
  })()

  // 3) 画像“を”返すように明示。1:1も generationConfig で指定
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  `${promptText}\n` +
                  '- 被写体は入力画像の玩具\n' +
                  '- 不自然な改変は避け、玩具の特徴は保持\n' +
                  '- 子ども向けに明るく楽しい雰囲気',
              },
              { inlineData: { mimeType: mime, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],   // ← 画像のみを要求（テキスト混在を避ける）
          imageConfig: { aspectRatio: '1:1' }, // ← 正方形を明示
        },
      }),
    }
  )

  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`[gemini i2i failed] ${t.slice(0, 800)}`)
  }

  const j: any = await resp.json()

  // --- セーフティ/終了理由を見ておくと原因特定が速い ---
  const cand = j?.candidates?.[0]
  const finish = cand?.finishReason
  const safety = cand?.safetyRatings
  if (finish && finish !== 'FINISH_REASON_UNSPECIFIED' && finish !== 'STOP') {
    console.warn('[gemini finishReason]', finish)
  }
  if (Array.isArray(safety)) {
    console.warn('[gemini safetyRatings]', JSON.stringify(safety))
  }

  // 画像 part を探す（テキスト part しかないケースに備える）
  const parts: any[] = cand?.content?.parts || []
  const imagePart = parts.find((p) => p?.inlineData?.data)

  // テキストしか返ってない場合、診断情報を投げる
  if (!imagePart) {
    const textPart = parts.find((p) => typeof p?.text === 'string')
    const msg =
      'No image in Gemini response' +
      (textPart ? ` (text="${String(textPart.text).slice(0, 200)}...")` : '') +
      (finish ? ` finishReason=${finish}` : '') +
      (safety ? ` safety=${JSON.stringify(safety)}` : '')
    throw new Error(msg)
  }

  const outB64: string = imagePart.inlineData.data
  const outMime: string = imagePart.inlineData.mimeType || 'image/png'
  return `data:${outMime};base64,${outB64}`
}

// ---- メイン処理：チャットはOpenAI、画像だけGemini ----
export async function POST(req: NextRequest) {
  try {
    const { toys, history, userInput, firstRoundImage, firstToyId } = (await req.json()) as {
      toys: Toy[]
      history: ChatMessage[]
      userInput?: string
      firstRoundImage?: string
      firstToyId?: string
    }

    const system: OAMessage[] = [
      {
        role: 'system',
        content: [{ type: 'input_text', text: 'あなたは子どものおもちゃ。各おもちゃは自分のキャラを守って短い発言。1発言は40字以内。' }],
      },
    ]
    const baseHistory = toOAHistory(history || [])

    // --- ユーザーの自由入力に対する返信（OpenAIのまま）---
    if (userInput) {
      const t = toys[0]
      const prompt: OAMessage[] = [
        ...system,
        ...baseHistory,
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `ユーザー: ${userInput}` },
            { type: 'input_text', text: `あなたは ${t.name}。口調: ${t.personality.speaking_style}。性格: ${(t.personality.traits || []).join('、')}` },
          ],
        },
      ]
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: prompt }),
      })
      const j = (await r.json()) as OAResponse
      const text = j.output?.[0]?.content?.[0]?.text || 'うんうん！'
      return NextResponse.json({ replies: [{ role: 'toy', name: t.name, content: text, toyId: t.id }] })
    }

    // --- 通常ラウンド（各おもちゃの短文 + 最初の1体だけ画像変換）---
    const replies: ChatMessage[] = []
    for (const toy of toys) {
      const isRep = Boolean(firstRoundImage && firstToyId && toy.id === firstToyId)

      const content: Array<{ type: 'input_text' | 'input_image'; text?: string; image_url?: string }> = [
        { type: 'input_text', text: `あなたは ${toy.name}。口調: ${toy.personality.speaking_style}。性格: ${(toy.personality.traits || []).join('、')}` },
        { type: 'input_text', text: isRep ? '最初のラリーでは「片付けてくれたお礼」+「おもちゃタウンで遊ぶ自分」を想像して、ワクワク感のある一言を。' : '短くチャットの文脈に沿った一言を。' },
      ]
      if (isRep && firstRoundImage) {
        content.unshift(
          { type: 'input_text', text: '次の画像はあなた（おもちゃ）の姿です。' },
          { type: 'input_image', image_url: firstRoundImage }
        )
      }

      const prompt: OAMessage[] = [...system, ...baseHistory, { role: 'user', content } as OAMessage]
      const rr = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: prompt }),
      })
      const jj = (await rr.json()) as OAResponse
      const text = jj.output?.[0]?.content?.[0]?.text || (isRep ? 'おもちゃタウンであそぼう！' : 'ピカピカでうれしい！')

      let generatedImageDataUrl: string | undefined
      if (isRep && firstRoundImage) {
        try {
          generatedImageDataUrl = await generateImageTransformDataUrlGemini(
            firstRoundImage,
            'おもちゃタウンで遊んでいるおもちゃの様子。' +
              '玩具の見た目は入力画像を忠実に維持。' +
              '背景はカラフルで活気のある街並み。' +
              '光は明るくポップ、広告風。' +
              '正方形で高精細。'
          )
        } catch (e) {
          console.warn('image transform failed', e instanceof Error ? e.message : e)
        }
      }

      replies.push({ role: 'toy', name: toy.name, content: text, toyId: toy.id, imageDataUrl: generatedImageDataUrl })
    }

    return NextResponse.json({ replies })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
