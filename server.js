/**
 * ╔══════════════════════════════════════════╗
 * ║       GOLGAROTH BOLT — BACKEND API       ║
 * ║   API Key aman di server, bukan client   ║
 * ╚══════════════════════════════════════════╝
 * 
 * Setup:
 *   1. npm install
 *   2. Buat file .env dan isi ANTHROPIC_API_KEY=sk-ant-xxxxx
 *   3. node server.js
 *   4. Buka http://localhost:3000
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: '*' }));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ── Rate limiting (100 req / 15 min per IP) ───────────────
const limiter = rateLimit({
  windowMs : 15 * 60 * 1000,
  max      : 100,
  message  : { error: 'Terlalu banyak request. Coba lagi dalam 15 menit.' }
});
app.use('/api/', limiter);

// ── Validasi API Key ada di env ───────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('\n❌ ERROR: ANTHROPIC_API_KEY tidak ditemukan di .env\n');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────
async function callClaude({ model = 'claude-sonnet-4-5', system, messages, max_tokens = 8192, stream = false }) {
  const body = {
    model,
    max_tokens,
    messages,
    ...(system ? { system } : {}),
    ...(stream ? { stream: true } : {})
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method  : 'POST',
    headers : {
      'Content-Type'      : 'application/json',
      'x-api-key'         : ANTHROPIC_API_KEY,          // ← Key ada di BACKEND saja
      'anthropic-version' : '2023-06-01',
    },
    body: JSON.stringify(body)
  });
  return resp;
}

// ══════════════════════════════════════════════════════════
//  ROUTE: Health check
// ══════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({
    status  : 'ok',
    version : '1.0.0',
    name    : 'Golgaroth Bolt API',
    models  : ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    time    : new Date().toISOString()
  });
});

// ══════════════════════════════════════════════════════════
//  ROUTE: Generate / Edit full project  (STREAMING)
//  POST /api/generate
//  Body: { prompt, framework, mode, history }
// ══════════════════════════════════════════════════════════
app.post('/api/generate', async (req, res) => {
  const { prompt, framework = 'html', mode = 'create', history = [], model = 'claude-sonnet-4-5' } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt tidak boleh kosong' });

  const systemPrompt = buildSystemPrompt(framework, mode);

  const messages = [
    ...history.slice(-10),
    { role: 'user', content: prompt }
  ];

  try {
    // Set SSE headers for streaming
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    const upstream = await callClaude({ model, system: systemPrompt, messages, stream: true });

    if (!upstream.ok) {
      const err = await upstream.json();
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.error?.message || 'API Error' })}\n\n`);
      return res.end();
    }

    // Pipe SSE from Anthropic → client
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const ev = JSON.parse(raw);
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify({ type: 'delta', text: ev.delta.text })}\n\n`);
          } else if (ev.type === 'message_stop') {
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          } else if (ev.type === 'message_start') {
            res.write(`data: ${JSON.stringify({ type: 'start', usage: ev.message?.usage })}\n\n`);
          }
        } catch (_) {}
      }
    }
    res.end();

  } catch (err) {
    console.error('Generate error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ══════════════════════════════════════════════════════════
//  ROUTE: Chat (non-streaming, untuk chat panel)
//  POST /api/chat
// ══════════════════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  const { messages, system, model = 'claude-sonnet-4-5', max_tokens = 2048 } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'Messages diperlukan' });

  try {
    const upstream = await callClaude({ model, system, messages, max_tokens });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.error?.message });
    res.json({ content: data.content[0].text, usage: data.usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
//  ROUTE: Explain code
//  POST /api/explain
// ══════════════════════════════════════════════════════════
app.post('/api/explain', async (req, res) => {
  const { code, language = 'auto' } = req.body;
  if (!code) return res.status(400).json({ error: 'Code diperlukan' });

  try {
    const upstream = await callClaude({
      messages: [{
        role: 'user',
        content: `Jelaskan kode ${language} berikut dalam Bahasa Indonesia dengan jelas dan mudah dipahami:\n\`\`\`\n${code}\n\`\`\``
      }],
      max_tokens: 1024
    });
    const data = await upstream.json();
    res.json({ explanation: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
//  ROUTE: Fix / Debug code
//  POST /api/fix
// ══════════════════════════════════════════════════════════
app.post('/api/fix', async (req, res) => {
  const { code, error: errorMsg, language } = req.body;
  try {
    const upstream = await callClaude({
      messages: [{
        role: 'user',
        content: `Perbaiki bug pada kode ${language || ''} berikut${errorMsg ? `. Error: ${errorMsg}` : ''}. Return HANYA kode yang sudah diperbaiki:\n\`\`\`\n${code}\n\`\`\``
      }],
      max_tokens: 4096
    });
    const data = await upstream.json();
    res.json({ fixed: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
//  HELPER: System prompt builder
// ══════════════════════════════════════════════════════════
function buildSystemPrompt(framework, mode) {
  const tech = {
    html      : 'HTML5, CSS3 modern (CSS variables, flexbox, grid, animations), Vanilla JavaScript ES6+',
    react     : 'React 18 dengan hooks, JSX, Tailwind CSS, modern React patterns',
    vue       : 'Vue 3 Composition API, script setup, Tailwind CSS',
    nextjs    : 'Next.js 14 App Router, TypeScript, Tailwind CSS, Server Components',
    svelte    : 'Svelte 4, scoped CSS, Svelte stores',
    tailwind  : 'HTML dengan Tailwind CSS CDN, Alpine.js untuk interaktivitas',
    nodejs    : 'Node.js dengan Express, clean REST API, proper error handling',
    python    : 'Python modern (3.11+), best practices, type hints, docstrings',
  }[framework] || 'HTML5, CSS3, JavaScript';

  const modeInstructions = {
    create: `Buat aplikasi/website BARU yang lengkap dan fungsional.`,
    edit  : `Edit dan perbaiki kode yang diberikan sesuai instruksi.`,
    debug : `Debug dan perbaiki semua error pada kode yang diberikan.`,
    explain: `Jelaskan kode yang diberikan secara detail dan mudah dipahami.`,
  }[mode] || 'Buat kode yang diminta.';

  return `Kamu adalah Golgaroth Bolt — AI code generator tingkat expert seperti Bolt.new.
Stack teknologi: ${tech}
Mode: ${modeInstructions}

ATURAN WAJIB:
1. Selalu buat kode yang LENGKAP, BERFUNGSI, dan SIAP PAKAI (production-ready)
2. Untuk HTML/CSS: satu file lengkap dengan <style> dan <script> inline
3. Desain harus INDAH, MODERN, dan PROFESIONAL — bukan template generik
4. Tambahkan komentar yang berguna di kode
5. Gunakan animasi dan interaktivitas yang smooth
6. Mobile-responsive SELALU
7. Gunakan font Google yang menarik (import via <link>)
8. Jika diminta app/website → buat yang benar-benar WOW dan impressive
9. Gunakan warna yang cohesive dan estetis
10. Sertakan micro-interactions dan UX yang baik

Respond dengan kode yang siap dijalankan. Jika ada beberapa file, gunakan format:
=== FILENAME: namafile.ext ===
[kode disini]
=== END ===`;
}

// ── Serve frontend untuk semua route lain ─────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         GOLGAROTH BOLT v1.0              ║
║   Backend + Frontend AI Code Generator   ║
╠═══════════════════════════════════════════╣
║  Server   : http://localhost:${PORT}          ║
║  API Key  : AMAN di backend (.env)       ║
║  Status   : ✅ Running                   ║
╚═══════════════════════════════════════════╝
  `);
});
