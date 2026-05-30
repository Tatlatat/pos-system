import { Controller, Get } from '@nestjs/common';
import { SkipAuth } from './common/decorators/skip-auth.decorator';

@Controller()
export class AppController {
  @Get('health')
  @SkipAuth()
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
