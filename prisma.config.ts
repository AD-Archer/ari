import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	experimental: {
		externalTables: true
	},
	// ari-webhooks owns this table in the shared database: keep migrate from calling it drift
	tables: {
		external: ['public.ariwmigrations']
	},
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		url: env('DATABASE_URL')
	}
});
