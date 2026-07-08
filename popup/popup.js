// Popup: lista todas as guias DWF abertas no navegador (qualquer janela),
// com proteção e tempo até o próximo reload, mais atalhos de ação.

const $ = (id) => document.getElementById(id);

function fmtDuration(ms) {
  if (ms <= 0) return "em instantes";
  const min = Math.round(ms / 60000);
  if (min < 60) return `em ~${min} min`;
  return `em ~${Math.round(min / 60)} h`;
}

function fmtSince(ts) {
  if (!ts) return "nunca";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

function renderTabs(status, currentTabId) {
  const container = $("tabs-list");
  container.innerHTML = "";
  const s = status.settings;

  if (!status.tabs.length) {
    $("site-status").textContent = "Nenhuma guia DWF aberta no navegador.";
    return false;
  }

  $("site-status").textContent =
    status.tabs.length === 1
      ? "1 guia DWF aberta:"
      : `${status.tabs.length} guias DWF abertas:`;

  let currentIsDwf = false;
  for (const t of status.tabs) {
    if (t.id === currentTabId) currentIsDwf = true;

    const row = document.createElement("div");
    row.className = "tab-row" + (t.id === currentTabId ? " current" : "");

    const name = document.createElement("div");
    name.className = "tab-host";
    name.textContent = t.host + (t.id === currentTabId ? " (esta guia)" : "");

    const info = document.createElement("div");
    info.className = "tab-info";
    const prot = t.protected ? "protegida" : "sem proteção";
    let reload;
    if (s.autoReload.enabled && t.lastReload) {
      reload = fmtDuration(t.lastReload + s.autoReload.minutes * 60000 - Date.now());
    } else {
      reload = s.autoReload.enabled ? "aguardando registro" : "reload desativado";
    }
    info.textContent = `${prot} · próximo reload ${reload}`;

    row.append(name, info);
    container.appendChild(row);
  }
  return currentIsDwf;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTabId = tab ? tab.id : null;

  const status = await chrome.runtime.sendMessage({ type: "getStatus" });

  $("d-cleanup").textContent = status.settings.cleanup.enabled
    ? fmtSince(status.lastCleanup)
    : "desativada";

  const currentIsDwf = renderTabs(status, currentTabId);

  if (currentIsDwf) {
    $("reload-now").hidden = false;
    $("reload-now").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "reloadNow", tabId: currentTabId });
      window.close();
    });
  }

  $("reload-all").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "reloadAllNow" });
    window.close();
  });

  $("cleanup-now").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "cleanupNow" });
    window.close();
  });

  $("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

init();
