import type { OAMessage, OAResponse } from '@/types'

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export async function callOpenAI(messages: OAMessage[]): Promise<OAResponse> {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: messages }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenAI API error: ${text.slice(0, 300)}`)
  }
  return (await resp.json()) as OAResponse
}
