import { BrandsController } from './brands.controller';
import type { BrandSummary, DeviceCatalogQueryService } from './device-catalog-query.service';

describe('BrandsController', () => {
  it('делегирует DeviceCatalogQueryService.listBrands (docs/06 §6.4)', () => {
    const brands: readonly BrandSummary[] = [
      { brand: 'apple', brandTitle: 'Apple', deviceCount: 44 },
      { brand: 'samsung', brandTitle: 'Samsung', deviceCount: 120 },
    ];
    const listBrands = jest.fn().mockReturnValue(brands);
    const fake: Pick<DeviceCatalogQueryService, 'listBrands'> = { listBrands };
    const controller = new BrandsController(fake as DeviceCatalogQueryService);

    expect(controller.list()).toBe(brands);
    expect(listBrands).toHaveBeenCalledTimes(1);
  });
});
