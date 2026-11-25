import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, afterAll, expect, it } from 'vitest';
let tmp: string;
let d: typeof import('./departamentos');
let admin: typeof import('./admin');
beforeAll(async () => { tmp = await mkdtemp(join(tmpdir(), 'deps-')); process.env.WAC_DATA_DIR = tmp; d = await import('./departamentos'); admin = await import('./admin'); });
afterAll(async () => { await rm(tmp, { recursive: true, force: true }); });
it('cadastra ids únicos e encontra departamentos por membro', async () => {
  for (const nome of ['Financeiro', 'Suporte Técnico', 'Financeiro']) await admin.executar({ acao: 'dep-criar', nome }, 'dono');
  expect((await d.lerDepartamentos()).map((x) => x.id)).toEqual(['financeiro', 'suporte-tecnico', 'financeiro-2']);
  await d.alterarDepartamentos((l) => { l[0]!.membros.push('ana'); l[2]!.membros.push('ana'); });
  expect(d.departamentosDe(await d.lerDepartamentos(), 'ana')).toEqual(['financeiro', 'financeiro-2']);
});
it('usa PANEL_USER como nome padrão e salva nome próprio', async () => {
  const anterior = process.env.PANEL_USER; process.env.PANEL_USER = 'Operadora';
  try { expect(await d.lerNomeDono()).toBe('Operadora'); await d.gravarNomeDono(' Ana '); expect(await d.lerNomeDono()).toBe('Ana'); } finally { if (anterior === undefined) delete process.env.PANEL_USER; else process.env.PANEL_USER = anterior; }
});
