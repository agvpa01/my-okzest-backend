import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';

const { db } = await import('../database/init.js');

after(async () => {
  await db.end();
});

test('handles background PostgreSQL client errors without crashing', () => {
  const error = new Error('Connection terminated unexpectedly');
  error.code = 'ECONNRESET';

  assert.doesNotThrow(() => db.emit('error', error, {}));
  assert.ok(db.listenerCount('error') > 0);
});
