import { NextResponse } from 'next/server';
import { type ExpedienteWebConfig, lerExpedienteWeb, salvarExpedienteWeb } from '@/lib/expediente-web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await lerExpedienteWeb());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<ExpedienteWebConfig> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const saved = await salvarExpedienteWeb(body);
  return NextResponse.json({ ok: true, config: saved });
}
