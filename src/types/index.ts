// 既存があれば拡張/統合してください
export type Personality = {
  traits: string[]
  speaking_style: string
  favorite_topics?: string[]
}

export type Toy = {
  id: string
  name: string
  image_url: string
  personality: Personality
  voice_style?: string | null
  created_at: string
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'toy'
  name?: string
  content: string
  toyId?: string
  imageDataUrl?: string
}

/** OpenAI Responses API — 入力用 */
export type OAContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }

export type OAMessage = {
  role: 'system' | 'user' | 'assistant'
  content: OAContent[]
}

/** OpenAI Responses API — 出力の最小形 */
export type OAResponse = {
  output?: Array<{ content?: Array<{ text?: string }> }>
  output_text?: string
}
