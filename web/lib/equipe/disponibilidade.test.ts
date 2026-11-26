import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { definirDisponibilidade, escolherProximoRoundRobin, lerDisponibilidade } from "./disponibilidade";

describe("disponibilidade e round-robin", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-disp-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("persiste disponibilidade por login", async () => {
    await definirDisponibilidade("ana", "online", dir);
    await definirDisponibilidade("bruno", "ocupado", dir);
    expect(await lerDisponibilidade(dir)).toEqual({ ana: "online", bruno: "ocupado" });
  });

  it("faz rotação round-robin considerando apenas agentes online", async () => {
    await definirDisponibilidade("ana", "online", dir);
    await definirDisponibilidade("bruno", "ocupado", dir);
    await definirDisponibilidade("carla", "online", dir);

    const membros = ["ana", "bruno", "carla"];
    expect(await escolherProximoRoundRobin("oficina", membros, undefined, dir)).toBe("ana");
    expect(await escolherProximoRoundRobin("oficina", membros, undefined, dir)).toBe("carla");
    expect(await escolherProximoRoundRobin("oficina", membros, undefined, dir)).toBe("ana");
  });

  it("retorna null quando nenhum membro está online", async () => {
    await definirDisponibilidade("ana", "offline", dir);
    expect(await escolherProximoRoundRobin("oficina", ["ana"], undefined, dir)).toBeNull();
  });
});
