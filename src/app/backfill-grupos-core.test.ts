import { describe, expect, it } from 'vitest';
import {
  type AncoraMsg,
  ancoraMaisNova,
  aposConcluir,
  aposPedir,
  BACKFILL_PAGINA,
  BACKFILL_TETO_DIAS,
  BACKFILL_TETO_MSGS,
  type BackfillEstadoGrupo,
  decidirProximaAcao,
  deveAgendarBackfill,
  estadoNovo,
  gruposLigadosAgora,
} from './backfill-grupos-core.js';

const DIA = 24 * 60 * 60_000;
const agora = 1_700_000_000_000;

function ancora(id: string, tsMs: number, fromMe = false): AncoraMsg {
  return { id, timestampMs: tsMs, fromMe, sender: '5511999999999@s.whatsapp.net' };
}

describe('gruposLigadosAgora', () => {
  it('devolve só os jids que ligaram nesta passagem', () => {
    const antes = new Set(['a@g.us', 'b@g.us']);
    const depois = new Set(['a@g.us', 'b@g.us', 'c@g.us']);
    expect(gruposLigadosAgora(antes, depois)).toEqual(['c@g.us']);
  });

  it('vazio quando o conjunto não cresceu', () => {
    const s = new Set(['a@g.us']);
    expect(gruposLigadosAgora(s, s)).toEqual([]);
    expect(gruposLigadosAgora(new Set(['a@g.us', 'b@g.us']), new Set(['a@g.us']))).toEqual([]);
  });

  it('ligar vários de uma vez devolve ordenado', () => {
    expect(gruposLigadosAgora(new Set(), new Set(['z@g.us', 'a@g.us']))).toEqual([
      'a@g.us',
      'z@g.us',
    ]);
  });
});

describe('ancoraMaisNova', () => {
  it('escolhe a de timestamp maior', () => {
    const a = ancora('velha', agora - 1000);
    const b = ancora('nova', agora);
    expect(ancoraMaisNova(a, b).id).toBe('nova');
    expect(ancoraMaisNova(b, a).id).toBe('nova');
  });

  it('empate de timestamp preserva a atual', () => {
    const a = ancora('a', agora);
    const b = ancora('b', agora);
    expect(ancoraMaisNova(a, b).id).toBe('a');
  });

  it('null/undefined → candidata', () => {
    const c = ancora('c', agora);
    expect(ancoraMaisNova(null, c)).toEqual(c);
    expect(ancoraMaisNova(undefined, c)).toEqual(c);
  });
});

describe('deveAgendarBackfill', () => {
  it('sempre agenda ao ligar a captura', () => {
    expect(
      deveAgendarBackfill({
        acabouDeLigar: true,
        temJsonl: true,
        estado: { status: 'concluido', totalTrazido: 10 },
      }),
    ).toBe(true);
  });

  it('retoma ciclo incompleto após reinício', () => {
    for (const status of ['pendente', 'aguardando_ancora', 'pedindo'] as const) {
      expect(
        deveAgendarBackfill({
          acabouDeLigar: false,
          temJsonl: true,
          estado: { status, totalTrazido: 0 },
        }),
      ).toBe(true);
    }
  });

  it('startup sem jsonl agenda mesmo sem estado', () => {
    expect(deveAgendarBackfill({ acabouDeLigar: false, temJsonl: false, estado: undefined })).toBe(
      true,
    );
  });

  it('não reabre ciclo concluído se já tem jsonl', () => {
    expect(
      deveAgendarBackfill({
        acabouDeLigar: false,
        temJsonl: true,
        estado: { status: 'concluido', totalTrazido: 50 },
      }),
    ).toBe(false);
  });
});

