# Calculadora de Fretes

Calculadora de frete com orçamento para o cliente, mapa e rotas do OpenStreetMap, protegida por senha.
Node.js puro, **sem dependências** (`npm install` não é necessário).

## Estrutura

```
server/            Servidor HTTP
  index.js         Rotas, login, cabeçalhos de segurança
  auth.js          Sessões e bloqueio por tentativas
  maps.js          Escolhe o provedor de endereços e rotas
  providers/       geoapify.js (com chave) e osm.js (Nominatim + OSRM, sem chave)
  static.js        Entrega de arquivos estáticos
  config.js        Variáveis de ambiente
views/login.html   Tela de login
public/            Aplicação (só acessível após o login)
  css/styles.css
  vendor/leaflet/  Biblioteca do mapa (Leaflet, incluída no projeto)
  js/              Módulos ES: calc (regras), state, forms, render, quote, geo, map, main
test/              Testes (npm test)
```

## Rodar localmente

```bash
cp .env.example .env     # edite APP_PASSWORD
npm start                # http://127.0.0.1:3000
npm test
```

Requer Node 22.9 ou superior.

## Mapa, endereços e rotas

- **Imagens do mapa:** OpenStreetMap (sem chave).
- **Busca de endereços e rotas:** [Geoapify](https://myprojects.geoapify.com) quando `GEOAPIFY_KEY` está no `.env`
  (cadastro gratuito, sem cartão, 3.000 créditos por dia). A chave fica só no servidor.
  Sem a chave, usa Nominatim + OSRM do OpenStreetMap, que são servidores públicos e podem falhar ou ficar lentos.

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
- Os dados (configurações e rascunho do orçamento) ficam no `localStorage` do navegador, não no servidor.
