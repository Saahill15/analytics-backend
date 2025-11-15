// Background processor: pop events from Redis and insert to Postgres
const Redis = require('ioredis');
const { Pool } = require('pg');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  maxRetriesPerRequest: null
});

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER || 'analytics',
  password: process.env.PGPASSWORD || 'analytics-pass',
  database: process.env.PGDATABASE || 'analytics_db',
});

const QUEUE_KEY = 'events:queue';

async function processLoop() {
  console.log('Worker started, waiting for events...');
  while (true) {
    try {
      const result = await redis.brpop(QUEUE_KEY, 5);
      if (!result) continue;
      const item = result[1];
      let event;
      try {
        event = JSON.parse(item);
      } catch (err) {
        console.error('invalid json in queue', err);
        continue;
      }

      const ts = new Date(event.timestamp);
      const site_id = event.site_id;
      const event_type = event.event_type;
      const path = event.path || null;
      const user_id = event.user_id || null;

      try {
        await pool.query(
          `INSERT INTO events (site_id, event_type, path, user_id, event_timestamp) VALUES ($1, $2, $3, $4, $5)`,
          [site_id, event_type, path, user_id, ts.toISOString()]
        );
      } catch (err) {
        console.error('db insert failed, requeueing...', err);
        await redis.lpush(QUEUE_KEY, JSON.stringify(event));
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error('unexpected worker error', err);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

processLoop().catch(err => {
  console.error('worker crashed', err);
  process.exit(1);
});
