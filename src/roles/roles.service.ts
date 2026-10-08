import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AuditAction, AuditTarget, Prisma, ScopeType } from '@prisma/client';
import { CreateRoleDto } from './dto/create-role.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) { }

  async createRole(createRoleDto: CreateRoleDto, actorId: string) {
    const { name, description, permissions } = createRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

    // Check if the role name exist or not
    const roleNameExisting = await this.prisma.role.findUnique({
      where: { name: normalizedName }
    });
    if (roleNameExisting) {
      throw new ConflictException({
        message: 'اسم القالب مستخدم بالفعل',
        errors: { name: 'اسم القالب مستخدم بالفعل' },
      });
    }

    // Check for the same (resource, action, scope) submitted twice
    const keys = permissions.map((p) => `${p.resource}:${p.action}:${p.scope}`);
    if (new Set(keys).size !== keys.length) {
      throw new UnprocessableEntityException({
        message: 'صلاحيات مكررة',
        errors: { permissions: 'تم تحديد صلاحية أكثر من مرة' },
      });
    }

    // Each permission must exist in the catalog, and its scope must be allowed
    const rows: { permissionId: string; scopeType: ScopeType }[] = [];

    for (const item of permissions) {
      const perm = await this.prisma.permission.findUnique({
        where: { resource_action: { resource: item.resource, action: item.action } },
      });

      if (!perm) {
        throw new UnprocessableEntityException({
          message: 'صلاحية غير موجودة',
          errors: { permissions: `صلاحية غير موجودة: ${item.resource} / ${item.action}` },
        });
      }

      if (!perm.allowedScopes.includes(item.scope)) {
        throw new UnprocessableEntityException({
          message: 'نطاق غير مسموح',
          errors: { permissions: `النطاق غير مسموح للصلاحية: ${item.resource} / ${item.action}` },
        });
      }

      rows.push({ permissionId: perm.id, scopeType: item.scope });
    }

    // Save the role, its permissions and the audit entry together
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({ data: { name: normalizedName, description } });

        await tx.rolePermission.createMany({
          data: rows.map((row) => ({ ...row, roleId: role.id })),
        });

        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.ROLE_CREATED,
          targetType: AuditTarget.ROLE,
          targetId: role.id,
          isSuccess: true,
        });

        return role;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          message: 'اسم القالب مستخدم بالفعل',
          errors: { name: 'اسم القالب مستخدم بالفعل' },
        });
      }
      throw error;
    }
  }
}
