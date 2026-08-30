import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const PRISMA = Symbol('PRISMA');

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useFactory: () =>
        new PrismaClient({
          datasources: process.env.DATABASE_URL
            ? { db: { url: process.env.DATABASE_URL } }
            : undefined,
        }),
    },
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}
