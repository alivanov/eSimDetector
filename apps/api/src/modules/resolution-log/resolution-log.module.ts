import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RESOLUTION_LOG_MODEL_NAME, resolutionLogMongooseSchema } from './resolution-log.schema';
import { ResolutionLogService } from './resolution-log.service';

/** Журнал резолюций (docs/05-data-model.md, §5.6) — используется `DetectionModule`. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RESOLUTION_LOG_MODEL_NAME, schema: resolutionLogMongooseSchema },
    ]),
  ],
  providers: [ResolutionLogService],
  exports: [ResolutionLogService],
})
export class ResolutionLogModule {}
