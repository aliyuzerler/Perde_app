/**
 * Denetim günlüğü servisi: admin eylemleri (kredi düzeltmesi, içerik
 * yayını vb.) audit_logs tablosuna yazılır (ERD §3.5, F-54).
 * Yazım işlem sahibi transaction içinde yapılabilir (tx geçilerek).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipHash?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeJson: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
        afterJson: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ipHash: entry.ipHash,
      },
    });
  }

  async list(
    page: number,
    pageSize: number,
    filters?: {
      entityType?: string;
      entityId?: string;
      /** FAZ 8: panel filtreleri — eylem, aktör, arama. */
      action?: string;
      actorUserId?: string;
    },
  ) {
    const where = {
      ...(filters?.entityType ? { entityType: filters.entityType } : {}),
      ...(filters?.entityId ? { entityId: filters.entityId } : {}),
      ...(filters?.action ? { action: { contains: filters.action, mode: 'insensitive' as const } } : {}),
      ...(filters?.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }
}
