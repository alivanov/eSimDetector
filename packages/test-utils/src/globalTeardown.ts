import { stopSharedMongoServer } from './mongoServerRegistry';

export default async function globalTeardown(): Promise<void> {
  await stopSharedMongoServer();
}
