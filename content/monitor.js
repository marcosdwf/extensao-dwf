// Roda em todos os sites DWF: registra atividade do usuário e envia heartbeat
// ao service worker. Sem heartbeat = guia congelada → o watchdog recarrega.

(() => {
  // Evita duplicar listeners/intervalos se for injetado duas vezes
  // (manifest + reinjeção do adoptExistingTabs no mesmo mundo isolado).
  if (globalThis.__dwfMonitorActive) return;
  globalThis.__dwfMonitorActive = true;

  const HEARTBEAT_MS = 30000;
  let lastActivity = 0;

  const markActivity = () => {
    lastActivity = Date.now();
  };

  for (const evt of ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"]) {
    window.addEventListener(evt, markActivity, { passive: true, capture: true });
  }

  const sendHeartbeat = () => {
    try {
      chrome.runtime.sendMessage({ type: "heartbeat", lastActivity }).catch(() => {});
    } catch {
      // extensão recarregada/atualizada: contexto invalidado, ignora
    }
  };

  sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sendHeartbeat();
  });
})();
