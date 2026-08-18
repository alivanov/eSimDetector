import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  SCREEN_SIGNATURE_MODEL_NAME,
  screenSignatureMongooseSchema,
} from '../../catalog/schemas/screen-signature.schema';

import { ScreenSignatureService } from './screen-signature.service';

/**
 * Регистрация модели `screen_signatures` для ветки детекции iOS. Переиспользует Mongoose-схему
 * `CatalogModule` (агент 3) как есть — не изменяет и не дублирует её определение, только
 * подключает ту же схему к отдельной feature-регистрации (Mongoose поддерживает регистрацию
 * одной и той же схемы в нескольких модулях без конфликта).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SCREEN_SIGNATURE_MODEL_NAME, schema: screenSignatureMongooseSchema },
    ]),
  ],
  providers: [ScreenSignatureService],
  exports: [ScreenSignatureService],
})
export class ScreenSignatureModule {}
