import { NextResponse } from 'next/server';
import { type EventoWebhook, lerWebhooks, removerWebhook, salvarWebhook, testarWebhook, type WebhookConfig } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENTOS_VALIDOS = new Set<EventoWebhook>([
  'message.received',
  'message.sent',
  'conversation.resolved',
  'conversation.assigned',
  'csat.submitted',
]);

function webhookPublico(w: WebhookConfig) {
  const { secret, ...rest } = w;
  return {
    ...rest,
    secretPreview: secret ? `${secret.slice(0, 6)}…` : '',
  };
}

export async function GET() {
  const lista = await lerWebhooks();
  return NextResponse.json({
    webhooks: lista.map(webhookPublico),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  if (body.acao === 'testar') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    try {
      const ok = await testarWebhook(id);
      return NextResponse.json({ ok });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'erro ao testar' }, { status: 404 });
    }
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const eventos = Array.isArray(body.eventos)
    ? body.eventos.filter((x): x is EventoWebhook => typeof x === 'string' && EVENTOS_VALIDOS.has(x as EventoWebhook))
    : [];
  if (!nome || !url || eventos.length === 0) {
    return NextResponse.json({ error: 'nome, url e ao menos um evento são obrigatórios' }, { status: 400 });
  }

  const criando = !(typeof body.id === 'string' && body.id.trim());
  const informouSegredo = typeof body.secret === 'string' && body.secret.trim().length > 0;

  try {
    const webhook = await salvarWebhook({
      ...(typeof body.id === 'string' ? { id: body.id } : {}),
      nome,
      url,
      ...(informouSegredo ? { secret: (body.secret as string).trim() } : {}),
      eventos,
      ativo: body.ativo !== false,
    });
    return NextResponse.json({
      ok: true,
      webhook: webhookPublico(webhook),
      ...(criando && !informouSegredo ? { secretGerado: webhook.secret } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'URL inválida' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const ok = await removerWebhook(id);
  return NextResponse.json({ ok });
}
