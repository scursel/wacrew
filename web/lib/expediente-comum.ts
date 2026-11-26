export type DiaSemana = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab';

export interface ExpedienteWebConfig {
  ativo: boolean;
  timezone: string;
  dias: Partial<Record<DiaSemana, [string, string]>>;
  recado_dentro: string;
  recado_fora: string;
  segurarEnvios?: boolean;
  presencaCoerente?: boolean;
}

export const EXPEDIENTE_PADRAO: ExpedienteWebConfig = {
  ativo: false,
  timezone: 'America/Sao_Paulo',
  dias: {
    seg: ['08:00', '18:00'],
    ter: ['08:00', '18:00'],
    qua: ['08:00', '18:00'],
    qui: ['08:00', '18:00'],
    sex: ['08:00', '18:00'],
  },
  recado_dentro: 'Oi! Já estamos vendo sua mensagem e respondemos em instantes.',
  recado_fora: 'Nosso horário de atendimento é de segunda a sexta, das 08h às 18h. Assim que abrirmos, seguimos por aqui!',
  segurarEnvios: false,
  presencaCoerente: true,
};

const DIA_POR_WEEKDAY: Record<string, DiaSemana> = {
  Sun: 'dom',
  Mon: 'seg',
  Tue: 'ter',
  Wed: 'qua',
  Thu: 'qui',
  Fri: 'sex',
  Sat: 'sab',
};

function hhmmEmMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function localDiaMinutos(ms: number, timezone: string): { dia: DiaSemana; min: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hh = Number(get('hour'));
  if (hh === 24) hh = 0;
  const mm = Number(get('minute'));
  return {
    dia: DIA_POR_WEEKDAY[get('weekday')] ?? 'dom',
    min: hh * 60 + mm,
  };
}

/**
 * Calcula quantos ms dentro do horário comercial decorreram entre `inicioIso` e `fimMs`.
 * Quando `cfg.ativo` é false (ou ausente), retorna a duração corrida normal.
 */
export function calcularEsperaComercialMs(
  inicioIso: string,
  fimMs: number,
  cfg?: ExpedienteWebConfig | null,
): number {
  const iniMs = Date.parse(inicioIso);
  if (!Number.isFinite(iniMs) || fimMs <= iniMs) return 0;
  if (!cfg?.ativo) return fimMs - iniMs;

  const MAX_JANELA_MS = 30 * 24 * 60 * 60_000;
  const start = Math.max(iniMs, fimMs - MAX_JANELA_MS);
  const stepMs = fimMs - start <= 2 * 60 * 60_000 ? 60_000 : 5 * 60_000;
  let acumulado = 0;
  for (let t = start; t < fimMs; t += stepMs) {
    const fatia = Math.min(stepMs, fimMs - t);
    try {
      const { dia, min } = localDiaMinutos(t, cfg.timezone);
      const faixa = cfg.dias[dia];
      if (faixa && faixa.length === 2) {
        const abre = hhmmEmMin(faixa[0]);
        const fecha = hhmmEmMin(faixa[1]);
        if (min >= abre && min < fecha) acumulado += fatia;
      }
    } catch {
      acumulado += fatia;
    }
  }
  return acumulado;
}
