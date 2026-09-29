import bcrypt from 'bcryptjs';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'crb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Admin@123',
});
const prisma = new PrismaClient({ adapter });

const passwords: Record<string, string> = {
  'sarah.jenkins': 'Welcome@123',
  'reception': 'Welcome@123',
  'it.support': 'Welcome@123',
  'admin': 'Admin@123',
};

const ROUNDS = 12;

for (const [domainId, pw] of Object.entries(passwords)) {
  const hash = await bcrypt.hash(pw, ROUNDS);
  const user = await prisma.user.findUnique({ where: { domainId } });
  if (user) {
    await prisma.user.update({ where: { domainId }, data: { passwordHash: hash } });
    console.log('Updated:', domainId);
  } else {
    console.log('Skipped (not found):', domainId);
  }
}
console.log('Done - all passwords hashed');
await prisma.$disconnect();
