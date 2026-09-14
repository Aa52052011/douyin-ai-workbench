import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const PRISMA = Symbol('PRISMA');

/** Same PrismaClient construction as Nest API / worker — never a separate e2e client. */
export function createPrismaClient(datasourceUrl = process.env.DATABASE_URL): PrismaClient {
  const url = datasourceUrl?.trim();
  if (!url) {
    return new PrismaClient();
  }
  return new PrismaClient({ datasourceUrl: url });
}

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
      useFactory: () => createPrismaClient(),
    },
    PrismaShutdown,
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}
