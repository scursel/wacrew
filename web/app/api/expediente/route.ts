import { NextResponse } from 'next/server';
import { type ExpedienteWebConfig, lerExpedienteWeb, salvarExpedienteWeb } from '@/lib/expediente-web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await lerExpedienteWeb());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<ExpedienteWebConfig> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  try {
    const saved = await salvarExpedienteWeb(body);
    return NextResponse.json({ ok: true, config: saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'dados inválidos' }, { status: 400 });
  }
}
