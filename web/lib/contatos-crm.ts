import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export interface ContatoCrm {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  empresa?: string;
  cargo?: string;
  notas?: string;
  etiquetas?: string[];
  camposCustom?: Record<string, string>;
  bloqueado?: boolean;
  atualizadoEm: string;
}

const arquivoCrm = (dataDir = DATA_DIR) => join(dataDir, '.contatos-crm.json');

export async function lerContatosCrm(dataDir = DATA_DIR): Promise<Record<string, ContatoCrm>> {
  try {
    const parsed = JSON.parse(await readFile(arquivoCrm(dataDir), 'utf8')) as Record<string, ContatoCrm>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function obterContatoCrm(id: string, dataDir = DATA_DIR): Promise<ContatoCrm | null> {
  const todos = await lerContatosCrm(dataDir);
  return todos[id] ?? null;
}

export async function salvarContatoCrm(
  input: Omit<ContatoCrm, 'atualizadoEm'> & { atualizadoEm?: string },
  dataDir = DATA_DIR,
): Promise<ContatoCrm> {
  const id = input.id.trim();
  if (!id) throw new Error('id obrigatório');
  const todos = await lerContatosCrm(dataDir);
  const existente = todos[id];
  const limpo: ContatoCrm = {
    id,
    nome: input.nome.trim() || existente?.nome || id,
    telefone: input.telefone.trim() || existente?.telefone || '',
    ...(input.email !== undefined ? { email: input.email.trim() || undefined } : existente?.email ? { email: existente.email } : {}),
    ...(input.empresa !== undefined
      ? { empresa: input.empresa.trim() || undefined }
      : existente?.empresa
        ? { empresa: existente.empresa }
        : {}),
    ...(input.cargo !== undefined ? { cargo: input.cargo.trim() || undefined } : existente?.cargo ? { cargo: existente.cargo } : {}),
    ...(input.notas !== undefined ? { notas: input.notas.trim() || undefined } : existente?.notas ? { notas: existente.notas } : {}),
    ...(input.etiquetas !== undefined ? { etiquetas: input.etiquetas } : existente?.etiquetas ? { etiquetas: existente.etiquetas } : {}),
    ...(input.camposCustom !== undefined
      ? { camposCustom: input.camposCustom }
      : existente?.camposCustom
        ? { camposCustom: existente.camposCustom }
        : {}),
    ...(input.bloqueado !== undefined
      ? { bloqueado: input.bloqueado }
      : existente?.bloqueado !== undefined
        ? { bloqueado: existente.bloqueado }
        : {}),
    atualizadoEm: input.atualizadoEm ?? new Date().toISOString(),
  };
  todos[id] = limpo;
  await writeJsonAtomic(arquivoCrm(dataDir), todos);
  return limpo;
}

export async function removerContatoCrm(id: string, dataDir = DATA_DIR): Promise<boolean> {
  const todos = await lerContatosCrm(dataDir);
  if (!(id in todos)) return false;
  delete todos[id];
  await writeJsonAtomic(arquivoCrm(dataDir), todos);
  return true;
}

function escaparCsv(val: string): string {
  if (/[",\n\r;]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

export function exportarContatosCsv(lista: ContatoCrm[]): string {
  const cab = ['id', 'nome', 'telefone', 'email', 'empresa', 'cargo', 'notas', 'etiquetas', 'bloqueado'];
  const linhas = [cab.join(',')];
  for (const c of lista) {
    linhas.push(
      [
        c.id,
        c.nome,
        c.telefone,
        c.email ?? '',
        c.empresa ?? '',
        c.cargo ?? '',
        c.notas ?? '',
        (c.etiquetas ?? []).join('|'),
        c.bloqueado ? 'sim' : 'nao',
      ]
        .map(escaparCsv)
        .join(','),
    );
  }
  return `\uFEFF${linhas.join('\n')}\n`;
}

function parseLinhaCsv(linha: string, delim: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

export async function importarContatosCsv(
  csvBruto: string,
  dataDir = DATA_DIR,
): Promise<{ importados: number; ignorados: number }> {
  const limpo = csvBruto.replace(/^\uFEFF/, '').trim();
  if (!limpo) return { importados: 0, ignorados: 0 };
  const linhas = limpo.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length < 2) return { importados: 0, ignorados: 0 };

  const headerRaw = linhas[0]!;
  const delim = headerRaw.includes(';') && !headerRaw.includes(',') ? ';' : ',';
  const headers = parseLinhaCsv(headerRaw, delim).map((h) => h.toLowerCase());

  const idx = (nomes: string[]) => headers.findIndex((h) => nomes.includes(h));
  const iId = idx(['id', 'slug']);
  const iNome = idx(['nome', 'name']);
  const iTel = idx(['telefone', 'phone', 'whatsapp', 'numero']);
  const iEmail = idx(['email', 'e-mail']);
  const iEmp = idx(['empresa', 'company']);
  const iCargo = idx(['cargo', 'role']);
  const iNotas = idx(['notas', 'notes', 'observacoes']);
  const iTags = idx(['etiquetas', 'tags']);

  let importados = 0;
  let ignorados = 0;
  for (let r = 1; r < linhas.length; r++) {
    const cols = parseLinhaCsv(linhas[r]!, delim);
    const tel = iTel >= 0 ? (cols[iTel] ?? '').replace(/\D+/g, '') : '';
    const nome = iNome >= 0 ? (cols[iNome] ?? '') : '';
    const idCol = iId >= 0 ? (cols[iId] ?? '') : '';
    const id = idCol || (tel ? `dm-${tel}` : '');
    if (!id) {
      ignorados++;
      continue;
    }
    const tagsRaw = iTags >= 0 ? (cols[iTags] ?? '') : '';
    const etiquetas = tagsRaw
      ? tagsRaw
          .split(/[|;]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    await salvarContatoCrm(
      {
        id,
        nome: nome || tel || id,
        telefone: tel,
        ...(iEmail >= 0 && cols[iEmail] ? { email: cols[iEmail] } : {}),
        ...(iEmp >= 0 && cols[iEmp] ? { empresa: cols[iEmp] } : {}),
        ...(iCargo >= 0 && cols[iCargo] ? { cargo: cols[iCargo] } : {}),
        ...(iNotas >= 0 && cols[iNotas] ? { notas: cols[iNotas] } : {}),
        ...(etiquetas ? { etiquetas } : {}),
      },
      dataDir,
    );
    importados++;
  }
  return { importados, ignorados };
}
