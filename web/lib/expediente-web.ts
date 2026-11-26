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

const arquivoExpediente = (dataDir = DATA_DIR) => join(dataDir, 'expediente.json');

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
  const proximo: ExpedienteWebConfig = {
    ...atual,
    ...cfg,
    timezone: (cfg.timezone ?? atual.timezone).trim() || 'America/Sao_Paulo',
    dias: cfg.dias ?? atual.dias,
  };
  await writeJsonAtomic(arquivoExpediente(dataDir), proximo);
  return proximo;
}
