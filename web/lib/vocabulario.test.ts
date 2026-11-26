import { describe, expect, it } from "vitest";
import { plural, ROTULOS } from "./vocabulario";

describe("vocabulario", () => {
  it("expõe rótulos unificados e pluralização simples", () => {
    expect(ROTULOS.conversa).toBe("Conversa");
    expect(ROTULOS.notaPrivada).toBe("Nota privada");
    expect(plural(1, "conversa", "conversas")).toBe("conversa");
    expect(plural(3, "conversa", "conversas")).toBe("conversas");
  });
});
