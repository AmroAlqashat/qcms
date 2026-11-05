import { Prisma } from '@prisma/client';

export async function initializeSettings(
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
