/**
 * PaymentStateMachine
 *
 * Enforces valid state transitions at the service layer.
 * Any attempt to move to an invalid state throws — the DB never sees
 * an inconsistent status.
 *
 * Valid transitions:
 *
 *   PENDING   → CONFIRMING  (tx detected by listener)
 *   PENDING   → EXPIRED     (expiry job — no tx arrived)
 *   PENDING   → FAILED      (explicit failure, e.g., wallet suspended)
 *   CONFIRMING → COMPLETED  (N confirmations reached)
 *   CONFIRMING → FAILED     (tx reverted or dropped)
 *   COMPLETED  → REFUNDED   (manual or automated refund initiated)
 *
 * Terminal states: COMPLETED, FAILED, REFUNDED, EXPIRED
 */

import { BadRequestException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

type Transition = {
  from: PaymentStatus[];
  to: PaymentStatus;
};

const VALID_TRANSITIONS: Transition[] = [
  { from: ['PENDING'],     to: 'CONFIRMING' },
  { from: ['PENDING'],     to: 'EXPIRED'    },
  { from: ['PENDING'],     to: 'FAILED'     },
  { from: ['CONFIRMING'],  to: 'COMPLETED'  },
  { from: ['CONFIRMING'],  to: 'FAILED'     },
  { from: ['COMPLETED'],   to: 'REFUNDED'   },
];

const TERMINAL_STATES: PaymentStatus[] = ['COMPLETED', 'FAILED', 'REFUNDED', 'EXPIRED'];

export class PaymentStateMachine {
  static assertTransition(from: PaymentStatus, to: PaymentStatus): void {
    if (from === to) return; // no-op, idempotent

    const allowed = VALID_TRANSITIONS.find(
      (t) => t.to === to && t.from.includes(from),
    );

    if (allowed) return;

    if (TERMINAL_STATES.includes(from)) {
      throw new BadRequestException(
        `Payment is in terminal state ${from} — cannot transition to ${to}`,
      );
    }

    throw new BadRequestException(
      `Invalid payment transition: ${from} → ${to}`,
    );
  }

  static isTerminal(status: PaymentStatus): boolean {
    return TERMINAL_STATES.includes(status);
  }

  static canAcceptDeposit(status: PaymentStatus): boolean {
    return status === 'PENDING';
  }
}
