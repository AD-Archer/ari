import { PrismaClient } from '$db';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '$env/dynamic/private';

// reused across hmr reloads so dev doesn't exhaust connections
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
