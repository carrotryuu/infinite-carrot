import { AuthRuntime } from './runtime';
import { mockPeople, readAuthConfig } from './config';

async function seed() {
  const config = readAuthConfig();
  if (config.MOCK_EXTERNAL !== '1') throw new Error('Seed is only available in Mock mode');
  const runtime = new AuthRuntime(config);
  try {
    await runtime.start();
    for (const person of mockPeople) {
      await runtime.repository.login({
        unionId: `auth:mock:${person.id}`,
        name: person.name,
        avatarUrl: null,
      });
    }
    console.log(
      'Seven Mock identities are ready. Teams, projects and role assignments remain T04 work.',
    );
  } finally {
    await runtime.close();
  }
}
void seed().catch(() => {
  console.error('Mock seed failed; check infrastructure or disabled demo accounts.');
  process.exitCode = 1;
});
