import { Module } from '@nestjs/common';
import { AppModule } from './health';
import { GatewayModule } from './gateway/http';
import { AuthModule } from './auth/http';

@Module({ imports: [AppModule, GatewayModule, AuthModule] })
export class ServerAppModule {}
