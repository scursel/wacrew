import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  exportarContatosCsv,
  importarContatosCsv,
  lerContatosCrm,
  obterContatoCrm,
  removerContatoCrm,
  salvarContatoCrm,
} from "./contatos-crm";

describe("contatos-crm", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-crm-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("cria, atualiza e remove contato preservando campos parciais", async () => {
    const salvo = await salvarContatoCrm(
      {
        id: "dm-5511999990000",
        nome: "Carlos Souza",
        telefone: "5511999990000",
        email: "carlos@oficina.com",
        empresa: "Oficina Central",
        camposCustom: { veiculo: "Gol 2020" },
      },
      dir,
    );
    expect(salvo.empresa).toBe("Oficina Central");

    const atualizado = await salvarContatoCrm(
      { id: "dm-5511999990000", nome: "Carlos Souza", telefone: "5511999990000", notas: "Cliente VIP" },
      dir,
    );
    expect(atualizado.email).toBe("carlos@oficina.com");
    expect(atualizado.notas).toBe("Cliente VIP");

    expect(await obterContatoCrm("dm-5511999990000", dir)).not.toBeNull();
    expect(await removerContatoCrm("dm-5511999990000", dir)).toBe(true);
    expect(await lerContatosCrm(dir)).toEqual({});
  });

  it("exporta e importa CSV com vírgula ou ponto-e-vírgula", async () => {
    const csv = `\uFEFFnome;telefone;email;empresa;etiquetas\n"Ana, Paula";5511988887777;ana@ex.com;AutoMix;VIP|Oficina\nLinha Sem Numero;;;;\n`;
    const res = await importarContatosCsv(csv, dir);
    expect(res).toEqual({ importados: 1, ignorados: 1 });

    const lista = Object.values(await lerContatosCrm(dir));
    expect(lista).toHaveLength(1);
    expect(lista[0]?.id).toBe("dm-5511988887777");
    expect(lista[0]?.etiquetas).toEqual(["VIP", "Oficina"]);

    const out = exportarContatosCsv(lista);
    expect(out).toContain('"Ana, Paula"');
    expect(out).toContain("VIP|Oficina");
  });
});
