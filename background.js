// Service worker: mantém guias DWF vivas, auto-reload, limpeza periódica
// e guarda/entrega credenciais criptografadas para o auto-login.

importScripts("lib/defaults.js", "lib/crypto.js");

const TICK_ALARM = "dwf-tick";
const HEARTBEAT_STALE_MS = 150000; // 2,5 min sem heartbeat = guia congelada/travada
const PENDING_CREDS_TTL_MS = 5 * 60000;

// ---------- Configurações e estado ----------

async function getSettings() {
  const stored = await chrome.storage.sync.get("settings");
  return dwfMergeSettings(stored.settings);
}

async function getTabState() {
  const stored = await chrome.storage.session.get("tabState");
  return stored.tabState || {};
}

async function setTabState(state) {
  await chrome.storage.session.set({ tabState: state });
}

function enabledUrlPatterns(settings) {
  return Object.entries(DWF_HOSTS)
    .filter(([key]) => settings.sites[key])
    .map(([, host]) => `https://${host}/*`);
}

function enabledOrigins(settings) {
  return Object.entries(DWF_HOSTS)
    .filter(([key]) => settings.sites[key])
    .map(([, host]) => `https://${host}`);
}

function isDwfUrl(url, settings) {
  try {
    const key = dwfSiteKey(new URL(url).hostname);
    return key !== null && (!settings || settings.sites[key]);
  } catch {
    return false;
  }
}

// ---------- Ciclo de vida ----------

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await dwfGetKey(); // gera a chave de criptografia na instalação
  const stored = await chrome.storage.local.get("lastCleanup");
  if (!stored.lastCleanup) {
    await chrome.storage.local.set({ lastCleanup: Date.now() });
  }
  await adoptExistingTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await adoptExistingTabs();
});

// "Adota" guias DWF já abertas quando a extensão (re)inicia: protege contra
// descarte, registra no estado de monitoramento e reinjeta os content scripts
// (após reload/atualização da extensão os scripts antigos ficam órfãos e o
// heartbeat morre — sem isso o monitoramento dessas guias parava).
async function adoptExistingTabs() {
  const settings = await getSettings();
  const patterns = enabledUrlPatterns(settings);
  if (!patterns.length) return;
  const tabs = await chrome.tabs.query({ url: patterns });
  const state = await getTabState();
  const now = Date.now();

  for (const tab of tabs) {
    if (settings.keepAlive.enabled) setAutoDiscardable(tab);
    state[tab.id] = state[tab.id] || {
      lastReload: now,
      lastHeartbeat: now,
      lastActivity: 0
    };
    if (tab.discarded) continue; // será recarregada pelo watchdog
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["lib/defaults.js", "content/monitor.js"]
      });
      const host = new URL(tab.url).hostname;
      if (host === DWF_HOSTS.app) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/autologin.js"]
        });
      } else if (host === DWF_HOSTS.power) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/unifilar.js"]
        });
      }
    } catch {
      // guia fechou no meio ou não aceita injeção; watchdog cuida depois
    }
  }
  await setTabState(state);
}

function setAutoDiscardable(tab) {
  if (tab.autoDiscardable !== false) {
    chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
  }
}

// Navegação concluída numa guia DWF: protege contra descarte e zera o relógio
// de reload (a página acabou de carregar, está fresca).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  const settings = await getSettings();
  if (!isDwfUrl(tab.url, settings)) return;
  if (settings.keepAlive.enabled) setAutoDiscardable(tab);
  const state = await getTabState();
  const now = Date.now();
  state[tabId] = {
    ...(state[tabId] || {}),
    lastReload: now,
    lastHeartbeat: now
  };
  await setTabState(state);
});

// ---------- Alerta de som ----------
// Quando uma guia DWF começa a emitir som, notifica na central do Windows.

