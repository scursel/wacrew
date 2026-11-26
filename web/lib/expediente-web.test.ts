import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  calcularEsperaComercialMs,
  type ExpedienteWebConfig,
  lerExpedienteWeb,
  salvarExpedienteWeb,
} from "./expediente-web";
import { buildSlaInfoComercial } from "./sla";

describe("expediente-web e SLA comercial", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-exp-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("salva e lê configuração de expediente", async () => {
    const padrao = await lerExpedienteWeb(dir);
    expect(padrao.ativo).toBe(false);

    const saved = await salvarExpedienteWeb({ ativo: true, timezone: "America/Sao_Paulo" }, dir);
    expect(saved.ativo).toBe(true);
    expect((await lerExpedienteWeb(dir)).ativo).toBe(true);
  });

  it("calcula apenas minutos dentro da janela comercial quando ativo", () => {
    const cfg: ExpedienteWebConfig = {
      ativo: true,
      timezone: "UTC",
      dias: { seg: ["09:00", "18:00"] },
      recado_dentro: "",
      recado_fora: "",
    };
    // Segunda-feira 2026-11-23 das 08:00 UTC às 11:00 UTC -> só 09:00..11:00 = 2h
    const inicio = "2026-11-23T08:00:00.000Z";
    const fimMs = Date.parse("2026-11-23T11:00:00.000Z");
    const esperaMs = calcularEsperaComercialMs(inicio, fimMs, cfg);
    expect(esperaMs).toBe(2 * 60 * 60_000);

    const sla = buildSlaInfoComercial(inicio, fimMs, cfg);
    expect(sla.band).toBe("mild"); // 2h -> mild (1-4h), não 3h
    expect(sla.label).toBe("há 2h");
  });
});
