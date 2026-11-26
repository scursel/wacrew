import { NextResponse } from 'next/server';
import {
  exportarContatosCsv,
  importarContatosCsv,
  lerContatosCrm,
  obterContatoCrm,
  removerContatoCrm,
  salvarContatoCrm,
} from '@/lib/contatos-crm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id')?.trim();
  const formato = url.searchParams.get('formato');

  if (id) {
    return NextResponse.json({ contato: await obterContatoCrm(id) });
  }

  const mapa = await lerContatosCrm();
  const lista = Object.values(mapa).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (formato === 'csv') {
    return new Response(exportarContatosCsv(lista), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="contatos-wacrew.csv"',
      },
    });
  }

  return NextResponse.json({ contatos: lista });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  if (body.acao === 'importar') {
    if (typeof body.csv !== 'string' || !body.csv.trim()) {
      return NextResponse.json({ error: 'csv obrigatório' }, { status: 400 });
    }
    const res = await importarContatosCsv(body.csv);
    return NextResponse.json({ ok: true, ...res });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const contato = await salvarContatoCrm({
    id,
    nome: typeof body.nome === 'string' ? body.nome : id,
    telefone: typeof body.telefone === 'string' ? body.telefone : '',
    ...(typeof body.email === 'string' ? { email: body.email } : {}),
    ...(typeof body.empresa === 'string' ? { empresa: body.empresa } : {}),
    ...(typeof body.cargo === 'string' ? { cargo: body.cargo } : {}),
    ...(typeof body.notas === 'string' ? { notas: body.notas } : {}),
    ...(Array.isArray(body.etiquetas) ? { etiquetas: body.etiquetas.filter((x): x is string => typeof x === 'string') } : {}),
    ...(body.camposCustom && typeof body.camposCustom === 'object' && !Array.isArray(body.camposCustom)
      ? {
          camposCustom: Object.fromEntries(
            Object.entries(body.camposCustom as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string')
              .map(([k, v]) => [k, v as string]),
          ),
        }
      : {}),
    ...(typeof body.bloqueado === 'boolean' ? { bloqueado: body.bloqueado } : {}),
  });
  return NextResponse.json({ ok: true, contato });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const ok = await removerContatoCrm(id);
  return NextResponse.json({ ok });
}
