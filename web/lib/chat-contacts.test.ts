import { describe, expect, it } from "vitest";
import { contactsFromMessages, senderLabel } from "./chat-contacts";

describe("senderLabel", () => {
  it("resolve o próprio jid como você", () => {
    const contacts = {
      names: new Map<string, string>(),
      mine: new Set(["5511999999999"]),
      team: new Set<string>(),
    };
    expect(senderLabel("5511999999999@s.whatsapp.net", contacts)).toBe("você");
  });

  it("não vaza LID cru quando o id não está no mapa", () => {
    const contacts = {
      names: new Map<string, string>(),
      mine: new Set<string>(),
      team: new Set<string>(),
    };
    expect(senderLabel("277897403211794@lid", contacts)).toBeNull();
  });

  it("usa o nome do mapa quando existe", () => {
    const contacts = {
      names: new Map([["277897403211794", "Gustavo Rahmeier"]]),
      mine: new Set<string>(),
      team: new Set<string>(),
    };
    expect(senderLabel("277897403211794@lid", contacts)).toBe("Gustavo Rahmeier");
  });
});

describe("contactsFromMessages — citação com LID", () => {
  it("liga o LID da citação ao autor da mensagem citada (fromMe → você)", () => {
    const contacts = contactsFromMessages([
      {
        id: "ORIG",
        sender: "5511888888888:2@s.whatsapp.net",
        senderName: "Você",
        fromMe: true,
      },
      {
        id: "REPLY",
        sender: "5511999999999@s.whatsapp.net",
        senderName: "Gustavo Rahmeier",
        fromMe: false,
        quotedId: "ORIG",
        quotedSender: "277897403211794@lid",
      },
    ]);
    expect(senderLabel("277897403211794@lid", contacts)).toBe("você");
  });

  it("liga o LID da citação ao nome do contato quando a original não é sua", () => {
    const contacts = contactsFromMessages([
      {
        id: "ORIG",
        sender: "5511999999999@s.whatsapp.net",
        senderName: "Gustavo Rahmeier",
        fromMe: false,
      },
      {
        id: "REPLY",
        sender: "5511888888888:2@s.whatsapp.net",
        senderName: "Você",
        fromMe: true,
        quotedId: "ORIG",
        quotedSender: "400000000000001@lid",
      },
    ]);
    expect(senderLabel("400000000000001@lid", contacts)).toBe("Gustavo Rahmeier");
  });
});

describe("contactsFromMessages — nome real vence id cru", () => {
  it("telefone gravado como nome na 1ª mensagem dá lugar ao nome que chega depois", () => {
    const contacts = contactsFromMessages([
      { id: "ORIG", sender: "5511999999999@s.whatsapp.net", senderName: "5511999999999", fromMe: false },
      { id: "DEPOIS", sender: "5511999999999@s.whatsapp.net", senderName: "Gustavo Rahmeier", fromMe: false },
      { id: "REPLY", sender: "5511888888888@s.whatsapp.net", senderName: "Você", fromMe: true, quotedId: "ORIG", quotedSender: "400000000000001@lid" },
    ]);
    expect(senderLabel("400000000000001@lid", contacts)).toBe("Gustavo Rahmeier");
  });

  it("nome real não é trocado por um id cru que chega depois", () => {
    const contacts = contactsFromMessages([
      { id: "A", sender: "5511999999999@s.whatsapp.net", senderName: "Gustavo", fromMe: false },
      { id: "B", sender: "5511999999999@s.whatsapp.net", senderName: "5511999999999", fromMe: false },
    ]);
    expect(senderLabel("5511999999999@s.whatsapp.net", contacts)).toBe("Gustavo");
  });

  it("jid inteiro ou telefone formatado no nome não aparece como autor", () => {
    for (const cru of ["277897403211794@lid", "+55 (11) 99999-9999", "5511999999999:2@s.whatsapp.net"]) {
      const contacts = { names: new Map([["277897403211794", cru]]), mine: new Set<string>(), team: new Set<string>() };
      expect(senderLabel("277897403211794@lid", contacts)).toBeNull();
    }
    const comNumero = { names: new Map([["1", "Loja 2000"]]), mine: new Set<string>(), team: new Set<string>() };
    expect(senderLabel("1@lid", comNumero)).toBe("Loja 2000");
  });
});
