import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'crb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
};

if (!dbConfig.password && process.env.NODE_ENV === 'production') {
  console.error('FATAL: DB_PASSWORD environment variable is required in production.');
  process.exit(1);
}

const adapter = new PrismaPg({
  ...dbConfig,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONN_TIMEOUT) || 5000,
});
const prisma = new PrismaClient({ adapter });

export default prisma;
