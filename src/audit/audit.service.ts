import { Injectable } from '@nestjs/common';
// Using both to get the TransactionClient and to use the same connection pool the backend uses
import type { Prisma } from '@prisma/client'
import { AuditAction, AuditTarget } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service';

type AuditEventInput = {
  actorId?: string;
  actionType: AuditAction;
  targetType: AuditTarget;
  targetId: string;
  roleName?: string;
  isSuccess: boolean;
}

@Injectable()
export class AuditService {

  constructor(
    private readonly prisma: PrismaService,
  ) { }

  record(tx: Prisma.TransactionClient, event: AuditEventInput) {
    const db = tx ?? this.prisma;

    return db.auditEvent.create({
      data: {
        actorId: event.actorId,
        actionType: event.actionType,
        targetType: event.targetType,
        targetId: event.targetId,
        roleName: event.roleName,
        isSuccess: event.isSuccess
      },
    });
  }

}
