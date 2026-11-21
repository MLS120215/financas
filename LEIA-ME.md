# Finanças: app pessoal

App instalável (PWA) para controlar renda, gastos, metas e patrimônio, mês a mês e ano a ano.
Funciona sem internet e pode sincronizar entre celular e computador pelo seu próprio Supabase.

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `index.html`, `app.js` | O app |
| `manifest.webmanifest`, `sw.js` | Permitem instalar o app e usá-lo sem internet |
| `icons/` | Ícone do app (`icon.svg` é o original editável) |
| `supabase.sql` | Script que cria a tabela de sincronização |

**Importante:** o arquivo `financas-backup-2026.json` (seus dados) **não** deve ir para o GitHub. O repositório do GitHub Pages é público. Os dados entram pelo app (Ajustes → Importar backup) e ficam só no seu aparelho e no seu Supabase.

## 1. Publicar no GitHub Pages (uma vez)

1. Entre em github.com e crie um repositório novo chamado `financas` (público, sem README).
2. Na página do repositório, clique em **Add file → Upload files**, arraste **o conteúdo** desta pasta (incluindo a pasta `icons`) e clique em **Commit changes**.
3. Vá em **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/(root)** e clique em **Save**.
4. Em 1 ou 2 minutos o app estará em `https://SEU-USUARIO.github.io/financas/`.

## 2. Criar o Supabase (uma vez)

1. Crie uma conta grátis em supabase.com e um projeto novo (escolha a região São Paulo).
2. Abra **SQL Editor → New query**, cole o conteúdo de `supabase.sql` e clique em **Run**.
3. Em **Authentication → URL Configuration**, coloque o endereço do app (`https://SEU-USUARIO.github.io/financas/`) em *Site URL*. Assim o link do e-mail de confirmação abre o app.
   - Opcional: em **Authentication → Sign In / Providers → Email**, desligue *Confirm email* se não quiser confirmar por e-mail.
4. Em **Project Settings → API**, copie o **Project URL** e a chave **anon public**.

## 3. Primeiro uso

1. Abra o app no computador e vá em **Ajustes → Sincronização**.
2. Cole o endereço e a chave, digite seu e-mail e uma senha e toque em **Criar conta** (depois, **Entrar**).
3. Em **Ajustes → Backup → Importar backup**, escolha `financas-backup-2026.json`. Os dados sobem para a nuvem sozinhos.
4. No celular, abra o mesmo endereço, instale o app e entre com o mesmo e-mail e senha. Os dados descem sozinhos.

## 4. Instalar

- **iPhone:** abra no Safari → Compartilhar → **Adicionar à Tela de Início**.
- **Android:** abra no Chrome → menu ⋮ → **Instalar app**.
- **Computador:** no Chrome ou Edge, clique no ícone de instalar na barra de endereço (ou em Ajustes → Instalar agora).

## Personalizar

- No próprio app, em **Ajustes**: seu nome, cor, tema claro ou escuro, categorias e esconder valores.
- Para trocar o nome que aparece embaixo do ícone, edite `name` e `short_name` em `manifest.webmanifest` e `apple-mobile-web-app-title` em `index.html`.
- Para trocar o ícone, substitua os PNGs da pasta `icons` mantendo os nomes e tamanhos.
- Depois de qualquer mudança nos arquivos, aumente a versão em `sw.js` (`financas-v1` → `financas-v2`) para os aparelhos baixarem a versão nova.

## Segurança

- A chave **anon** pode ficar no app sem problema: o banco só entrega dados para quem entra com seu e-mail e senha (regras do `supabase.sql`).
- Nunca use a chave **service_role** no app.
- Faça um backup de vez em quando em Ajustes → Exportar backup.