const SOUND_COOLDOWN_MS = 15000; // evita spam de bipes repetidos

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.audible !== true || !tab.url) return;
  const settings = await getSettings();
  if (!settings.soundAlert.enabled || !isDwfUrl(tab.url, settings)) return;

  const state = await getTabState();
  const st = (state[tabId] = state[tabId] || {});
  const now = Date.now();
  if (st.soundNotifiedAt && now - st.soundNotifiedAt < SOUND_COOLDOWN_MS) return;
  st.soundNotifiedAt = now;
  await setTabState(state);

  let host = "";
  try {
    host = new URL(tab.url).hostname;
  } catch {}
  chrome.notifications.create(`dwf-sound-${tabId}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Assistente DWF",
    message: "Som detectado, alarme tocando",
    contextMessage: host,
    priority: 2
  });
});

// Clicar na notificação leva direto à guia de origem (som ou modal de alarme).
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const match = notificationId.match(/^dwf-(?:sound|alarmmodal)-(\d+)$/);
  if (!match) return;
  const tabId = Number(match[1]);
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    // guia já fechada
  }
  chrome.notifications.clear(notificationId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getTabState();
  if (state[tabId]) {
    delete state[tabId];
    await setTabState(state);
  }
});

// ---------- Tique principal ----------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) tick();
});

async function tick() {
  const settings = await getSettings();
  const patterns = enabledUrlPatterns(settings);
  const state = await getTabState();
  const now = Date.now();
  const idleMs = settings.idleMinutes * 60000;

  const tabs = patterns.length ? await chrome.tabs.query({ url: patterns }) : [];
  const liveIds = new Set();

  for (const tab of tabs) {
    liveIds.add(tab.id);
    const st = (state[tab.id] = state[tab.id] || {
      lastReload: now,
      lastHeartbeat: now,
      lastActivity: 0
    });

    if (settings.keepAlive.enabled) setAutoDiscardable(tab);

    const idle = now - (st.lastActivity || 0) >= idleMs;
    let reload = false;
    let bypass = false;

    if (settings.keepAlive.enabled) {
      if (tab.discarded === true || tab.frozen === true) {
        // Guia descartada/congelada não tem usuário interagindo: recarrega já.
        reload = true;
      } else if (
        tab.status === "complete" &&
        now - (st.lastHeartbeat || 0) > HEARTBEAT_STALE_MS &&
        idle
      ) {
        reload = true; // sem heartbeat = página suspensa/travada
      }
    }

    if (
      !reload &&
      settings.autoReload.enabled &&
      now - (st.lastReload || 0) >= settings.autoReload.minutes * 60000 &&
      idle
    ) {
      reload = true;
    }

    if (st.pendingBypass && (reload || idle)) {
      reload = true;
      bypass = true;
    }

    if (reload) {
      try {
        await chrome.tabs.reload(tab.id, { bypassCache: bypass });
        st.lastReload = now;
        st.lastHeartbeat = now;
        st.pendingBypass = false;
      } catch {
        // guia pode ter fechado entre o query e o reload
      }
    }
  }

  for (const id of Object.keys(state)) {
    if (!liveIds.has(Number(id))) delete state[id];
  }
  await setTabState(state);

  await maybeCleanup(settings, tabs, state);
}

// ---------- Limpeza periódica ----------

async function maybeCleanup(settings, tabs, state) {
  if (!settings.cleanup.enabled) return;
  const { lastCleanup } = await chrome.storage.local.get("lastCleanup");
  const now = Date.now();
  if (lastCleanup && now - lastCleanup < settings.cleanup.hours * 3600000) return;
  await runCleanup(settings, tabs, state);
}

// immediate = true (botão "limpar agora"): recarrega as guias na hora, com
// bypass de cache. immediate = false (limpeza periódica de 24 h): só marca
// pendingBypass e deixa o tique recarregar quando o usuário ficar ocioso,
// para não interromper quem está trabalhando.
async function runCleanup(settings, tabs, state, { immediate = false } = {}) {
  const origins = enabledOrigins(settings);
  if (!origins.length) return;

  const scope = settings.cleanup.scope;
  if (scope === "storage" || scope === "full") {
    // "cache" (HTTP) não aceita filtro por origem; é coberto pelo reload com
    // bypassCache abaixo. Aqui só tipos que respeitam origins.
    await chrome.browsingData.remove(
      { origins },
      {
        cacheStorage: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        cookies: scope === "full"
      }
    );
  }

  const now = Date.now();
  for (const tab of tabs) {
    const st = (state[tab.id] = state[tab.id] || {});
    if (immediate) {
      // Recarrega já, sem cache: é o único jeito de limpar o cache HTTP por
      // origem (browsingData não filtra cache por origem).
      try {
        await chrome.tabs.reload(tab.id, { bypassCache: true });
        st.lastReload = now;
        st.lastHeartbeat = now;
        st.pendingBypass = false;
      } catch {
        // guia fechou no meio; segue as demais
      }
    } else {
      st.pendingBypass = true;
    }
  }
  await setTabState(state);
  await chrome.storage.local.set({ lastCleanup: now });
}

// ---------- Credenciais (múltiplas contas) ----------
//
// Cada entrada: { id, userEnc, passEnc, isDefault }. A senha nunca é
// devolvida para a tela de configurações — só o service worker a decripta,
// e só para preencher o formulário de login (getAutoLoginData).

async function loadCredentialList() {
  const { credentials } = await chrome.storage.local.get("credentials");
  return Array.isArray(credentials) ? credentials : [];
}

async function saveCredentialList(list) {
  await chrome.storage.local.set({ credentials: list });
}

async function decryptCredentialList(list) {
  const out = [];
  for (const entry of list) {
    try {
      out.push({
        id: entry.id,
        isDefault: !!entry.isDefault,
        username: await dwfDecrypt(entry.userEnc),
        password: await dwfDecrypt(entry.passEnc)
      });
    } catch {
      // entrada corrompida/chave trocada: ignora
    }
  }
  return out;
}

function pickDefault(decryptedList) {
  return decryptedList.find((e) => e.isDefault) || decryptedList[0] || null;
}

// Adiciona uma conta nova, ou atualiza a senha se o usuário já existir.
// A primeira conta salva vira padrão automaticamente.
async function upsertCredential(username, password) {
  const list = await loadCredentialList();
  const decrypted = await decryptCredentialList(list);
  const matchIdx = decrypted.findIndex((e) => e.username === username);

  if (matchIdx >= 0) {
    const id = decrypted[matchIdx].id;
    const entry = list.find((e) => e.id === id);
    entry.passEnc = await dwfEncrypt(password);
    entry.userEnc = await dwfEncrypt(username);
  } else {
    list.push({
      id: crypto.randomUUID(),
      isDefault: list.length === 0,
      userEnc: await dwfEncrypt(username),
      passEnc: await dwfEncrypt(password)
    });
  }
  await saveCredentialList(list);
}

async function setDefaultCredential(id) {
  const list = await loadCredentialList();
  for (const entry of list) entry.isDefault = entry.id === id;
  await saveCredentialList(list);
}

async function deleteCredential(id) {
  let list = await loadCredentialList();
  const wasDefault = list.some((e) => e.id === id && e.isDefault);
  list = list.filter((e) => e.id !== id);
  if (wasDefault && list.length > 0) list[0].isDefault = true;
  await saveCredentialList(list);
}

// ---------- Mensagens ----------

function senderIsExtensionPage(sender) {
  // Não usar `!sender.tab`: a página de opções abre numa aba de verdade,
  // então sender.tab vem preenchido mesmo sendo uma página da extensão.
  // O que identifica é o esquema da URL, não a presença de aba.
  return sender.origin === `chrome-extension://${chrome.runtime.id}`;
}

