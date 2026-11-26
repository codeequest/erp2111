import { testDatabaseUrl } from './test-db';

// Set before AppModule loads; ConfigModule never overrides existing variables.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.MAIL_TRANSPORT = 'outbox';
process.env.SEED_ADMIN_EMAIL = 'e2e-admin@erp.test';
process.env.SEED_ADMIN_PASSWORD = 'E2e-Admin-Strong-Pass-1';
