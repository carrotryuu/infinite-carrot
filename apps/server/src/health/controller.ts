import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService } from './service';
// Infrastructure-only public endpoint; contains no paths, credentials or business data.
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}
  @Get()
  async check() {
    const report = await this.health.check();
    if (report.status === 'down') throw new ServiceUnavailableException(report);
    return report;
  }
}
