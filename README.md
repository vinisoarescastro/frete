# Calculadora de Fretes

Calculadora de frete com orçamento para o cliente, mapa e rotas do OpenStreetMap, protegida por senha.
Node.js puro, **sem dependências** (`npm install` não é necessário).

## Estrutura

```
server/            Servidor HTTP (Node, sem dependências)
  index.js         Rotas, login, API, cabeçalhos de segurança
  auth.js          Sessões e bloqueio por tentativas
  db.js            Banco SQLite (configurações, rascunho e histórico)
  maps.js          Escolhe o provedor de endereços e rotas
  providers/       geoapify.js (com chave) e osm.js (Nominatim, Photon e OSRM, sem chave)
  static.js        Entrega de arquivos estáticos
views/login.html   Tela de login
assets/            Design system (público, a tela de login também usa)
public/            Aplicação (só acessível após o login)
  js/              Módulos ES: calc (regras), state, store, forms, render, quote, pdf, recent, geo, map, main
  css/app.css      Estilos próprios do app
  vendor/          Leaflet (mapa) e jsPDF (PDF), incluídos no projeto
data/frete.db      Banco de dados (criado sozinho, fora do git)
test/              Testes (npm test)
```

## Banco de dados

SQLite em arquivo único (`data/frete.db`, ou o caminho de `DB_PATH`), usando o módulo `node:sqlite` do próprio Node.
Guarda as **configurações**, o **rascunho** do orçamento atual (continue de onde parou em outro aparelho) e o
**histórico** de orçamentos enviados. O navegador mantém só uma cópia local, para funcionar sem conexão.
Na VPS, o usuário do serviço precisa ter permissão de escrita na pasta `data/`. Para backup, copie o arquivo `data/frete.db`.

## Enviar o orçamento

- **WhatsApp:** abre a conversa com o telefone do cliente (se informado) com o texto pronto. Sem telefone, o WhatsApp pede o contato.
- **Copiar texto:** copia o orçamento em texto simples.
- **PDF:** gera o arquivo. No celular abre o menu de compartilhar; no computador baixa o PDF.

## Simulador para clientes

A página pública `/simular` (sem senha) deixa o cliente simular o valor do frete. Ele informa nome e WhatsApp, aceita o uso dos dados e então o simulador abre: coleta, entrega, tipo de frete (ida ou ida e volta) e data desejada (ou "Ainda não tenho uma data definida"). O valor é calculado no servidor com as suas configurações e só o valor final volta ao cliente (nunca custos, margem ou lucro).

- Cada cadastro e simulação ficam na aba **Simulações** do painel, com botões para chamar no WhatsApp e **Criar orçamento** (abre a calculadora já preenchida).
- Proteções: campo invisível contra robôs, limite de uso por IP e uma sessão por cadastro para a busca de endereços.
- O orçamento manual continua independente, na aba Orçamento.

## Design system

A interface segue o Atlas Design System (repositório `design-system`, lido apenas como referência).
Tokens, base, componentes e layout foram copiados para `assets/css/` (classes `ds-*`, `.sidebar`, `.page`, etc.) e os ícones
Lucide vêm de `assets/icons.svg`. Para atualizar, copie de novo os arquivos do design system; os estilos específicos
do app ficam só em `public/css/app.css`. O tema (claro/escuro) usa `data-theme` no `<html>` e a chave `theme` do localStorage.

## Rodar localmente

```bash
cp .env.example .env     # edite APP_PASSWORD
npm start                # http://127.0.0.1:3000
npm test
```

Requer Node 22.13 ou superior.

## Mapa, endereços e rotas

- **Imagens do mapa:** OpenStreetMap (sem chave).
- **Busca de endereços e rotas:** [Geoapify](https://myprojects.geoapify.com) quando `GEOAPIFY_KEY` está no `.env`
  (cadastro gratuito, sem cartão, 3.000 créditos por dia). A chave fica só no servidor.
  Sem a chave, usa Nominatim + OSRM do OpenStreetMap, que são servidores públicos e podem falhar ou ficar lentos.

- **Sugestões ao digitar:** vêm do Photon (OpenStreetMap, sem chave) ou do autocompletar do Geoapify, quando a chave está configurada.
- **Clique no mapa:** marca o ponto que falta e descobre o endereço (geocodificação reversa).

O site precisa ser aberto por `http://` ou `https://` (não por arquivo local), senão o OpenStreetMap bloqueia as imagens do mapa.

## Publicar na VPS

1. Instale Node 22+ e copie o projeto para `/opt/frete`. Crie o `.env` com `TRUST_PROXY=true` e `HOST=127.0.0.1`.
2. Serviço systemd (`/etc/systemd/system/frete.service`):

```ini
[Unit]
Description=Calculadora de Fretes
After=network.target

[Service]
WorkingDirectory=/opt/frete
ExecStart=/usr/bin/node --env-file=.env server/index.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now frete
```

3. HTTPS com Caddy (`/etc/caddy/Caddyfile`), que obtém o certificado sozinho:

```
seu-dominio.com {
    reverse_proxy 127.0.0.1:3000
}
```

Use sempre HTTPS: sem ele a senha trafega em texto puro.

## Segurança

- Todas as páginas, arquivos e `/api/*` exigem login (cookie `HttpOnly`, `SameSite=Strict`, `Secure` em HTTPS).
- 5 senhas erradas bloqueiam o IP por 15 minutos.
- Sessões ficam em memória: reiniciar o servidor desconecta você.
- Os dados ficam no banco SQLite do servidor (veja acima), acessível só após o login.
