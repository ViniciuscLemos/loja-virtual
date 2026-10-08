# Loja Virtual

![CI](https://github.com/ViniciuscLemos/loja-virtual/actions/workflows/ci.yml/badge.svg)

E-commerce completo com pagamento pelo Stripe, contas de usuário com permissões (cliente e admin) e envio de e-mails.

É o maior projeto do meu portfólio até agora, e tô construindo por etapas. Esse README vai sendo atualizado conforme cada parte fica pronta.

## Andamento

- [x] **Etapa 1:** estrutura, banco de dados, cadastro, login e permissões
- [ ] **Etapa 2:** e-mails (confirmação de conta e recuperação de senha)
- [ ] **Etapa 3:** produtos, estoque e painel do admin
- [ ] **Etapa 4:** carrinho, pedidos e pagamento com Stripe
- [ ] **Etapa 5:** front-end em React
- [ ] **Etapa 6:** deploy

## Tecnologias

- **API:** Node.js, Express 5 e TypeScript
- **Banco:** PostgreSQL com Drizzle ORM e migrações em SQL
- **Validação:** Zod
- **Testes:** Vitest + Supertest, rodando num Postgres em memória (PGlite)

## Rodando

Precisa do Node 22 ou mais novo.

```bash
git clone https://github.com/ViniciuscLemos/loja-virtual
cd loja-virtual
npm install
npm run dev
```

A API sobe em http://localhost:3333.

Não precisa instalar banco nenhum: sem a variável `DATABASE_URL`, a API usa o [PGlite](https://pglite.dev), que é o Postgres compilado pra rodar dentro do Node, e salva os dados na pasta `server/.pglite`. Pra usar um Postgres de verdade:

```bash
docker compose up -d
cp server/.env.example server/.env   # e descomenta o DATABASE_URL
npm run dev
```

As migrações rodam sozinhas quando a API sobe.

### Criando um admin

Cadastra uma conta normal e depois promove ela:

```bash
npm run tornar-admin -w server -- seu@email.com
```

Com o PGlite, para a API antes de rodar esse comando, porque ele só deixa um processo usar a pasta do banco por vez.

### Testes

```bash
npm test
```

Cada arquivo de teste sobe o próprio Postgres em memória e aplica as migrações, então os testes rodam com SQL de verdade, sem mock do banco e sem precisar de Docker. No GitHub Actions tem um segundo job que sobe a API com um PostgreSQL normal pra garantir que funciona nele também.

## Rotas

```
POST   /api/auth/cadastro               cria a conta e já entra
POST   /api/auth/login                  entra
POST   /api/auth/logout                 sai e encerra a sessão
GET    /api/auth/eu                     usuário logado
GET    /api/admin/usuarios              lista os usuários (só admin)
PATCH  /api/admin/usuarios/:id/papel    muda o papel de alguém (só admin)
```

## Como a autenticação funciona

Pensei bastante nessa parte, então deixo aqui o porquê de cada escolha.

**Sessão no banco em vez de JWT.** Quando a pessoa entra, a API gera um token aleatório e manda num cookie. No banco fica só o hash SHA-256 desse token. A cada requisição a API procura a sessão pelo hash e já traz o usuário junto. Escolhi isso em vez de JWT porque dá pra encerrar uma sessão de verdade: o logout apaga a sessão no servidor, e quem tiver copiado o cookie antes não consegue mais usar. Com JWT o token continua valendo até expirar.

**As permissões valem na hora.** Como o papel do usuário (cliente ou admin) é lido do banco a cada requisição, quando um admin é rebaixado ele perde o acesso na próxima requisição, sem esperar token vencer.

**O cookie.** É `httpOnly`, então o JavaScript da página não consegue ler o token, mesmo se alguém conseguir injetar um script. É `SameSite=Lax`, então o navegador não manda o cookie em POST feito por outro site. E como segunda barreira contra CSRF, a API recusa requisições que mudam dados quando o cabeçalho `Origin` não é o do front.

**A sessão dura 30 dias e se renova.** Se faltar menos da metade do prazo e a pessoa usar a loja, a sessão ganha mais 30 dias. Quem usa sempre não precisa ficar entrando de novo, e quem sumiu cai depois de um mês.

**Senhas.** Ficam com hash bcrypt. No login, a mensagem é a mesma pra senha errada e pra e-mail sem conta. Quando o e-mail não existe, a API compara a senha com um hash falso, pra resposta demorar o mesmo tempo e não dar pra descobrir quem tem conta pelo tempo de resposta. O login e o cadastro também têm limite de 10 tentativas a cada 15 minutos por IP.

## Estrutura

```
server/
  drizzle/           migrações SQL geradas pelo drizzle-kit
  src/
    app.ts           monta o Express (recebe o banco, o que facilita testar)
    server.ts        conecta no banco, roda as migrações e sobe a API
    config.ts        variáveis de ambiente validadas com Zod
    db/              schema e conexão (Postgres ou PGlite)
    auth/            sessões, middlewares e rotas de login
    admin/           rotas só pra admin
    lib/             erros, hash de senha e tokens
  test/              testes de integração
```
