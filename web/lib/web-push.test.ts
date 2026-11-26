import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerSubscriptions, removerSubscription, salvarSubscription } from "./web-push";

describe("web-push", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wac-push-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("salva deduplicando por endpoint e remove corretamente", async () => {
    await salvarSubscription(
      { endpoint: "https://push.exemplo/sub/1", keys: { p256dh: "k1", auth: "a1" }, usuario: "ana" },
      dir,
    );
    await salvarSubscription(
      { endpoint: "https://push.exemplo/sub/1", keys: { p256dh: "k2", auth: "a2" }, usuario: "ana" },
      dir,
    );
    const lista = await lerSubscriptions(dir);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.keys.p256dh).toBe("k2");

    expect(await removerSubscription("https://push.exemplo/sub/1", dir)).toBe(true);
    expect(await lerSubscriptions(dir)).toEqual([]);
  });

  it("rejeita subscription incompleta", async () => {
    await expect(
      salvarSubscription({ endpoint: "", keys: { p256dh: "k", auth: "a" }, usuario: "ana" }, dir),
    ).rejects.toThrow();
  });
});
