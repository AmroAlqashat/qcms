import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { permission } from "process";

@Injectable()
export class PermService{

    constructor(
        private readonly prisma: PrismaService
    ){}

    async getUserPerms(uid: string) {
        const userPerms = await this.prisma.staff.findUnique({
        where: { id: uid },
        select: {
        roleGrants: {
            where: { revokedAt: null },
            select: {
            rolePermission: {
                select: {
                scopeType: true,
                permission: true
                },},},},},});
        return userPerms
    }
}