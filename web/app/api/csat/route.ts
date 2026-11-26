import { NextResponse } from 'next/server';
import { lerCsat, registrarCsat, resumoCsat } from '@/lib/csat';
import { dispararWebhook } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const registros = await lerCsat();
  return NextResponse.json({
    resumo: resumoCsat(registros),
    recentes: registros.slice(0, 30),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  try {
    const registro = await registrarCsat({
      slug: typeof body.slug === 'string' ? body.slug : '',
      nota: Number(body.nota),
      ...(typeof body.comentario === 'string' ? { comentario: body.comentario } : {}),
      ...(typeof body.agente === 'string' ? { agente: body.agente } : {}),
    });
    void dispararWebhook('csat.submitted', { ...registro }).catch(() => {});
    return NextResponse.json({ ok: true, registro });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'dados inválidos' }, { status: 400 });
  }
}
