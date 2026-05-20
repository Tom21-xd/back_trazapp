-- Elimina el rol legacy basado en enum. La autorización es 100% por
-- permisos vía AppRole / Permission / RolePermission.

ALTER TABLE "users" DROP COLUMN "role";

DROP TYPE "Role";
