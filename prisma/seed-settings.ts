import { initializeSettings } from '../src/setup/initialize-settings';
import 'dotenv/config';
import { Prisma, PrismaClient, StaffStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ACTOR_EMAIL?.trim().toLowerCase();
  if (!email)
    throw new Error(
      'Set SEED_ACTOR_EMAIL to an active, non-deleted staff account email.',
    );

  const count = await prisma.$transaction(
    async (tx) => {
      const actor = await tx.staffMembers.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          status: StaffStatus.ACTIVE,
          isDeleted: false,
          mustChangePassword: false,
        },
        select: { id: true },
      });
      if (!actor)
        throw new Error(
          'No active account found for SEED_ACTOR_EMAIL. Check the configured email.',
        );
      return initializeSettings(tx, actor.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  console.log(
    `Created ${count} missing settings. Existing settings were preserved.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error && error.constructor === Error
        ? error.message
        : 'Settings seed failed. Check the database connection and migrations.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
