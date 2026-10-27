import { Module } from '@nestjs/common';
import { AppModule } from './health';
import { GatewayModule } from './gateway/http';

@Module({ imports: [AppModule, GatewayModule] })
export class ServerAppModule {}
