import 'dotenv/config';
import { Prisma, PrismaClient, StaffStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ACTOR_EMAIL?.trim().toLowerCase();
  if (!email)
    throw new Error(
      'Set SEED_ACTOR_EMAIL to the admin email used by admin:create.',
    );

  const defaults = [
    { key: 'centerName', value: 'مركز النور لتحفيظ القرآن الكريم' },
    { key: 'currency', value: 'JOD' },
    { key: 'registrationOpen', value: true },
    { key: 'sessionInactivityTimeoutMinutes', value: 30 },
    { key: 'delegateAccessExpiryHours', value: 24 },
  ] as const;

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
          'No active account found for SEED_ACTOR_EMAIL. Run admin:create first.',
        );
      let inserted = 0;
      for (const setting of defaults) {
        const existing = await tx.settings.findFirst({
          where: { key: setting.key },
          select: { id: true },
        });
        if (existing) continue;
        await tx.settings.create({ data: { ...setting, setById: actor.id } });
        inserted++;
      }
      return inserted;
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
