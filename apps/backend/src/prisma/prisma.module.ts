import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const PRISMA = Symbol('PRISMA');

@Injectable()
class PrismaShutdown implements OnModuleDestroy {
  constructor(private readonly prisma: PrismaClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

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
    PrismaShutdown,
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}
