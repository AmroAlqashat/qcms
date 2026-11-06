import { config } from 'dotenv';
import { Prisma, PrismaClient, StaffStatus } from '@prisma/client';

export async function seedSettings(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  const defaults = [
    { key: 'centerName', value: 'مركز النور لتحفيظ القرآن الكريم' },
    { key: 'currency', value: 'JOD' },
    { key: 'registrationOpen', value: true },
    { key: 'sessionInactivityTimeoutMinutes', value: 30 },
    { key: 'delegateAccessExpiryHours', value: 24 },
  ] as const;

  let inserted = 0;
  for (const setting of defaults) {
    if (
      await tx.settings.findFirst({
        where: { key: setting.key },
        select: { id: true },
      })
    )
      continue;
    await tx.settings.create({ data: { ...setting, setById: actorId } });
    inserted++;
  }
  return inserted;
}

async function main(prisma: PrismaClient) {
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
      return seedSettings(tx, actor.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  console.log(
    `Created ${count} missing settings. Existing settings were preserved.`,
  );
}

// Setup supplies its transaction; direct CLI execution creates a separate client.
if (require.main === module) {
  config();
  const prisma = new PrismaClient();
  main(prisma)
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
}
