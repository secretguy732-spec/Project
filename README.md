# ⚡ Golgaroth Bolt — AI Code Generator
> Website seperti Bolt.new dengan API Key AMAN di Backend

```
golgaroth-bolt/
├── backend/
│   ├── server.js          ← Express API server (API Key ada di sini)
│   ├── package.json
│   ├── .env.example       ← Template environment
│   └── .env               ← Buat file ini (jangan di-commit ke Git!)
│
└── frontend/
    └── public/
        └── index.html     ← Frontend (tidak menyimpan API Key)
```

## 🚀 Cara Menjalankan

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Setup API Key (BACKEND ONLY)
```bash
# Copy template
cp .env.example .env

# Edit .env dan masukkan API Key Anda
# Dapatkan di: https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxx
```

### 3. Jalankan Server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

### 4. Buka Browser
```
http://localhost:3000
```

## 🔒 Keamanan API Key

| Lokasi        | Menyimpan API Key? |
|---------------|-------------------|
| `backend/.env` | ✅ Ya (aman di server) |
| `frontend/index.html` | ❌ Tidak pernah |
| Browser / DevTools | ❌ Tidak terekspos |

## 🌐 Deploy ke Production

### Railway / Render / Fly.io
1. Push ke GitHub
2. Connect repo ke platform
3. Set environment variable: `ANTHROPIC_API_KEY=sk-ant-...`
4. Deploy — selesai!

### VPS (Ubuntu/Debian)
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone dan setup
git clone <repo-url>
cd golgaroth-bolt/backend
npm install --production
echo "ANTHROPIC_API_KEY=sk-ant-xxx" > .env

# Run dengan PM2
npm install -g pm2
pm2 start server.js --name golgaroth-bolt
pm2 save
```

## ✨ Fitur
- 💬 Chat AI streaming real-time
- 💻 Code editor dengan syntax highlighting
- 👁 Live preview langsung di browser
- 📁 Multi-file support
- 🔧 Auto fix bugs
- 💡 Explain code
- ⬇ Download kode
- 🔄 Multiple AI models (Opus/Sonnet/Haiku)
- 🔒 API Key 100% aman di backend
