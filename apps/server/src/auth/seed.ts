import { AuthRuntime } from './runtime';
import { readAuthConfig } from './config';
import { seedOrganization } from '../organization/seed';

async function seed() {
  const config = readAuthConfig();
  if (config.MOCK_EXTERNAL !== '1') throw new Error('Seed is only available in Mock mode');
  const runtime = new AuthRuntime(config);
  try {
    await runtime.start();
    await seedOrganization(runtime);
    console.log(
      'Two teams, three projects and seven role identities are ready. Existing assignments are preserved.',
    );
  } finally {
    await runtime.close();
  }
}
void seed().catch(() => {
  console.error('Mock seed failed; check infrastructure or disabled demo accounts.');
  process.exitCode = 1;
});
