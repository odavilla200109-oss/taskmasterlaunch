# TaskMaster 🗂️

Ferramenta visual de brainstorm e task list com nós conectados.

---

## Estrutura do Projeto

```
taskmaster/
├── frontend/          ← seu projeto Vite + React
│   └── src/
│       ├── main.jsx   ← adicione GoogleOAuthProvider aqui
│       └── App.jsx    ← cole o TaskMaster_App.jsx aqui
│
└── backend/           ← esta pasta
    ├── server.js
    ├── db.js
    ├── routes/
    │   ├── auth.js
    │   └── canvases.js
    ├── middleware/
    │   └── auth.js
    ├── .env.example
    └── package.json
```

---

## Setup em 5 minutos

### 1. Google OAuth

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto → **APIs e Serviços** → **Credenciais**
3. **+ Criar credenciais** → ID do cliente OAuth 2.0 → Aplicativo da Web
4. Origens JS autorizadas: `http://localhost:5173`
5. URIs de redirecionamento: `http://localhost:5173`
6. Copie o **Client ID** gerado

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edite .env com seu GOOGLE_CLIENT_ID e JWT_SECRET
npm install
npm run dev
# → API rodando em http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm create vite@latest . -- --template react
npm install @react-oauth/google
```

Crie um arquivo `.env` na raiz do frontend:
```env
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=SEU_GOOGLE_CLIENT_ID.apps.googleusercontent.com
```

Edite `src/main.jsx`:
```jsx
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <App />
  </GoogleOAuthProvider>
);
```

Cole o conteúdo de `TaskMaster_App.jsx` em `src/App.jsx`.

```bash
npm run dev
# → App rodando em http://localhost:5173
```

---

## Deploy em Produção

### Backend → Railway / Render

```bash
# Railway
npm install -g @railway/cli
railway login
railway new
railway up
# Configure as env vars no dashboard
```

```bash
# Render
# Push para GitHub → New Web Service → selecione o repo
# Build: npm install
# Start: node server.js
# Adicione as variáveis de ambiente no dashboard
```

### Frontend → Vercel

```bash
npm install -g vercel
vercel --prod
# Configure VITE_API_URL com a URL do seu backend em produção
```

**Lembre de atualizar no Google Console:**
- Origens JS autorizadas: `https://seuapp.vercel.app`
- `ALLOWED_ORIGINS` no backend: `https://seuapp.vercel.app`

---

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/google` | Login com Google ID Token |
| GET | `/api/auth/me` | Dados do usuário autenticado |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/canvases` | Lista canvases do usuário |
| POST | `/api/canvases` | Cria novo canvas |
| DELETE | `/api/canvases/:id` | Exclui canvas |
| GET | `/api/canvases/:id/nodes` | Carrega nós do canvas |
| PUT | `/api/canvases/:id/nodes` | Salva/sincroniza todos os nós |
| GET | `/health` | Health check |

---

## Migração para Postgres (produção)

Instale o driver:
```bash
npm install pg
npm uninstall better-sqlite3
```

Atualize `db.js` para usar `pg` com as mesmas queries (troque `?` por `$1, $2...`).
Adicione `DATABASE_URL` no `.env`.

---

## Stack

- **Frontend**: React + Vite + @react-oauth/google
- **Backend**: Node.js + Express
- **Auth**: Google OAuth 2.0 + JWT
- **DB**: SQLite (dev) → Postgres (produção)
- **Deploy**: Vercel (front) + Railway/Render (back)
