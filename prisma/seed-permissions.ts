import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { initializePermissions } from '../src/setup/initialize-permissions';
const prisma = new PrismaClient();
prisma
  .$transaction((tx) => initializePermissions(tx), { timeout: 30_000 })
  .then((count) => console.log(`Seeded ${count} permissions.`))
  .catch(() => {
    console.error(
      'Permission seed failed. Check the connection and migrations.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
