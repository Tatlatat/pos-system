import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns health status', () => {
    const controller = new AppController();

    expect(controller.health()).toEqual(
      expect.objectContaining({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      }),
    );
  });
});
