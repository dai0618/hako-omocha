import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { OAResponse, Personality } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUIRED_ENVS = ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY'] as const
function assertEnv(): void {
  const missing = REQUIRED_ENVS.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`)
}

const BUCKET = process.env.NEXT_PUBLIC_TOY_BUCKET || 'toy-images'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

export async function POST(req: NextRequest) {
  const log = (stage: string, extra?: unknown) =>
    console.error(`[toys] ${stage}`, extra ?? '')

  try {
    assertEnv()
    const form = await req.formData()
    const file = form.get('image') as File | null
    const name = (form.get('name') as string | null)?.trim() || 'ななし'
    if (!file) return NextResponse.json({ stage: 'validate', error: 'image required' }, { status: 400 })
    log('received-form', { name, type: file.type, size: (file as unknown as { size?: number })?.size })

    const ext = (file.name?.split('.').pop() || '').toLowerCase() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const buf = new Uint8Array(await file.arrayBuffer())
    log('arraybuffer-ready', { bytes: buf.byteLength })

    const admin = supabaseAdmin()
    const up = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (up.error) {
      log('upload-error', up.error)
      return NextResponse.json({ stage: 'upload', error: up.error.message }, { status: 500 })
    }
    const pub = admin.storage.from(BUCKET).getPublicUrl(up.data.path)
    const publicUrl = pub.data.publicUrl
    log('uploaded', { publicUrl })

    // OpenAI Vision (画像は data URL で渡す)
    const b64 = Buffer.from(buf).toString('base64')
    const dataUrl = `data:${file.type || 'image/jpeg'};base64,${b64}`
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const visionResp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: '次の画像は子どものおもちゃです。性格traits(3-5個)と、しゃべり口調speaking_styleをJSONで返して。日本語。' },
              { type: 'input_image', image_url: dataUrl },
            ],
          },
          {
            role: 'system',
            content: [{ type: 'input_text', text: '出力は {"traits":[],"speaking_style":"...","favorite_topics":[]} のみ。説明不要。' }],
          },
        ],
        text: { format: { type: 'json_object' } },
      }),
    })

    if (!visionResp.ok) {
      const txt = await visionResp.text()
      log('openai-error', { status: visionResp.status, txt: txt.slice(0, 400) })
      return NextResponse.json({ stage: 'openai', status: visionResp.status, error: txt }, { status: 500 })
    }

    const vision = (await visionResp.json()) as OAResponse
    let personality: Personality = {
      traits: ['やさしい', 'あかるい'],
      speaking_style: 'ですます口調',
      favorite_topics: [],
    }
    try {
      const raw = vision?.output?.[0]?.content?.[0]?.text ?? vision?.output_text ?? ''
      if (raw) personality = JSON.parse(raw) as Personality
    } catch (e) {
      log('personality-parse-fallback', e)
    }

    const inserted = await admin
      .from('toys')
      .insert({ name, image_url: publicUrl, personality })
      .select()
      .single()

    if (inserted.error) {
      log('db-insert-error', inserted.error)
      return NextResponse.json({ stage: 'db', error: inserted.error.message }, { status: 500 })
    }

    return NextResponse.json({ toy: inserted.data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[toys] unexpected-error', msg)
    return NextResponse.json({ stage: 'unexpected', error: msg }, { status: 500 })
  }
}