function senderIsAppTab(sender) {
  try {
    return !!sender.tab && new URL(sender.url).hostname === DWF_HOSTS.app;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e) }));
  return true; // resposta assíncrona
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case "heartbeat": {
      if (!sender.tab) return {};
      const state = await getTabState();
      const st = (state[sender.tab.id] = state[sender.tab.id] || {});
      st.lastHeartbeat = Date.now();
      if (typeof msg.lastActivity === "number") st.lastActivity = msg.lastActivity;
      await setTabState(state);
      return {};
    }

    case "getAutoLoginData": {
      // Credenciais só saem para a guia do app DWF ou para páginas da extensão.
      if (!senderIsAppTab(sender) && !senderIsExtensionPage(sender)) return null;
      const settings = await getSettings();
      const decrypted = await decryptCredentialList(await loadCredentialList());
      const def = pickDefault(decrypted);
      return {
        enabled: settings.autoLogin.enabled && settings.sites.app,
        mode: settings.autoLogin.mode,
        clearCacheOnLogin: settings.cleanup.clearOnLogout && settings.sites.app,
        credentials: def ? { username: def.username, password: def.password } : null
      };
    }

    case "pendingCredentials": {
      if (!senderIsAppTab(sender)) return {};
      await chrome.storage.session.set({
        pendingCreds: {
          username: String(msg.username || ""),
          password: String(msg.password || ""),
          ts: Date.now()
        }
      });
      return {};
    }

    case "getPendingCredentials": {
      if (!senderIsAppTab(sender)) return null;
      const { pendingCreds, pendingDismissed } =
        await chrome.storage.session.get(["pendingCreds", "pendingDismissed"]);
      if (!pendingCreds || !pendingCreds.username || !pendingCreds.password) return null;
      if (Date.now() - pendingCreds.ts > PENDING_CREDS_TTL_MS) {
        await chrome.storage.session.remove("pendingCreds");
        return null;
      }
      if (pendingDismissed === pendingCreds.username) return null;
      const decrypted = await decryptCredentialList(await loadCredentialList());
      const match = decrypted.find((e) => e.username === pendingCreds.username);
      if (match && match.password === pendingCreds.password) {
        await chrome.storage.session.remove("pendingCreds");
        return null;
      }
      return { username: pendingCreds.username };
    }

    case "confirmSavePending": {
      if (!senderIsAppTab(sender)) return {};
      const { pendingCreds } = await chrome.storage.session.get("pendingCreds");
      if (pendingCreds) {
        await upsertCredential(pendingCreds.username, pendingCreds.password);
        await chrome.storage.session.remove("pendingCreds");
      }
      return { saved: true };
    }

    case "dismissPending": {
      if (!senderIsAppTab(sender)) return {};
      const { pendingCreds } = await chrome.storage.session.get("pendingCreds");
      await chrome.storage.session.set({
        pendingDismissed: pendingCreds ? pendingCreds.username : ""
      });
      await chrome.storage.session.remove("pendingCreds");
      return {};
    }

    case "addCredential": {
      if (!senderIsExtensionPage(sender)) return {};
      await upsertCredential(String(msg.username || ""), String(msg.password || ""));
      return { saved: true };
    }

    case "listCredentials": {
      // Nunca inclui a senha — só usuário, id e qual é a padrão.
      if (!senderIsExtensionPage(sender)) return [];
      const decrypted = await decryptCredentialList(await loadCredentialList());
      return decrypted.map((e) => ({
        id: e.id,
        username: e.username,
        isDefault: e.isDefault
      }));
    }

    case "setDefaultCredential": {
      if (!senderIsExtensionPage(sender) || !msg.id) return {};
      await setDefaultCredential(msg.id);
      return { done: true };
    }

    case "deleteCredential": {
      if (!senderIsExtensionPage(sender) || !msg.id) return {};
      await deleteCredential(msg.id);
      return { done: true };
    }

    case "getStatus": {
      if (!senderIsExtensionPage(sender)) return null;
      const settings = await getSettings();
      const state = await getTabState();
      const { lastCleanup } = await chrome.storage.local.get("lastCleanup");
      const patterns = enabledUrlPatterns(settings);
      const tabs = patterns.length ? await chrome.tabs.query({ url: patterns }) : [];
      return {
        settings,
        lastCleanup: lastCleanup || null,
        tabs: tabs.map((t) => {
          let host = "";
          try {
            host = new URL(t.url).hostname;
          } catch {}
          const st = state[t.id] || {};
          return {
            id: t.id,
            host,
            protected: t.autoDiscardable === false,
            lastReload: st.lastReload || null
          };
        })
      };
    }

    case "reloadNow": {
      if (!senderIsExtensionPage(sender) || msg.tabId == null) return {};
      await chrome.tabs.reload(msg.tabId, { bypassCache: true });
      const state = await getTabState();
      const st = (state[msg.tabId] = state[msg.tabId] || {});
      st.lastReload = Date.now();
      st.lastHeartbeat = Date.now();
      st.pendingBypass = false;
      await setTabState(state);
      return {};
    }

    case "reloadAllNow": {
      if (!senderIsExtensionPage(sender)) return {};
      const settings = await getSettings();
      const patterns = enabledUrlPatterns(settings);
      const tabs = patterns.length ? await chrome.tabs.query({ url: patterns }) : [];
      const state = await getTabState();
      const now = Date.now();
      for (const tab of tabs) {
        try {
          await chrome.tabs.reload(tab.id, { bypassCache: true });
          const st = (state[tab.id] = state[tab.id] || {});
          st.lastReload = now;
          st.lastHeartbeat = now;
          st.pendingBypass = false;
        } catch {
          // guia fechou no meio; segue as demais
        }
      }
      await setTabState(state);
      return { reloaded: tabs.length };
    }

    case "testNotification": {
      if (!senderIsExtensionPage(sender)) return {};
      chrome.notifications.create(`dwf-test-${Date.now()}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Assistente DWF",
        message: "Som detectado, alarme tocando",
        contextMessage: "Notificação de teste",
        priority: 2
      });
      return { sent: true };
    }

    case "cleanupNow": {
      if (!senderIsExtensionPage(sender)) return {};
      const settings = await getSettings();
      const patterns = enabledUrlPatterns(settings);
      const tabs = patterns.length ? await chrome.tabs.query({ url: patterns }) : [];
      const state = await getTabState();
      await runCleanup(settings, tabs, state, { immediate: true });
      return { done: true };
    }

    case "unifilarAlarmModal": {
      // Modal "não conseguiu habilitar o som" apareceu no unifilar (power).
      // A extensão não mexe na modal — só lembra o usuário via notificação;
      // ativar o som exige um toque real dele na página.
      if (!sender.tab) return {};
      let host = "";
      try {
        host = new URL(sender.url).hostname;
      } catch {}
      if (host !== DWF_HOSTS.power) return {};
      chrome.notifications.create(`dwf-alarmmodal-${sender.tab.id}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Assistente DWF",
        message: "Ative o som dos alarmes: o unifilar está pedindo confirmação.",
        contextMessage: host,
        priority: 2
      });
      return {};
    }

    case "clearLoginCache": {
      // Disparado pelo content script ao cair em /login ou /logout do app.
      // Limpa o cache da origem (cacheStorage + service workers) para o
      // próximo carregamento vir atualizado, sem recarregar a página de login
      // (recarregar cairia de novo em /login e faria loop).
      if (!senderIsAppTab(sender)) return {};
      const settings = await getSettings();
      if (!settings.cleanup.clearOnLogout || !settings.sites.app) return {};
      const appOrigin = `https://${DWF_HOSTS.app}`;
      try {
        await chrome.browsingData.remove(
          { origins: [appOrigin] },
          { cacheStorage: true, serviceWorkers: true }
        );
        // Cache HTTP não filtra por origem; limpa o global para garantir
        // assets/JS atualizados após a entrada. Só acontece no logout (raro).
        await chrome.browsingData.remove({}, { cache: true });
      } catch {
        // sem permissão/origem inválida: apenas ignora, o login segue
      }
      return { cleared: true };
    }

    default:
      return {};
  }
}
