import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AppConfigModule } from './config/config.module';
import type { EnvConfig } from './config/env.schema';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DetectionModule } from './modules/detection/detection.module';
import { HealthModule } from './modules/health/health.module';
import { MatchingModule } from './modules/matching/matching.module';

@Module({
  imports: [
    AppConfigModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        uri: configService.get('MONGODB_URI', { infer: true }),
      }),
    }),
    CatalogModule,
    DetectionModule,
    MatchingModule,
    HealthModule,
  ],
})
export class AppModule {}