describe('decidirProximaAcao', () => {
  const base: BackfillEstadoGrupo = { status: 'pendente', totalTrazido: 0, inicio: '2026-01-01' };

  it('sem socket → aguardar_conexao', () => {
    const a = decidirProximaAcao({
      estado: base,
      conectado: false,
      ancoraSidecar: ancora('x', agora),
      maisAntigaJsonl: null,
      agoraMs: agora,
    });
    expect(a).toEqual({ tipo: 'aguardar_conexao' });
  });

  it('sem âncora (sidecar nem jsonl) → aguardar_ancora', () => {
    const a = decidirProximaAcao({
      estado: base,
      conectado: true,
      ancoraSidecar: null,
      maisAntigaJsonl: null,
      agoraMs: agora,
    });
    expect(a).toEqual({ tipo: 'aguardar_ancora' });
  });

  it('com sidecar e sem jsonl → pedir com a âncora do sidecar', () => {
    const sc = ancora('sc', agora);
    const a = decidirProximaAcao({
      estado: base,
      conectado: true,
      ancoraSidecar: sc,
      maisAntigaJsonl: null,
      agoraMs: agora,
    });
    expect(a).toEqual({ tipo: 'pedir', ancora: sc, count: BACKFILL_PAGINA });
  });

  it('com jsonl → pedir com a mais antiga (página seguinte)', () => {
    const antiga = ancora('old', agora - DIA);
    const a = decidirProximaAcao({
      estado: { ...base, status: 'pedindo', ancoraInicial: ancora('sc', agora) },
      conectado: true,
      ancoraSidecar: ancora('sc', agora),
      maisAntigaJsonl: antiga,
      agoraMs: agora,
    });
    expect(a).toEqual({ tipo: 'pedir', ancora: antiga, count: BACKFILL_PAGINA });
  });

  it('mesma âncora já pedida → concluir sem_novidade', () => {
    const antiga = ancora('old', agora - DIA);
    const a = decidirProximaAcao({
      estado: {
        ...base,
        status: 'pedindo',
        ancoraInicial: ancora('sc', agora),
        ancoraTentada: 'old',
        totalTrazido: 20,
      },
      conectado: true,
      ancoraSidecar: ancora('sc', agora),
      maisAntigaJsonl: antiga,
      agoraMs: agora,
    });
    expect(a).toEqual({ tipo: 'concluir', motivo: 'sem_novidade' });
  });

  it('teto de mensagens → concluir teto_msgs', () => {
    const a = decidirProximaAcao({
      estado: { ...base, totalTrazido: BACKFILL_TETO_MSGS },
      conectado: true,
      ancoraSidecar: ancora('sc', agora),
      maisAntigaJsonl: null,
      agoraMs: agora,
    });
    expect(a).toEqual({ tipo: 'concluir', motivo: 'teto_msgs' });
  });

  it('mais antiga além de 30 dias da inicial → teto_dias', () => {
    const inicial = ancora('sc', agora);
    const velha = ancora('ancient', agora - (BACKFILL_TETO_DIAS + 1) * DIA);
    const a = decidirProximaAcao({
      estado: {
        ...base,
        status: 'pedindo',
        ancoraInicial: inicial,
        ancoraTentada: 'outra',
        totalTrazido: 100,
      },
      conectado: true,
      ancoraSidecar: inicial,
      maisAntigaJsonl: velha,
      agoraMs: agora,
    });
    expect(a).toEqual({ tipo: 'concluir', motivo: 'teto_dias' });
  });

  it('já concluído → ja_concluido', () => {
    expect(
      decidirProximaAcao({
        estado: { status: 'concluido', totalTrazido: 10 },
        conectado: true,
        ancoraSidecar: null,
        maisAntigaJsonl: null,
        agoraMs: agora,
      }),
    ).toEqual({ tipo: 'concluir', motivo: 'ja_concluido' });
  });
});

describe('aposPedir / aposConcluir / estadoNovo', () => {
  it('aposPedir grava âncora inicial e tentada', () => {
    const sc = ancora('sc', agora);
    const e = aposPedir(estadoNovo('2026-01-01T00:00:00.000Z'), sc, '2026-01-01T00:00:00.000Z');
    expect(e.status).toBe('pedindo');
    expect(e.ancoraTentada).toBe('sc');
    expect(e.ancoraInicial?.id).toBe('sc');
  });

  it('aposConcluir diferencia sem_resposta de concluido', () => {
    const e = estadoNovo('t');
    expect(aposConcluir(e, 'sem_novidade').status).toBe('sem_resposta');
    expect(aposConcluir(e, 'teto_msgs').status).toBe('concluido');
  });
});
