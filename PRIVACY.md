# Política de Privacidade — Assistente DWF

Última atualização: julho de 2026

## Resumo

A extensão **Assistente DWF** não coleta, não transmite e não vende nenhum dado
do usuário. Tudo o que ela armazena fica no navegador do próprio usuário.

## Quais dados a extensão armazena

- **Configurações** (intervalos de recarregamento, escopo de limpeza, sites
  ativos): armazenadas em `chrome.storage.sync`, sincronizadas apenas entre os
  navegadores da conta Google do próprio usuário, pelo mecanismo padrão do
  Chrome.
- **Credenciais de login** (opcional, somente se o usuário decidir salvá-las):
  usuário e senha do painel `app.dwfsistemas.com`, criptografados com AES-GCM
  256 bits e armazenados exclusivamente em `chrome.storage.local`, no
  computador do usuário. A chave de criptografia é gerada localmente na
  instalação e nunca sai da máquina. As credenciais **não** são sincronizadas
  nem enviadas a nenhum servidor.
- **Estado técnico temporário** (horário do último recarregamento e da última
  limpeza por guia): mantido em memória de sessão e descartado ao fechar o
  navegador.

## O que a extensão faz com permissões

- `alarms`: agendar recarregamentos e limpezas periódicas.
- `storage`: guardar configurações e credenciais (como descrito acima).
- `browsingData`: limpar dados de navegação **apenas das origens
  dwfsistemas.com**, conforme configurado pelo usuário.
- Acesso aos sites `power.dwfsistemas.com`, `app.dwfsistemas.com` e
  `mdm.dwfsistemas.com`: manter as guias ativas, recarregá-las e preencher o
  formulário de login. A extensão não lê nem interage com nenhum outro site.

## O que a extensão NÃO faz

- Não envia nenhum dado para servidores externos (não faz nenhuma requisição
  de rede própria).
- Não coleta histórico de navegação, análises de uso ou telemetria.
- Não usa cookies próprios nem rastreadores.
- Não executa código remoto.

## Remoção de dados

Desinstalar a extensão remove todas as configurações e credenciais
armazenadas. As credenciais também podem ser apagadas a qualquer momento na
tela de configurações da extensão.

## Contato

Dúvidas sobre esta política: marcos.o.andrade@gmail.com
