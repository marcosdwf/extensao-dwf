// Só em power.dwfsistemas.com/unifilar. Ao atualizar a página, o sistema abre
// uma modal ("app-confirm-alarm-dialog") avisando que não conseguiu habilitar
// o som dos alarmes. A extensão NÃO toca na modal — apenas avisa o service
// worker, que dispara uma notificação do Windows lembrando o usuário de
// ativar o som na página.

(() => {
  if (globalThis.__dwfUnifilarActive) return;
  globalThis.__dwfUnifilarActive = true;

  // Só atua no unifilar; nas demais páginas do power não faz nada.
  if (!location.pathname.startsWith("/unifilar")) return;

  const DIALOG_SEL = "app-confirm-alarm-dialog";
  const WAIT_MS = 60000; // a modal aparece após a falha do autoplay; pode demorar

  const notifyOnce = () => {
    try {
      chrome.runtime.sendMessage({ type: "unifilarAlarmModal" }).catch(() => {});
    } catch {
      // extensão recarregada/atualizada: contexto invalidado, ignora
    }
  };

  let sent = false;
  const check = () => {
    if (sent || !document.querySelector(DIALOG_SEL)) return false;
    sent = true;
    notifyOnce();
    return true;
  };

  if (check()) return; // modal já estava na tela

  const timer = setTimeout(() => obs.disconnect(), WAIT_MS);
  const obs = new MutationObserver(() => {
    if (check()) {
      clearTimeout(timer);
      obs.disconnect();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
