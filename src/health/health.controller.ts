import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../auth/decorators/public.decorator';

type Indicator = { status: 'up' | 'down'; message?: string };

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness + dependency health (Postgres, Redis)' })
  async health() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const ok = database.status === 'up' && redis.status === 'up';
    const body = {
      status: ok ? 'ok' : 'error',
      info: { database, redis },
      timestamp: new Date().toISOString(),
    };

    if (!ok) throw new ServiceUnavailableException(body);
    return body;
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  ready() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  private async checkDatabase(): Promise<Indicator> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (err) {
      return { status: 'down', message: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<Indicator> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG'
        ? { status: 'up' }
        : { status: 'down', message: `unexpected reply: ${pong}` };
    } catch (err) {
      return { status: 'down', message: (err as Error).message };
    }
  }
}
