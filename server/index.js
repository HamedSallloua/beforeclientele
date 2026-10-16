import './config/env.js';
import { app, ensureUploadsDir, env } from './app.js';
import { verifyConnection, pool } from './db/pool.js';
import { runExchangesMigration } from './db/migrations/add_exchanges.js';
import { runRefundsMigration } from './db/migrations/add_refunds.js';
import { runAnnouncementsMigration } from './db/migrations/add_announcements.js';
import { runFavouritesVariantMigration } from './db/migrations/add_favourites_variant.js';
import { runIdempotencyKeysMigration } from './db/migrations/add_idempotency_keys.js';
import { runNotificationsMigration } from './db/migrations/add_notifications.js';
import { runRemoveOrderSourceMigration } from './db/migrations/remove_order_source.js';
import { runProductVideosMigration } from './db/migrations/add_product_videos.js';
import { runHeroConfigMigration } from './db/migrations/add_hero_config.js';

async function start() {
  await ensureUploadsDir();
  await verifyConnection();
  await runExchangesMigration(pool);
  await runRefundsMigration(pool);
  await runAnnouncementsMigration(pool);
  await runHeroConfigMigration(pool);
  await runFavouritesVariantMigration(pool);
  await runIdempotencyKeysMigration(pool);
  await runNotificationsMigration(pool);
  await runRemoveOrderSourceMigration(pool);
  await runProductVideosMigration(pool);

  app.listen(env.port, () => {
    console.log(`Silky API running on http://localhost:${env.port}`);
    console.log(`Admin email: ${env.adminEmail} (seed with npm run db:seed)`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
