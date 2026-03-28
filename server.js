// MailTrack Pro — Backend Server
// Sirve el píxel de rastreo y registra aperturas
// Deploy gratuito en Render.com o Railway.app

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Base de datos: Supabase (gratis hasta 500MB) ────────────────────────────
// Alternativa 100% en memoria para pruebas locales si no tiene Supabase
const USE_MEMORY = !process.env.SUPABASE_URL;
const memoryStore = {}; // { trackingId: { opens: 0, openLog: [], lastOpenAt: null } }

let supabase = null;
if (!USE_MEMORY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

app.use(cors({ origin: '*' }));
app.use(express.json());

// ── GIF de 1x1 pixel transparente (base64) ─────────────────────────────────
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'
);

// ── Ruta del píxel de rastreo ───────────────────────────────────────────────
// GET /pixel/:userId/:trackingId.gif
app.get('/pixel/:userId/:trackingId', async (req, res) => {
  const { userId, trackingId } = req.params;
  const cleanId = trackingId.replace('.gif', '');

  // Ignorar bots y previsualizadores de correo
  const ua = req.headers['user-agent'] || '';
  const isBot = /bot|crawl|preview|prefetch|google|microsoft|yahoo|slurp/i.test(ua);

  if (!isBot) {
    const openEvent = {
      trackingId: cleanId,
      userId,
      openedAt: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: ua
    };

    if (USE_MEMORY) {
      if (!memoryStore[cleanId]) {
        memoryStore[cleanId] = { opens: 0, openLog: [], lastOpenAt: null };
      }
      memoryStore[cleanId].opens += 1;
      memoryStore[cleanId].openLog.push(openEvent.openedAt);
      memoryStore[cleanId].lastOpenAt = openEvent.openedAt;
    } else {
      // Guardar en Supabase
      await supabase.from('open_events').insert([openEvent]);
    }
  }

  // Responder con el píxel transparente
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL_GIF.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(PIXEL_GIF);
});

// ── Consultar aperturas (llamado por la extensión) ──────────────────────────
// POST /check  { userId, trackingIds: [] }
app.post('/check', async (req, res) => {
  const { userId, trackingIds } = req.body;

  if (!trackingIds || !trackingIds.length) {
    return res.json({ results: {} });
  }

  const results = {};

  if (USE_MEMORY) {
    trackingIds.forEach(id => {
      const record = memoryStore[id];
      results[id] = record
        ? { opens: record.opens, lastOpenAt: record.lastOpenAt, openLog: record.openLog }
        : { opens: 0, lastOpenAt: null, openLog: [] };
    });
  } else {
    // Consultar Supabase agrupando por trackingId
    const { data, error } = await supabase
      .from('open_events')
      .select('trackingId, openedAt')
      .in('trackingId', trackingIds)
      .eq('userId', userId)
      .order('openedAt', { ascending: true });

    if (!error && data) {
      trackingIds.forEach(id => {
        const events = data.filter(e => e.trackingId === id);
        results[id] = {
          opens: events.length,
          lastOpenAt: events.length ? events[events.length - 1].openedAt : null,
          openLog: events.map(e => e.openedAt)
        };
      });
    }
  }

  res.json({ results });
});

// ── Estado del servidor ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: USE_MEMORY ? 'memory' : 'supabase',
    tracked: Object.keys(memoryStore).length,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`MailTrack Pro Server — Puerto ${PORT} — Modo: ${USE_MEMORY ? 'Memoria local' : 'Supabase'}`);
});
