import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AdminTokenGuard } from '../moderation/admin-token.guard';

import { AdminEvalController } from './admin-eval.controller';
import { defaultEvalSuiteRunner, EVAL_SUITE_RUNNER, EvalRunService } from './eval-run.service';
import { EVAL_RUN_MODEL_NAME, evalRunMongooseSchema } from './schemas/eval-run.schema';

/**
 * Стенд оценки качества из `/admin` (план «Админка и главная» §1.3) — асинхронные прогоны
 * `eval_runs`, отчёты в MongoDB, вызов параметризованного `tools/eval` на loopback.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: EVAL_RUN_MODEL_NAME, schema: evalRunMongooseSchema }]),
  ],
  controllers: [AdminEvalController],
  providers: [
    EvalRunService,
    AdminTokenGuard,
    { provide: EVAL_SUITE_RUNNER, useValue: defaultEvalSuiteRunner },
  ],
})
export class EvalModule {}
