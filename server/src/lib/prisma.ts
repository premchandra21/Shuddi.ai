import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// 1. Extend global type for Singleton
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 2. Create the instance (reusing if exists)
export const prisma =
  globalForPrisma.prisma ||
  (() => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // Required for Supabase SSL connections
      },
      max: 10, // Recommended cap per instance to prevent pooler exhaustion
    });

    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  })();

// 3. Save to global in development (prevents multiple pools on hot reload)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;