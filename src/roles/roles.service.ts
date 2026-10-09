import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AuditAction, AuditTarget, Prisma, ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateNewRoleDto } from './dto/create-new-role.dto';
import { EditRoleDto } from './dto/edit-role.dto';
import { InputRoleDto } from './dto/input-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) { }

  async createRole(createNewRoleDto: CreateNewRoleDto, actorId: string) {
    //validate
    const rows = await this.validateRoleValues(createNewRoleDto, actorId);

    // Save the role, its permissions and the audit entry together
    return await this.implNewRole(rows, createNewRoleDto, actorId);
  }

  async editRole(roleId: string, editRoleDto: EditRoleDto, actorId: string) {
    //validation
    //TODO: validate if user is allowed to edit this role and/or roles in general
    //validate if old role exists
    const oldRoleExists = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!oldRoleExists)
      throw new ConflictException({
        message: 'هاذ القالب غير موجود',
        errors: { name: 'هاذ القالب غير موجود' }
      });
    //validate the provided values of the role
    const rows = await this.validateRoleValues(editRoleDto, actorId)
    //implmentation
    //edit the role and audit this change
    return await this.implEditRole(rows, editRoleDto, actorId, roleId);
  }

  private async validateRoleValues(dto: InputRoleDto, actorId: string) {
    const { name, description, permissions } = dto;
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

    return rows;
  }

  private async implNewRole(rows: any, createNewRoleDto: CreateNewRoleDto, actorId: string) {

    const { name, description, permissions } = createNewRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

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

  private async implEditRole(rows: any, editRoleDto: EditRoleDto, actorId: string, roleId: string) {
    const { name, description, permissions } = editRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.update({ where: { id: roleId }, data: { name: normalizedName, description } });

        await tx.rolePermission.createMany({
          data: rows.map((row) => ({ ...row, roleId: role.id })),
        });

        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.ROLE_UPDATED,
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
