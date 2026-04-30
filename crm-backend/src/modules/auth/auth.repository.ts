import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { randomBytes, createHash } from 'crypto';
import { addHours } from 'date-fns';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.user.findFirst({
        where: { email },
        include: { tenant: true },
      }),
    );
  }

  /** Scoped lookup: finds user matching BOTH email and tenant. Used during login. */
  async findByEmailAndTenant(email: string, tenantId: string) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.user.findFirst({
        where: { email, tenantId },
        include: { tenant: true },
      }),
    );
  }

  async findById(id: string) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.user.findUnique({ where: { id } }),
    );
  }

  async findTenantBySlug(slug: string) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.tenant.findUnique({ where: { slug } }),
    );
  }

  // ── Per-session Refresh Token Methods ──────────────────────────────────────

  async createRefreshSession(
    userId: string,
    tenantId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.refreshSession.create({
        data: { userId, tenantId, tokenHash, expiresAt },
      }),
    );
  }

  /**
   * Atomically finds a refresh session by SHA-256 token hash and deletes it
   * (rotation — caller must issue a new token). Returns the owning user, or
   * null if no session matched (reuse-detection signal to caller).
   */
  async consumeRefreshSession(tokenHash: string) {
    return this.prisma.withoutTenantScope(async () => {
      const session = await this.prisma.refreshSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!session) return null;
      await this.prisma.refreshSession.delete({ where: { tokenHash } });
      return session.user;
    });
  }

  /** Deletes only the single session identified by its SHA-256 token hash. */
  async deleteRefreshSession(tokenHash: string) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.refreshSession.deleteMany({ where: { tokenHash } }),
    );
  }

  async deleteAllRefreshSessions(userId: string) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.refreshSession.deleteMany({ where: { userId } }),
    );
  }

  // ── Other Auth Methods ─────────────────────────────────────────────────────

  async updateLastLogin(userId: string) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      }),
    );
  }

  /**
   * Updates only the passwordHash field. Does NOT touch settings so other
   * user preferences (theme, flags, etc.) are never wiped.
   */
  async updatePassword(userId: string, passwordHash: string) {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
    );
  }

  async createPasswordResetToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    // Store SHA-256 hash — raw token is never persisted
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = addHours(new Date(), 1);

    await this.prisma.withoutTenantScope(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: {
          settings: {
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: expiresAt.toISOString(),
          },
        },
      }),
    );

    return token;
  }

  /**
   * Atomically validates the reset token AND updates the password in a single
   * UPDATE … WHERE … RETURNING statement. Prevents race conditions where two
   * concurrent requests both pass the token-validity check before either clears
   * the token.
   *
   * Returns { id } of the updated user, or null if the token was invalid/expired.
   */
  async resetPasswordAtomic(
    rawToken: string,
    passwordHash: string,
  ): Promise<{ id: string } | null> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE users
      SET    "passwordHash" = ${passwordHash},
             settings       = settings - 'passwordResetTokenHash' - 'passwordResetExpires'
      WHERE  settings->>'passwordResetTokenHash' = ${tokenHash}
        AND  (settings->>'passwordResetExpires')::timestamptz > NOW()
      RETURNING id
    `;

    return rows[0] ?? null;
  }
}
