import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [
    TerminusModule.forRoot({
      // Grace period before the process is killed after an unhealthy signal
      gracefulShutdownTimeoutMs: 10000,
    }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
