import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service';

function createService(prisma: { $queryRaw: unknown }): HealthService {
  // Birim test: gerçek DI gerekmez; service doğrudan kurulur.
  return new HealthService(prisma as never);
}

describe('HealthService.databaseCheck', () => {
  it('SELECT 1 başarılıysa status=up ve latency döner', async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = createService({ $queryRaw });

    const result = await service.databaseCheck();

    expect(result.status).toBe('up');
    expect(result.error).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('DB erişilemezse status=down + hata mesajı döner; ATMAZ (503 için)', async () => {
    const $queryRaw = vi
      .fn()
      .mockRejectedValue(new Error("Can't reach database server"));
    const service = createService({ $queryRaw });

    const result = await service.databaseCheck();

    expect(result.status).toBe('down');
    expect(result.error).toContain("Can't reach database server");
  });
});
