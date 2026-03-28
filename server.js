// MailTrack Pro — Backend Server v1.0 (restaurado)
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const memoryStore = {};

app.use(cors({ origin: '*' }));
app.use(express.json());

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'
);

app.get('/pixel/:userId/:trackingId', (req, res) => {
  const { trackingId } = req.params;
  const cleanId = trackingId.replace('.gif', '');
  const ua = req.headers['user-agent'] || '';

  const isBot = /bot|crawl|preview|prefetch|microsoft|yahoo|slurp|scanner|spider/i.test(ua);

  if (!isBot) {
    const now = new Date().toISOString();
    if (!memoryStore[cleanId]) {
      memoryStore[cleanId] = { opens: 0, openLog: [], lastOpenAt: null };
    }
    memoryStore[cleanId].opens += 1;
    memoryStore[cleanId].openLog.push(now);
    memoryStore[cleanId].lastOpenAt = now;
    console.log(`[MailTrack] Apertura #${memoryStore[cleanId].opens}: ${cleanId}`);
  }

  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL_GIF.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(PIXEL_GIF);
});

app.post('/check', (req, res) => {
  const { trackingIds } = req.body;
  if (!trackingIds?.length) return res.json({ results: {} });
  const results = {};
  trackingIds.forEach(id => {
    const r = memoryStore[id];
    results[id] = r
      ? { opens: r.opens, lastOpenAt: r.lastOpenAt, openLog: r.openLog }
      : { opens: 0, lastOpenAt: null, openLog: [] };
  });
  res.json({ results });
});

app.get('/debug/:trackingId', (req, res) => {
  const { trackingId } = req.params;
  const r = memoryStore[trackingId];
  if (!r) return res.json({ error: 'No encontrado', trackingId });
  res.json({
    trackingId,
    opens: r.opens,
    lastOpenAt: r.lastOpenAt,
    openLog: r.openLog,
    totalEntries: r.openLog?.length || 0
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tracked: Object.keys(memoryStore).length,
    totalOpens: Object.values(memoryStore).reduce((s, r) => s + (r.opens || 0), 0),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`MailTrack Pro Server v1.0 restaurado — Puerto ${PORT}`);
});
