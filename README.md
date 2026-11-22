# Calculadora de Fretes

Calculadora de frete com orçamento para o cliente, mapa e rotas do Google Maps, protegida por senha.
Node.js puro, **sem dependências** (`npm install` não é necessário).

## Estrutura

```
server/            Servidor HTTP
  index.js         Rotas, login, cabeçalhos de segurança
  auth.js          Sessões e bloqueio por tentativas
  maps.js          Proxy para Geocoding API e Routes API (chave do servidor)
  static.js        Entrega de arquivos estáticos
  config.js        Variáveis de ambiente
views/login.html   Tela de login
public/            Aplicação (só acessível após o login)
  css/styles.css
  js/              Módulos ES: calc (regras), state, forms, render, quote, geo, map, main
test/              Testes (npm test)
```

## Rodar localmente

```bash
cp .env.example .env     # edite APP_PASSWORD e as chaves do Google
npm start                # http://127.0.0.1:3000
npm test
```

Requer Node 22.9 ou superior.

## Google Cloud (duas chaves)

No projeto do Google Cloud, ative a cobrança e as APIs **Maps JavaScript API**, **Geocoding API** e **Routes API**.

| Chave | Variável | Restrição recomendada |
|-------|----------|-----------------------|
| Navegador | `GOOGLE_MAPS_BROWSER_KEY` | Referenciadores HTTP: `https://seu-dominio/*`; só Maps JavaScript API |
| Servidor | `GOOGLE_MAPS_SERVER_KEY` | Endereço IP da VPS; só Geocoding API e Routes API |

A chave do navegador é entregue apenas depois do login. A do servidor nunca sai do servidor.
Opcional: crie um *Map ID* e coloque em `GOOGLE_MAPS_MAP_ID` (o padrão `DEMO_MAP_ID` serve para uso pessoal).

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
- Os dados (configurações e rascunho do orçamento) ficam no `localStorage` do navegador, não no servidor.
