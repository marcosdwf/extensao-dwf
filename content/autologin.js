// Só em app.dwfsistemas.com. Na página de login: preenche e envia credenciais
// salvas (automático ou via F2). Nas demais páginas: oferece salvar o login
// usado na última entrada bem-sucedida.

(() => {
  if (globalThis.__dwfAutologinActive) return;
  globalThis.__dwfAutologinActive = true;

  const LOGIN_PATH = "/login";
  const LOGOUT_PATH = "/logout";
  const LOOP_GUARD_KEY = "dwfLoginAttemptTs";
  const LOOP_GUARD_MS = 60000;
  const FORM_WAIT_MS = 15000;

  // Guarda da limpeza de cache no logout: evita limpar de novo no redirect
  // /logout -> /login (mesma aba). É independente do guard do auto login.
  const CACHE_GUARD_KEY = "dwfLoginCacheClearedTs";
  const CACHE_GUARD_MS = 30000;

  const isLoginPage = () => location.pathname.startsWith(LOGIN_PATH);
  const isLogoutPage = () => location.pathname.startsWith(LOGOUT_PATH);

  const send = (msg) => {
    try {
      return chrome.runtime.sendMessage(msg);
    } catch {
      return Promise.resolve(null);
    }
  };

  // Preenche input disparando o setter nativo + eventos, para frameworks
  // reativos (React/Vue) enxergarem o valor.
  const setNativeValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const findLoginFields = () => {
    const pass = document.querySelector('input[type="password"]');
    if (!pass) return null;
    const form = pass.closest("form");
    const scope = form || document;
    const user = scope.querySelector(
      'input[type="email"], input[type="text"], input:not([type])'
    );
    if (!user) return null;
    return { form, user, pass };
  };

  // Aguarda o form aparecer (SPA pode renderizar depois do document_idle).
  const waitForFields = () =>
    new Promise((resolve) => {
      const found = findLoginFields();
      if (found) return resolve(found);
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, FORM_WAIT_MS);
      const observer = new MutationObserver(() => {
        const f = findLoginFields();
        if (f) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(f);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });

  const submitForm = (fields) => {
    if (fields.form) {
      const btn = fields.form.querySelector(
        'button[type="submit"], input[type="submit"], button:not([type])'
      );
      if (btn) {
        btn.click();
        return;
      }
      fields.form.requestSubmit ? fields.form.requestSubmit() : fields.form.submit();
      return;
    }
    // Sem <form>: tenta Enter no campo de senha
    fields.pass.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })
    );
  };

  // Pede ao service worker para limpar o cache da origem. NÃO recarrega a
  // página de login (recarregar cairia de novo em /login = loop). Só limpa;
  // o próximo carregamento (o app, após a entrada) vem atualizado.
  const maybeClearLoginCache = async (data) => {
    if (!data || !data.clearCacheOnLogin) return;
    const last = Number(sessionStorage.getItem(CACHE_GUARD_KEY) || 0);
    if (Date.now() - last < CACHE_GUARD_MS) return;
    sessionStorage.setItem(CACHE_GUARD_KEY, String(Date.now()));
    await send({ type: "clearLoginCache" });
  };

  const doLogin = async (manual, preloaded) => {
    const data = preloaded || (await send({ type: "getAutoLoginData" }));
    if (!data || !data.credentials) {
      if (manual) showToast("Assistente DWF: nenhum login salvo. Configure na extensão.");
      return;
    }
    if (!manual) {
      if (!data.enabled || data.mode !== "auto") return;
      const lastTry = Number(sessionStorage.getItem(LOOP_GUARD_KEY) || 0);
      if (Date.now() - lastTry < LOOP_GUARD_MS) {
        showToast("Assistente DWF: login automático falhou; entre manualmente ou aperte F2.");
        return;
      }
    }
    const fields = await waitForFields();
    if (!fields) return;
    sessionStorage.setItem(LOOP_GUARD_KEY, String(Date.now()));
    setNativeValue(fields.user, data.credentials.username);
    setNativeValue(fields.pass, data.credentials.password);
    submitForm(fields);
  };

  // Captura o submit para oferecer "salvar login" após a entrada dar certo.
  const watchSubmit = () => {
    document.addEventListener(
      "submit",
      () => {
        const fields = findLoginFields();
        if (!fields || !fields.user.value || !fields.pass.value) return;
        send({
          type: "pendingCredentials",
          username: fields.user.value,
          password: fields.pass.value
        });
      },
      { capture: true }
    );
    // Fallback para logins sem evento submit (clique em botão)
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest('button, input[type="submit"]');
        if (!btn) return;
        const fields = findLoginFields();
        if (!fields || !fields.user.value || !fields.pass.value) return;
        send({
          type: "pendingCredentials",
          username: fields.user.value,
          password: fields.pass.value
        });
      },
      { capture: true }
    );
  };

  // ---------- UI injetada ----------

  const showToast = (text) => {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, baseBoxStyle(), { padding: "10px 14px" });
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  };

  const baseBoxStyle = () => ({
    position: "fixed",
    top: "12px",
    right: "12px",
    zIndex: "2147483647",
    background: "#1e293b",
    color: "#f1f5f9",
    font: "13px/1.5 system-ui, sans-serif",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0,0,0,.35)"
  });

  const showSaveBanner = (username) => {
    if (document.querySelector("[data-dwf-save-banner]")) return; // já tem um aberto
    const box = document.createElement("div");
    box.dataset.dwfSaveBanner = "1";
    Object.assign(box.style, baseBoxStyle(), { padding: "12px 14px", maxWidth: "320px" });

    const msg = document.createElement("div");
    msg.textContent = `Salvar o login de "${username}" para entrada automática?`;
    msg.style.marginBottom = "8px";

    const mkBtn = (label, primary) => {
      const b = document.createElement("button");
      b.textContent = label;
      Object.assign(b.style, {
        marginRight: "8px",
        padding: "5px 12px",
        border: "0",
        borderRadius: "6px",
        cursor: "pointer",
        font: "inherit",
        background: primary ? "#3b82f6" : "#475569",
        color: "#fff"
      });
      return b;
    };

    const save = mkBtn("Salvar", true);
    const dismiss = mkBtn("Agora não", false);
    save.onclick = async () => {
      await send({ type: "confirmSavePending" });
      box.remove();
      showToast("Assistente DWF: login salvo.");
    };
    dismiss.onclick = () => {
      send({ type: "dismissPending" });
      box.remove();
    };

    box.append(msg, save, dismiss);
    document.documentElement.appendChild(box);
  };

  // ---------- Inicialização ----------

  // watchSubmit registra listeners no document (capture), que sobrevivem às
  // trocas de rota SPA; por isso só pode rodar uma vez.
  let submitWatched = false;
  const ensureSubmitWatcher = () => {
    if (submitWatched) return;
    submitWatched = true;
    watchSubmit();
  };

  // Chamado no carregamento e a cada troca de rota (inclusive SPA). Em
  // /login ou /logout: limpa o cache (se ligado) e então faz o auto login,
  // nessa ordem. Nas demais páginas: oferece salvar o login pendente.
  const onRoute = async () => {
    if (isLoginPage() || isLogoutPage()) {
      const data = await send({ type: "getAutoLoginData" });
      await maybeClearLoginCache(data);
      if (isLoginPage()) {
        ensureSubmitWatcher();
        doLogin(false, data);
      }
    } else {
      const pending = await send({ type: "getPendingCredentials" });
      if (pending && pending.username) showSaveBanner(pending.username);
    }
  };

  // Logout manual navega para /login por dentro do Angular (sem recarregar a
  // página), então o content script não reinjeta. O mundo isolado não enxerga
  // o pushState do app, logo monkeypatch de history não pega — a via confiável
  // é vigiar location.href. Assim o auto login volta a disparar após qualquer
  // logout (manual ou automático). Quem não quiser, desliga nas configurações.
  let lastHref = location.href;
  const checkRoute = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    onRoute();
  };
  setInterval(checkRoute, 1000);
  window.addEventListener("popstate", checkRoute);

  // F2 força o login manual sempre que estiver na tela de login.
  window.addEventListener("keydown", (e) => {
    if (e.key === "F2" && isLoginPage()) {
      e.preventDefault();
      doLogin(true);
    }
  });

  onRoute();
})();
