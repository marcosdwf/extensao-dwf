# Assistente DWF

Extensão para navegadores Chromium (Chrome, Edge, Brave…) que mantém os
painéis DWF Sistemas sempre ativos e atualizados.

Sites atendidos: `power.dwfsistemas.com`, `app.dwfsistemas.com`,
`mdm.dwfsistemas.com`.

## Funcionalidades

| Função | Padrão | Configurável |
|---|---|---|
| Manter guia viva (anti-descarte + watchdog + heartbeat) | ligado | on/off |
| Auto-reload | 30 min | intervalo em minutos |
| Limpeza de dados dos sites DWF | 24 h, só cache | intervalo, escopo (cache / +storage / completa) |
| Auto-login (app.dwfsistemas.com/login), múltiplas contas com uma padrão | automático | automático ou só F2 |
| Alerta de som (notificação do Windows quando alguma guia DWF tocar som) | ligado | on/off |
| Janela de ociosidade antes de qualquer reload | 2 min | minutos |

No popup: lista de todas as guias DWF abertas (qualquer janela), botão para
recarregar só a guia atual e botão para recarregar todas de uma vez.

Regra de ouro: **nenhum reload acontece enquanto o usuário está mexendo na
página** — a extensão espera a ociosidade configurada.

## Instalação para desenvolvimento/teste

1. Clone o repositório:
   ```
   git clone https://github.com/<seu-usuario>/<seu-repositorio>.git
   ```
2. Abra `chrome://extensions` no navegador.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e aponte para a pasta clonada
   (a que contém `manifest.json`).
5. Depois de qualquer `git pull` com mudanças no código, volte em
   `chrome://extensions` e clique no ícone de recarregar (↻) da extensão.

## Como testar rápido

1. Nas configurações da extensão, reduza os intervalos (reload 1 min,
   limpeza 1 h, ociosidade 1 min).
2. **Auto-reload**: abra um site DWF e deixe quieto → recarrega no intervalo;
   fique mexendo o mouse → não recarrega.
3. **Anti-descarte**: abra `chrome://discards`, confira `Auto Discardable = ✗`
   na guia DWF; force um "Urgent Discard" → a extensão recarrega a guia em até
   1 min.
4. **Auto-login**: entre no app manualmente → banner "Salvar login?" aparece
   após o login dar certo → salve → deslogue → ao voltar à página de login a
   extensão entra sozinha (ou com F2, conforme o modo).
5. **Limpeza**: use o botão "Limpar dados agora" no popup e confira no
   DevTools → Application que só os dados dos sites DWF sumiram.

## Publicação na Chrome Web Store

1. Hospede o conteúdo de `PRIVACY.md` numa URL pública (ex.: GitHub Pages ou
   site da DWF) — a Store exige link de política de privacidade.
2. Compacte a pasta em `.zip` (sem a pasta raiz dentro do zip: manifest.json
   na raiz do arquivo).
3. Envie em <https://chrome.google.com/webstore/devconsole> (taxa única de
   US$ 5 para conta de desenvolvedor).
4. Na ficha: propósito único = "manter painéis DWF Sistemas ativos e
   atualizados"; justifique cada permissão (alarms = agendamento,
   storage = configurações/credenciais locais, browsingData = limpeza restrita
   às origens DWF, host permissions = atuação somente nos 3 domínios).

## Segurança

- Credenciais criptografadas (AES-GCM 256) e guardadas só em
  `chrome.storage.local` — nunca sincronizam, nunca saem da máquina.
- A extensão não faz nenhuma requisição de rede própria e não injeta nada em
  sites fora dos 3 domínios DWF.
- Modelo de proteção: igual ao de gerenciadores de senha de navegador sem
  senha-mestre — protege contra leitura casual do disco, não contra malware
  com acesso total ao perfil do usuário.
