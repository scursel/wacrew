import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  calcularEsperaComercialMs,
  type DiaSemana,
  EXPEDIENTE_PADRAO,
  type ExpedienteWebConfig,
} from './expediente-comum';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export {
  calcularEsperaComercialMs,
  type DiaSemana,
  EXPEDIENTE_PADRAO,
  type ExpedienteWebConfig,
};

const DIAS_VALIDOS = new Set<DiaSemana>(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']);
const RE_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function arquivoExpediente(dataDir = DATA_DIR) {
  return join(dataDir, 'expediente.json');
}

function validarTimezone(tz: string): string {
  const limpo = tz.trim() || 'America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: limpo });
  } catch {
    throw new Error(`Fuso horário IANA inválido: "${limpo}"`);
  }
  return limpo;
}

function validarDias(dias: unknown): Partial<Record<DiaSemana, [string, string]>> {
  if (!dias || typeof dias !== 'object' || Array.isArray(dias)) {
    throw new Error('dias deve ser um objeto');
  }
  const limpo: Partial<Record<DiaSemana, [string, string]>> = {};
  for (const [k, v] of Object.entries(dias as Record<string, unknown>)) {
    if (!DIAS_VALIDOS.has(k as DiaSemana)) continue;
    if (v === null || v === undefined) continue;
    if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'string' || typeof v[1] !== 'string') {
      throw new Error(`Faixa inválida para "${k}"`);
    }
    const abre = v[0].trim();
    const fecha = v[1].trim();
    if (!RE_HHMM.test(abre) || !RE_HHMM.test(fecha)) {
      throw new Error(`Horário inválido em "${k}" (use HH:MM)`);
    }
    if (abre >= fecha) {
      throw new Error(`Em "${k}", o horário de abertura (${abre}) precisa ser anterior ao fechamento (${fecha})`);
    }
    limpo[k as DiaSemana] = [abre, fecha];
  }
  return limpo;
}

export async function lerExpedienteWeb(dataDir = DATA_DIR): Promise<ExpedienteWebConfig> {
  try {
    const raw = JSON.parse(await readFile(arquivoExpediente(dataDir), 'utf8')) as Partial<ExpedienteWebConfig>;
    if (!raw || typeof raw !== 'object') return EXPEDIENTE_PADRAO;
    return {
      ...EXPEDIENTE_PADRAO,
      ...raw,
      dias: raw.dias && typeof raw.dias === 'object' ? raw.dias : EXPEDIENTE_PADRAO.dias,
    };
  } catch {
    return EXPEDIENTE_PADRAO;
  }
}

export async function salvarExpedienteWeb(
  cfg: Partial<ExpedienteWebConfig>,
  dataDir = DATA_DIR,
): Promise<ExpedienteWebConfig> {
  const atual = await lerExpedienteWeb(dataDir);
  const timezone = validarTimezone(cfg.timezone ?? atual.timezone);
  const dias = cfg.dias !== undefined ? validarDias(cfg.dias) : atual.dias;
  const proximo: ExpedienteWebConfig = {
    ...atual,
    ...cfg,
    ativo: typeof cfg.ativo === 'boolean' ? cfg.ativo : atual.ativo,
    segurarEnvios: typeof cfg.segurarEnvios === 'boolean' ? cfg.segurarEnvios : atual.segurarEnvios,
    timezone,
    dias,
  };
  await writeJsonAtomic(arquivoExpediente(dataDir), proximo);
  return proximo;
}
