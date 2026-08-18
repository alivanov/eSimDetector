import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import {
  CATALOG_OVERRIDE_MODEL_NAME,
  catalogOverrideMongooseSchema,
} from './schemas/catalog-override.schema';
import { DEVICE_MODEL_NAME, deviceMongooseSchema } from './schemas/device.schema';
import {
  SCREEN_SIGNATURE_MODEL_NAME,
  screenSignatureMongooseSchema,
} from './schemas/screen-signature.schema';

/**
 * Единственная точка доступа к справочнику устройств (.cursor/rules/api-boundaries.mdc).
 * `screen_signatures` зарегистрирована здесь же (модель понадобится агенту 5 для резолюции
 * ветки iOS, docs/05 §5.5), хотя `CatalogService` этого агента её ещё не читает — коллекция
 * пока пуста (её наполняет `tools/seed rebuild-signatures`, агент 4).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DEVICE_MODEL_NAME, schema: deviceMongooseSchema },
      { name: SCREEN_SIGNATURE_MODEL_NAME, schema: screenSignatureMongooseSchema },
      { name: CATALOG_OVERRIDE_MODEL_NAME, schema: catalogOverrideMongooseSchema },
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
