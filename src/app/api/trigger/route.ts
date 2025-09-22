import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
export const runtime = 'edge'

export async function POST() {
  const { error } = await supabase.from('cleanup_triggers').insert({})
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}