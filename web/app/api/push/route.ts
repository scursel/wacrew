import { NextResponse } from 'next/server';
import { lerSubscriptions, removerSubscription, salvarSubscription, vapidPublicKey } from '@/lib/web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const subs = await lerSubscriptions();
  return NextResponse.json({
    vapidPublicKey: vapidPublicKey(),
    total: subs.length,
    subscriptions: subs.map((s) => ({ endpoint: s.endpoint, usuario: s.usuario, criadoEm: s.criadoEm })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  const keys = (body?.keys && typeof body.keys === 'object' ? body.keys : null) as
    | { p256dh?: unknown; auth?: unknown }
    | null;

  if (!endpoint || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    return NextResponse.json({ error: 'subscription inválida' }, { status: 400 });
  }

  const saved = await salvarSubscription({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    usuario: typeof body?.usuario === 'string' ? body.usuario : 'operador',
    userAgent: req.headers.get('user-agent') ?? undefined,
  });
  return NextResponse.json({ ok: true, endpoint: saved.endpoint });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint =
    typeof body?.endpoint === 'string' ? body.endpoint : (new URL(req.url).searchParams.get('endpoint') ?? '');
  if (!endpoint) return NextResponse.json({ error: 'endpoint obrigatório' }, { status: 400 });
  const ok = await removerSubscription(endpoint);
  return NextResponse.json({ ok });
}
