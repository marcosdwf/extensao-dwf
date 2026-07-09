// Tela de configurações: lê/grava "settings" em chrome.storage.sync e
// gerencia credenciais via mensagens ao service worker (nunca toca na chave).

const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.sync.get("settings");
  const s = dwfMergeSettings(stored.settings);

  $("site-power").checked = s.sites.power;
  $("site-app").checked = s.sites.app;
  $("site-mdm").checked = s.sites.mdm;

  $("keepalive-enabled").checked = s.keepAlive.enabled;
  $("idle-minutes").value = s.idleMinutes;

  $("reload-enabled").checked = s.autoReload.enabled;
  $("reload-minutes").value = s.autoReload.minutes;

  $("cleanup-enabled").checked = s.cleanup.enabled;
  $("cleanup-hours").value = s.cleanup.hours;
  $("cleanup-scope").value = s.cleanup.scope;
  $("cleanup-onlogout").checked = s.cleanup.clearOnLogout;

  $("login-enabled").checked = s.autoLogin.enabled;
  $("login-mode").value = s.autoLogin.mode;

  $("sound-enabled").checked = s.soundAlert.enabled;

  await refreshCredStatus();
}

async function refreshCredStatus() {
  const list = await chrome.runtime.sendMessage({ type: "listCredentials" });
  const container = $("creds-list");
  container.innerHTML = "";
  $("creds-empty").hidden = list.length > 0;

  for (const entry of list) {
    const row = document.createElement("div");
    row.className = "cred-row";

    const name = document.createElement("span");
    name.className = "cred-user";
    name.textContent = entry.username;
    row.appendChild(name);

    if (entry.isDefault) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Padrão";
      row.appendChild(badge);
    } else {
      const makeDefault = document.createElement("button");
      makeDefault.textContent = "Tornar padrão";
      makeDefault.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ type: "setDefaultCredential", id: entry.id });
        await refreshCredStatus();
      });
      row.appendChild(makeDefault);
    }

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Remover";
    del.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "deleteCredential", id: entry.id });
      await refreshCredStatus();
    });
    row.appendChild(del);

    container.appendChild(row);
  }
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function save() {
  const settings = {
    sites: {
      power: $("site-power").checked,
      app: $("site-app").checked,
      mdm: $("site-mdm").checked
    },
    keepAlive: { enabled: $("keepalive-enabled").checked },
    idleMinutes: clampInt($("idle-minutes").value, 1, 60, DWF_DEFAULTS.idleMinutes),
    autoReload: {
      enabled: $("reload-enabled").checked,
      minutes: clampInt($("reload-minutes").value, 1, 1440, DWF_DEFAULTS.autoReload.minutes)
    },
    cleanup: {
      enabled: $("cleanup-enabled").checked,
      hours: clampInt($("cleanup-hours").value, 1, 720, DWF_DEFAULTS.cleanup.hours),
      scope: $("cleanup-scope").value,
      clearOnLogout: $("cleanup-onlogout").checked
    },
    autoLogin: {
      enabled: $("login-enabled").checked,
      mode: $("login-mode").value
    },
    soundAlert: { enabled: $("sound-enabled").checked }
  };
  await chrome.storage.sync.set({ settings });
  flash("Configurações salvas.");
}

function flash(text) {
  $("status").textContent = text;
  setTimeout(() => ($("status").textContent = ""), 2500);
}

$("save").addEventListener("click", save);

$("test-notification").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "testNotification" });
  flash("Notificação de teste enviada.");
});

$("save-creds").addEventListener("click", async () => {
  const username = $("cred-user").value.trim();
  const password = $("cred-pass").value;
  if (!username || !password) {
    flash("Preencha usuário e senha.");
    return;
  }
  await chrome.runtime.sendMessage({ type: "addCredential", username, password });
  $("cred-user").value = "";
  $("cred-pass").value = "";
  await refreshCredStatus();
  flash("Conta salva.");
});

load();
