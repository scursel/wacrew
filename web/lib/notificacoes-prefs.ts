"use client";

/**
 * Preferências locais de notificações do painel (por navegador/dispositivo).
 * Som, banner (toast) e contador na aba funcionam tanto em HTTP quanto em HTTPS;
 * notificações do sistema (Notification API / Web Push) exigem contexto seguro (HTTPS ou localhost).
 */
export interface PrefsNotificacao {
  som: boolean;
  toast: boolean;
  tituloAba: boolean;
  alertaSistema: boolean;
}

const CHAVE_PREFS = "balcao:notificacoes:prefs";
const CHAVE_ALERTA_LEGADO = "balcao:notificacoes:alertaNativo";

export const EVENTO_PREFS_NOTIFICACAO = "wac:notificacoes:prefs";
export const EVENTO_TESTE_NOTIFICACAO = "wac:notificacoes:teste";

export const PREFS_PADRAO: PrefsNotificacao = {
  som: true,
  toast: true,
  tituloAba: true,
  alertaSistema: false,
};

export function lerPrefsNotificacao(): PrefsNotificacao {
  if (typeof window === "undefined") return PREFS_PADRAO;
  try {
    const raw = window.localStorage.getItem(CHAVE_PREFS);
    const legado = window.localStorage.getItem(CHAVE_ALERTA_LEGADO);
    const parsed = raw ? (JSON.parse(raw) as Partial<PrefsNotificacao>) : null;
    const alertaSistema =
      typeof parsed?.alertaSistema === "boolean"
        ? parsed.alertaSistema
        : legado === "1";
    const permissaoOk =
      typeof Notification !== "undefined" && Notification.permission === "granted";
    return {
      som: typeof parsed?.som === "boolean" ? parsed.som : PREFS_PADRAO.som,
      toast: typeof parsed?.toast === "boolean" ? parsed.toast : PREFS_PADRAO.toast,
      tituloAba:
        typeof parsed?.tituloAba === "boolean" ? parsed.tituloAba : PREFS_PADRAO.tituloAba,
      alertaSistema: alertaSistema && permissaoOk,
    };
  } catch {
    return PREFS_PADRAO;
  }
}

export function salvarPrefsNotificacao(parcial: Partial<PrefsNotificacao>): PrefsNotificacao {
  const atual = lerPrefsNotificacao();
  const proximo: PrefsNotificacao = { ...atual, ...parcial };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CHAVE_PREFS, JSON.stringify(proximo));
      window.localStorage.setItem(CHAVE_ALERTA_LEGADO, proximo.alertaSistema ? "1" : "0");
    } catch {
      /* navegador sem localStorage */
    }
    window.dispatchEvent(new CustomEvent<PrefsNotificacao>(EVENTO_PREFS_NOTIFICACAO, { detail: proximo }));
  }
  return proximo;
}

export function contextoSeguroParaPush(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.isSecureContext);
}

let audioCtx: AudioContext | null = null;

/**
 * Toca um aviso sonoro discreto de 2 notas (Web Audio API).
 * Funciona em HTTP e HTTPS, sem precisar de arquivo de áudio externo.
 */
export function tocarSomNotificacao(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
    const now = audioCtx.currentTime;
    const notas = [
      { freq: 659.25, inicio: 0, duracao: 0.14 }, // E5
      { freq: 880, inicio: 0.11, duracao: 0.22 }, // A5
    ];
    for (const n of notas) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.freq, now + n.inicio);
      gain.gain.setValueAtTime(0.0001, now + n.inicio);
      gain.gain.exponentialRampToValueAtTime(0.14, now + n.inicio + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.inicio + n.duracao);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + n.inicio);
      osc.stop(now + n.inicio + n.duracao + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}

export function dispararTesteNotificacao(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_TESTE_NOTIFICACAO));
}
