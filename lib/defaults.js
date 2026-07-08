// Configuração padrão e constantes compartilhadas.
// Carregado via importScripts (background), <script> (options/popup) e content script.
// Usa globalThis para ser idempotente quando injetado mais de uma vez na mesma página.

globalThis.DWF_HOSTS = globalThis.DWF_HOSTS || {
  power: "power.dwfsistemas.com",
  app: "app.dwfsistemas.com",
  mdm: "mdm.dwfsistemas.com"
};

globalThis.DWF_DEFAULTS = globalThis.DWF_DEFAULTS || {
  sites: { power: true, app: true, mdm: true },
  autoReload: { enabled: true, minutes: 30 },
  cleanup: { enabled: true, hours: 24, scope: "cache" }, // "cache" | "storage" | "full"
  keepAlive: { enabled: true },
  autoLogin: { enabled: true, mode: "auto" }, // "auto" | "f2"
  soundAlert: { enabled: true },
  idleMinutes: 2
};

// Mescla configurações salvas sobre os padrões (raso por seção).
globalThis.dwfMergeSettings = globalThis.dwfMergeSettings || function (saved) {
  const d = globalThis.DWF_DEFAULTS;
  const s = saved || {};
  return {
    sites: { ...d.sites, ...(s.sites || {}) },
    autoReload: { ...d.autoReload, ...(s.autoReload || {}) },
    cleanup: { ...d.cleanup, ...(s.cleanup || {}) },
    keepAlive: { ...d.keepAlive, ...(s.keepAlive || {}) },
    autoLogin: { ...d.autoLogin, ...(s.autoLogin || {}) },
    soundAlert: { ...d.soundAlert, ...(s.soundAlert || {}) },
    idleMinutes: typeof s.idleMinutes === "number" ? s.idleMinutes : d.idleMinutes
  };
};

// Dado um hostname, retorna a chave do site ("power" | "app" | "mdm") ou null.
globalThis.dwfSiteKey = globalThis.dwfSiteKey || function (hostname) {
  for (const [key, host] of Object.entries(globalThis.DWF_HOSTS)) {
    if (hostname === host) return key;
  }
  return null;
};
