import BaseStrategy from '@/strategies/base.strategy';

class StrategyRegistry {
  private strategies;

  constructor() {
    this.strategies = new Map();
  }

  registerStrategy(name: string, strategy: BaseStrategy): void {
    this.strategies.set(name, strategy);
  }

  getStrategy(name: string): BaseStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`No strategy registered for name: ${name}`);
    }
    return strategy;
  }
}

export default new StrategyRegistry();
