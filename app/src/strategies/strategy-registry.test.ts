import BaseStrategy from '@/strategies/base.strategy';

class FakeStrategy extends BaseStrategy {}

// The registry module is a singleton, so each test loads a fresh one.
async function loadRegistry(): Promise<(typeof import('./strategy-registry'))['default']> {
  let registry: (typeof import('./strategy-registry'))['default'] | undefined;
  await jest.isolateModulesAsync(async () => {
    registry = (await import('./strategy-registry')).default;
  });
  if (!registry) {
    throw new Error('strategy-registry did not load');
  }
  return registry;
}

describe('StrategyRegistry - getStrategy', () => {
  it('should return the strategy registered under the name', async () => {
    // Arrange
    const registry = await loadRegistry();
    const strategy = new FakeStrategy();
    registry.registerStrategy('mailgun', strategy);

    // Act
    const result = registry.getStrategy('mailgun');

    // Assert
    expect(result).toBe(strategy);
  });

  it('should return the latest strategy when a name is registered twice', async () => {
    const registry = await loadRegistry();
    const replacement = new FakeStrategy();
    registry.registerStrategy('mailgun', new FakeStrategy());
    registry.registerStrategy('mailgun', replacement);

    expect(registry.getStrategy('mailgun')).toBe(replacement);
  });

  it('should throw for a name with no strategy', async () => {
    const registry = await loadRegistry();
    registry.registerStrategy('mailgun', new FakeStrategy());

    expect(() => registry.getStrategy('sendgrid')).toThrow('No strategy registered for name: sendgrid');
  });

  it('should throw when nothing is registered', async () => {
    const registry = await loadRegistry();

    expect(() => registry.getStrategy('mailgun')).toThrow('No strategy registered for name: mailgun');
  });
});
