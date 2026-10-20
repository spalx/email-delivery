import bullDbConnection from './bull.config';

describe('bullDbConnection', () => {
  it('should connect to the Bull database host and port from the config', () => {
    expect(bullDbConnection).toEqual({ host: 'bull-db.invalid', port: 6379 });
  });
});
