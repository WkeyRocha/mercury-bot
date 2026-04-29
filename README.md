<<<<<<< HEAD
# 🤖 Discord Shop Bot

Bot de vendas com pagamento via PIX para Discord. Slash commands, catálogo com paginação, gerenciamento de pedidos e dashboard — tudo integrado ao Supabase.

---

## ✨ Funcionalidades

| Comando | Quem pode usar | Descrição |
|---------|---------------|-----------|
| `/comprar` | Todos | Catálogo de produtos com paginação e botão de compra |
| `/pedidos` | Admins | Lista e gerencia pedidos (confirmar/negar) |
| `/dashboard` | Admins | Resumo de vendas por período e receita |

**Fluxo de compra:**
1. Usuário usa `/comprar` → navega pelo catálogo
2. Clica em **🛒 Comprar** → canal privado é criado
3. Canal contém payload PIX + QR Code gerado automaticamente
4. Admin confirma ou nega em `/pedidos`
5. Usuário recebe notificação no canal privado

---

## 🚀 Configuração Passo a Passo

### 1. Criar o Bot no Discord

1. Acesse [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clique em **New Application** → dê um nome
3. Vá em **Bot** → **Add Bot**
4. Copie o **Token** (guarde com segurança)
5. Em **Privileged Gateway Intents**, ative:
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
6. Vá em **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Manage Channels`, `Send Messages`, `Read Message History`, `View Channels`
7. Copie a URL gerada e convide o bot para seu servidor

### 2. Criar o Banco no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. Vá em **SQL Editor** e cole o conteúdo de `schema.sql`
3. Execute — as tabelas e dados de exemplo serão criados
4. Copie a **Project URL** e a **anon key** em **Settings → API**

### 3. Configurar as Variáveis de Ambiente

Copie o `.env.example` para `.env` e preencha:

```env
# Discord
DISCORD_TOKEN=token_do_bot
DISCORD_CLIENT_ID=id_do_bot          # Aba "General Information"
DISCORD_GUILD_ID=id_do_servidor      # (opcional, para deploy instantâneo)

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=sua_chave_anonima

# PIX — sua chave aleatória (formato UUID gerado pelo app do banco)
PIX_CHAVE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PIX_NOME=Seu Nome Completo
PIX_CIDADE=SuaCidade

# Discord
ADMIN_ROLE_ID=id_do_cargo_administrador
COMPRA_CATEGORY_ID=id_da_categoria_onde_canais_serao_criados
```

**Como obter os IDs:** Ative o Modo Desenvolvedor em Discord → Configurações → Aparência → Clique com botão direito no servidor/cargo/canal → Copiar ID

### 4. Instalar Dependências e Registrar Comandos

```bash
npm install

# Registrar os slash commands (faça isso uma vez)
npm run deploy-commands
```

### 5. Iniciar o Bot

```bash
npm start
```

---

## ☁️ Deploy no DisCloud

1. Instale a [CLI da DisCloud](https://docs.discloudbot.com/cli/inicio)
2. Faça login: `discloud login`
3. **Importante:** certifique-se que o `.env` está no projeto (o DisCloud usa o arquivo real)
4. Crie um arquivo `.zip` com todos os arquivos (exceto `node_modules`)
5. Faça o upload:
   ```bash
   discloud upload
   ```
6. Ou via site: [discloud.app](https://discloud.app) → **Upload App** → selecione o `.zip`

> ⚠️ O `discloud.config` já está configurado com `MEMORY=256` e `MAIN=src/index.js`

---

## 🗃️ Estrutura do Banco de Dados

### `products`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK |
| name | VARCHAR(100) | Nome do produto |
| description | TEXT | Descrição |
| price | NUMERIC | Preço em BRL |
| image_url | TEXT | URL da imagem |
| active | BOOLEAN | Produto ativo |
| created_at | TIMESTAMPTZ | Data de criação |

### `orders`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK |
| user_id | VARCHAR | ID do usuário Discord |
| username | VARCHAR | Tag do usuário |
| product_id | UUID | FK → products |
| product_name | VARCHAR | Nome (snapshot) |
| amount | NUMERIC | Valor pago |
| status | VARCHAR | `pending` / `confirmed` / `denied` |
| channel_id | VARCHAR | ID do canal privado |
| pix_txid | VARCHAR | Identificador da transação PIX |
| confirmed_by | VARCHAR | Admin que confirmou |
| confirmed_at | TIMESTAMPTZ | Quando foi confirmado |
| created_at | TIMESTAMPTZ | Data do pedido |

---

## 💠 Sobre o PIX

O payload PIX é gerado seguindo o padrão **BR Code (EMV)** do Banco Central:
- **Chave aleatória** configurada no `.env`
- **Valor** do produto comprado
- **TXID** = `{USUARIO_DISCORD}{TIMESTAMP_BASE36}` (até 25 chars)
- **CRC16** calculado automaticamente

O payload pode ser lido por qualquer banco usando "Pix Copia e Cola" ou escaneando o QR Code.

---

## 🛠️ Adicionar Produtos

Execute no SQL Editor do Supabase:

```sql
INSERT INTO products (name, description, price, image_url)
VALUES ('Nome do Produto', 'Descrição detalhada', 39.90, 'https://url-da-imagem.com/img.png');
```

Ou crie uma interface admin no Supabase usando a aba **Table Editor**.
=======
# mercury-bot
>>>>>>> 2bd74b26d8caf058933d834a9432db378a67b56e
