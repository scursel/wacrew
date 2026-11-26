import { NextResponse } from 'next/server';
import { lerInboxes, removerInbox, resolverInbox, salvarInbox, testarConexaoInbox } from '@/lib/inboxes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const lista = await lerInboxes();
  return NextResponse.json({
    inboxes: lista.map(({ controlToken, ...rest }) => ({
      ...rest,
      hasToken: Boolean(controlToken),
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  if (body.acao === 'testar') {
    const id = typeof body.id === 'string' ? body.id.trim() : undefined;
    const inbox = await resolverInbox(id);
    const res = await testarConexaoInbox(inbox);
    return NextResponse.json(res);
  }

  try {
    const nome = typeof body.nome === 'string' ? body.nome : '';
    const controlUrl = typeof body.controlUrl === 'string' ? body.controlUrl : '';
    const saved = await salvarInbox({
      ...(typeof body.id === 'string' && body.id.trim() ? { id: body.id.trim() } : {}),
      nome,
      controlUrl,
      ...(typeof body.numero === 'string' ? { numero: body.numero } : {}),
      ...(typeof body.controlToken === 'string' && body.controlToken.trim() ? { controlToken: body.controlToken } : {}),
      ...(typeof body.departamentoPadrao === 'string' ? { departamentoPadrao: body.departamentoPadrao } : {}),
      ativo: body.ativo !== false,
    });
    const { controlToken, ...pub } = saved;
    return NextResponse.json({ ok: true, inbox: { ...pub, hasToken: Boolean(controlToken) } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'dados inválidos' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  try {
    const ok = await removerInbox(id);
    return NextResponse.json({ ok });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'não permitido' }, { status: 400 });
  }
}
