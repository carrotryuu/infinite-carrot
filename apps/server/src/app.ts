import { Module } from '@nestjs/common';
import { AppModule } from './health';
import { GatewayModule } from './gateway/http';
import { AuthModule } from './auth/http';
import { OrganizationModule } from './organization/http';

@Module({ imports: [AppModule, GatewayModule, AuthModule, OrganizationModule] })
export class ServerAppModule {}
