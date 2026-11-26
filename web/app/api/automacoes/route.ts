import { NextResponse } from 'next/server';
import { type GatilhoAutomacao, lerAutomacoes, removerAutomacao, salvarAutomacao } from '@/lib/automacoes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GATILHOS = new Set<GatilhoAutomacao>(['mensagem_recebida', 'fora_do_expediente', 'sem_resposta_minutos']);

export async function GET() {
  return NextResponse.json({ regras: await lerAutomacoes() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  const gatilho = body.gatilho as GatilhoAutomacao;
  if (!nome || !GATILHOS.has(gatilho)) {
    return NextResponse.json({ error: 'nome e gatilho válido são obrigatórios' }, { status: 400 });
  }

  const regra = await salvarAutomacao({
    ...(typeof body.id === 'string' ? { id: body.id } : {}),
    nome,
    ativo: body.ativo !== false,
    gatilho,
    condicoes: (body.condicoes && typeof body.condicoes === 'object' ? body.condicoes : {}) as Record<string, never>,
    acoes: (body.acoes && typeof body.acoes === 'object' ? body.acoes : {}) as Record<string, never>,
  });
  return NextResponse.json({ ok: true, regra });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const ok = await removerAutomacao(id);
  return NextResponse.json({ ok });
}
