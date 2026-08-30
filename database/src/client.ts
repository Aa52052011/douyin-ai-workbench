import { PrismaClient } from "@prisma/client";

/**
 * Prisma 客户端单例。仅负责连接，不包含认证或业务规则。
 */
export const prisma = new PrismaClient();
