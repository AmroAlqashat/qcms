-- CreateTable
CREATE TABLE "DirectPermissionGrant" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DirectPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectPermissionGrant_staffId_permissionId_scopeType_key" ON "DirectPermissionGrant"("staffId", "permissionId", "scopeType");

-- AddForeignKey
ALTER TABLE "DirectPermissionGrant" ADD CONSTRAINT "DirectPermissionGrant_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPermissionGrant" ADD CONSTRAINT "DirectPermissionGrant_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
