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

async function buildImagePromptFromToy(firstRoundImage: string, toyName: string): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text:
              `次の画像は玩具${toyName}です。見た目を観察して「おもちゃタウンで遊ぶ自分」を1枚絵で描くための画像生成プロンプトを日本語で作成。` +
              `背景はカラフルなおもちゃタウン。本文のみ出力。` },
            { type: 'input_image', image_url: firstRoundImage },
          ],
        },
      ],
    }),
  })
  if (!resp.ok) throw new Error(`prompt-build failed: ${(await resp.text()).slice(0, 300)}`)
  const json = (await resp.json()) as OAResponse
  return json?.output?.[0]?.content?.[0]?.text || 'おもちゃタウンで楽しく遊ぶ玩具のイラスト。'
}

/** OpenAI または Replicate を使って data URL を返す */
async function generateImageDataUrl(prompt: string): Promise<string> {
  const provider = process.env.IMAGE_PROVIDER || 'openai'
  if (provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        prompt,
        size: '1024x1024',
        n: 1,
      }),
    })
    if (resp.ok) {
      const j: unknown = await resp.json()
      const json = j as { data?: Array<{ b64_json?: string; url?: string }> }
      const b64 = json.data?.[0]?.b64_json
      if (b64) return `data:image/png;base64,${b64}`
      const url = json.data?.[0]?.url
      if (url) {
        const i = await fetch(url)
        if (!i.ok) throw new Error('fetch image url failed')
        const blob = await i.blob()
        const buf = Buffer.from(await blob.arrayBuffer())
        return `data:${blob.type || 'image/png'};base64,${buf.toString('base64')}`
      }
      // OpenAI が権限で弾かれた/無データ → Replicateへフォールバック
      console.warn('[image-gen openai] no data, fallback to replicate')
    } else {
      const t = await resp.text()
      console.warn('[image-gen openai failed]', t.slice(0, 200))
      // フォールバックに進む
    }
  }

  // Replicate フォールバック
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error('REPLICATE_API_TOKEN is missing')
  const version = process.env.REPLICATE_MODEL || 'stability-ai/sdxl' // 可能なら versionID を指定

  // 予測作成
  const createdResp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version,
      input: { prompt, width: 1024, height: 1024 },
    }),
  })
  if (!createdResp.ok) throw new Error(`replicate create failed: ${(await createdResp.text()).slice(0, 300)}`)
  const created: { id: string } = await createdResp.json()

  // ポーリング
  let status = 'starting'
  let outputUrl: string | undefined
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`https://api.replicate.com/v1/predictions/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) throw new Error('replicate poll failed')
    const p: { status: string; output?: unknown } = await r.json()
    status = p.status
    if (status === 'succeeded') {
      if (Array.isArray(p.output) && p.output.length > 0 && typeof p.output[0] === 'string') {
        outputUrl = p.output[0] as string
      } else if (typeof p.output === 'string') {
        outputUrl = p.output as string
      }
      break
    }
    if (status === 'failed' || status === 'canceled') throw new Error('replicate job failed')
    await new Promise((res) => setTimeout(res, 1000))
  }
  if (!outputUrl) throw new Error('replicate returned no image url')

  const img = await fetch(outputUrl)
  if (!img.ok) throw new Error('replicate fetch image failed')
  const blob = await img.blob()
  const buf = Buffer.from(await blob.arrayBuffer())
  return `data:${blob.type || 'image/png'};base64,${buf.toString('base64')}`
}

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

    // ユーザー入力優先
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

    // 通常ラウンド
    const replies: ChatMessage[] = []
    for (const toy of toys) {
      const isRep = Boolean(firstRoundImage && firstToyId && toy.id === firstToyId)
      const content: Array<{ type: 'input_text' | 'input_image'; text?: string; image_url?: string }> = [
        { type: 'input_text', text: `あなたは ${toy.name}。口調: ${toy.personality.speaking_style}。性格: ${(toy.personality.traits || []).join('、')}` },
        { type: 'input_text', text: isRep ? '最初のラリーでは「おもちゃタウンで遊ぶ自分」を想像して、ワクワク感のある一言を。' : '短くチャットの文脈に沿った一言を。' },
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
          const imgPrompt = await buildImagePromptFromToy(firstRoundImage, toy.name)
          generatedImageDataUrl = await generateImageDataUrl(imgPrompt)
        } catch (e) {
          console.warn('image generation failed', e instanceof Error ? e.message : e)
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
