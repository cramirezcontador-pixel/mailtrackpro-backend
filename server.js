// MailTrack Pro — Backend Server v1.1
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

app.post('/register', (req, res) => {
  const { trackingId, userId } = req.body;
  if (!trackingId) return res.status(400).json({ error: 'trackingId requerido' });
  memoryStore[trackingId] = {
    opens: 0, openLog: [], lastOpenAt: null,
    registeredAt: new Date().toISOString(), lastIp: null, userId
  };
  console.log(`[MailTrack] Registrado: ${trackingId}`);
  res.json({ ok: true, trackingId });
});

app.get('/pixel/:userId/:trackingId', (req, res) => {
  const { trackingId } = req.params;
  const cleanId = trackingId.replace('.gif', '');
  const now = new Date();
  const ua = req.headers['user-agent'] || '';
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';

  const isBot = /bot|crawl|preview|prefetch|google|microsoft|yahoo|slurp|scanner|spider|fetch|curl|axios|python|java|ruby|php|antivirus|kaspersky|symantec|barracuda|proofpoint/i.test(ua);
  const noUA = ua.trim() === '';

  if (isBot || noUA) {
    res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
    return res.end(PIXEL_GIF);
  }

  const record = memoryStore[cleanId];

  if (record?.registeredAt) {
    const secondsElapsed = (now - new Date(record.registeredAt)) / 1000;
    if (secondsElapsed < 90) {
      console.log(`[MailTrack] Ignorado precarga ${Math.round(secondsElapsed)}s: ${cleanId}`);
      res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
      return res.end(PIXEL_GIF);
    }
  }

  if (record?.lastIp === clientIp && record?.lastOpenAt) {
    const secondsSinceLast = (now - new Date(record.lastOpenAt)) / 1000;
    if (secondsSinceLast < 10) {
      res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
      return res.end(PIXEL_GIF);
    }
  }

  if (!memoryStore[cleanId]) {
    memoryStore[cleanId] = { opens: 0, openLog: [], lastOpenAt: null, registeredAt: null, lastIp: null };
  }
  memoryStore[cleanId].opens += 1;
  memoryStore[cleanId].openLog.push(now.toISOString());
  memoryStore[cleanId].lastOpenAt = now.toISOString();
  memoryStore[cleanId].lastIp = clientIp;

  console.log(`[MailTrack] Apertura #${memoryStore[cleanId].opens}: ${cleanId}`);

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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tracked: Object.keys(memoryStore).length,
    totalOpens: Object.values(memoryStore).reduce((s, r) => s + (r.opens || 0), 0),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`MailTrack Pro Server v1.1 — Puerto ${PORT}`);
});
