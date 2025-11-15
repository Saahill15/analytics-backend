// Ingestion + Reporting server
const express = require('express');
const bodyParser = require('body-parser');
const Redis = require('ioredis');
const { Pool } = require('pg');
const Ajv = require('ajv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
});

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER || 'analytics',
  password: process.env.PGPASSWORD || 'analytics-pass',
  database: process.env.PGDATABASE || 'analytics_db',
});

const app = express();
app.use(helmet());
app.use(bodyParser.json({ limit: '1mb' }));

// small rate limiter to protect endpoint from abuse
const limiter = rateLimit({
  windowMs: 10 * 1000,
  max: 200
});
app.use('/event', limiter);

const ajv = new Ajv({ coerceTypes: true });

const eventSchema = {
  type: 'object',
  properties: {
    site_id: { type: 'string' },
    event_type: { type: 'string' },
    path: { type: 'string' },
    user_id: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' }
  },
  required: ['site_id', 'event_type', 'timestamp'],
  additionalProperties: false
};
const validateEvent = ajv.compile(eventSchema);

const QUEUE_KEY = 'events:queue';

// POST /event: validate then enqueue
app.post('/event', async (req, res) => {
  const event = req.body;
  const valid = validateEvent(event);
  if (!valid) {
    return res.status(400).json({ error: 'invalid_payload', details: validateEvent.errors });
  }

  try {
    await redis.rpush(QUEUE_KEY, JSON.stringify(event));
    // limit queue growth (tune as needed)
    await redis.ltrim(QUEUE_KEY, -1000000, -1);
    return res.status(202).json({ status: 'accepted' });
  } catch (err) {
    console.error('redis error', err);
    return res.status(500).json({ error: 'queue_error' });
  }
});

// GET /stats?site_id=...&date=YYYY-MM-DD
app.get('/stats', async (req, res) => {
  const site_id = req.query.site_id;
  if (!site_id) return res.status(400).json({ error: 'site_id missing' });

  const dateStr = req.query.date;
  const date = dateStr ? new Date(dateStr) : new Date();

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

  try {
    const totalRes = await pool.query(
      `SELECT COUNT(*) AS total FROM events WHERE site_id = $1 AND event_timestamp >= $2 AND event_timestamp <= $3`,
      [site_id, start.toISOString(), end.toISOString()]
    );
    const total_views = Number(totalRes.rows[0].total);

    const uniqueRes = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS unique_users FROM events WHERE site_id = $1 AND event_timestamp >= $2 AND event_timestamp <= $3 AND user_id IS NOT NULL`,
      [site_id, start.toISOString(), end.toISOString()]
    );
    const unique_users = Number(uniqueRes.rows[0].unique_users);

    const topRes = await pool.query(
      `SELECT path, COUNT(*) AS views FROM events WHERE site_id = $1 AND event_timestamp >= $2 AND event_timestamp <= $3 GROUP BY path ORDER BY views DESC LIMIT 10`,
      [site_id, start.toISOString(), end.toISOString()]
    );
    const top_paths = topRes.rows.map(r => ({ path: r.path || "(unknown)", views: Number(r.views) }));

    return res.json({
      site_id,
      date: start.toISOString().slice(0,10),
      total_views,
      unique_users,
      top_paths
    });
  } catch (err) {
    console.error('db error', err);
    return res.status(500).json({ error: 'db_error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server listening on ${PORT}`);
});
