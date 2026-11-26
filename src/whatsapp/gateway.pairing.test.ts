import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { GatewayStatus } from '../core/message.js';
import { BaileysGateway } from './gateway.js';

type Update = { connection?: 'open' | 'close' | 'connecting'; qr?: string };
type Priv = {
  onConnectionUpdate: (u: Update) => void;
  connect: () => Promise<void>;
  reconnectTimer: NodeJS.Timeout | null;
  sock: { requestPairingCode: ReturnType<typeof vi.fn> } | null;
  refreshGroups: () => Promise<void>;
};

async function makeGateway(pairNumber?: string) {
  const base = await mkdtemp(join(tmpdir(), 'wac-gw-pair-'));
  const authDir = join(base, 'auth');
  const dataDir = join(base, 'data');
  await mkdir(authDir);
  await mkdir(dataDir);
  const gw = new BaileysGateway(authDir, dataDir, pairNumber);
  const statuses: GatewayStatus[] = [];
  gw.onStatus((s) => statuses.push(s));
  const priv = gw as unknown as Priv;
  const requestPairingCode = vi.fn().mockResolvedValue('ABCD1234');
  priv.sock = { requestPairingCode };
  priv.refreshGroups = vi.fn().mockResolvedValue(undefined);
  return { gw, priv, statuses, requestPairingCode };
}

describe('pareamento por código (PAIR_NUMBER e API)', () => {
  it('pede o código quando chega um QR (sessão não autenticada), uma vez por socket', async () => {
    const { priv, requestPairingCode } = await makeGateway('5511999999999');
    priv.onConnectionUpdate({ qr: 'qr-1' });
    priv.onConnectionUpdate({ qr: 'qr-2' }); // rotação do QR não repete o pedido
    expect(requestPairingCode).toHaveBeenCalledTimes(1);
    expect(requestPairingCode).toHaveBeenCalledWith('5511999999999');
  });

  it('NÃO pede o código quando a conexão abre sem QR (sessão pareada pelo QR)', async () => {
    const { priv, requestPairingCode } = await makeGateway('5511999999999');
    priv.onConnectionUpdate({ connection: 'connecting' });
    priv.onConnectionUpdate({ connection: 'open' });
    expect(requestPairingCode).not.toHaveBeenCalled();
  });

  it('sem PAIR_NUMBER nunca pede código automaticamente', async () => {
    const { priv, requestPairingCode } = await makeGateway(undefined);
    priv.onConnectionUpdate({ qr: 'qr-1' });
    expect(requestPairingCode).not.toHaveBeenCalled();
  });

  it('requestPairingCode emite pairingCode no status e limpa dígitos', async () => {
    const { gw, priv, statuses, requestPairingCode } = await makeGateway(undefined);
    priv.onConnectionUpdate({ qr: 'qr-atual' });
    const code = await gw.requestPairingCode('+55 (11) 99999-9999');
    expect(code).toBe('ABCD1234');
    expect(requestPairingCode).toHaveBeenCalledWith('5511999999999');
    expect(statuses.at(-1)).toEqual({
      connection: undefined,
      qr: 'qr-atual',
      pairingCode: 'ABCD1234',
    });
  });

  it('falha no connect() agenda reconexão com backoff sem rejeição não tratada', async () => {
    vi.useFakeTimers();
    try {
      const base = await mkdtemp(join(tmpdir(), 'wac-gw-connect-err-'));
      // authDir apontando para um arquivo (não diretório) força useMultiFileAuthState a falhar.
      const invalidAuthPath = join(base, 'not-a-dir');
      await mkdir(join(base, 'data'));
      const { writeFile } = await import('node:fs/promises');
      await writeFile(invalidAuthPath, 'bloqueio', 'utf8');

      const gw = new BaileysGateway(invalidAuthPath, join(base, 'data'));
      const priv = gw as unknown as Priv;
      await expect(priv.connect()).resolves.toBeUndefined();
      expect(priv.reconnectTimer).not.toBeNull();
      if (priv.reconnectTimer) clearTimeout(priv.reconnectTimer);
    } finally {
      vi.useRealTimers();
    }
  });
});
