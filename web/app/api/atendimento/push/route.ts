import { NextResponse } from 'next/server';
import { ErroHttp, respostaDeErro } from '@/lib/equipe/acesso';
import { quemAtendeDoPedido } from '@/lib/equipe/quem';
import { lerSubscriptions, removerSubscription, salvarSubscription, vapidPublicKey } from '@/lib/web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const quem = await quemAtendeDoPedido();
    const subs = (await lerSubscriptions()).filter((s) => s.usuario === quem.id);
    return NextResponse.json({
      vapidPublicKey: vapidPublicKey(),
      total: subs.length,
    });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST(req: Request) {
  try {
    const quem = await quemAtendeDoPedido();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    const keys = (body?.keys && typeof body.keys === 'object' ? body.keys : null) as
      | { p256dh?: unknown; auth?: unknown }
      | null;
    if (!endpoint || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
      throw new ErroHttp(400, 'subscription inválida');
    }
    const saved = await salvarSubscription({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      usuario: quem.id,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
    return NextResponse.json({ ok: true, endpoint: saved.endpoint });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await quemAtendeDoPedido();
    const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint =
      typeof body?.endpoint === 'string' ? body.endpoint : (new URL(req.url).searchParams.get('endpoint') ?? '');
    if (!endpoint) throw new ErroHttp(400, 'endpoint obrigatório');
    const ok = await removerSubscription(endpoint);
    return NextResponse.json({ ok });
  } catch (e) {
    return respostaDeErro(e);
  }
}
