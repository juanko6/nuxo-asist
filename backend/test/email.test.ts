import { describe, expect, it } from 'vitest';
import { sendAbsenceEmail } from '../src/lib/email.js';
import { testConfig } from './helpers.js';

describe('Hardening: envío de email de ausencia (HU-01)', () => {
  it('no envía si el email está deshabilitado', async () => {
    const ok = await sendAbsenceEmail(testConfig(), {
      email: 'ana@empresa.com',
      name: 'Ana',
      date: '2026-06-10',
    });
    expect(ok).toBe(false);
  });

  it('compone y envía el aviso cuando hay transporte', async () => {
    const sent: Record<string, unknown>[] = [];
    const fakeTransport = {
      sendMail: async (m: Record<string, unknown>) => {
        sent.push(m);
        return { messageId: 'test' };
      },
    } as unknown as Parameters<typeof sendAbsenceEmail>[2];

    const ok = await sendAbsenceEmail(
      testConfig({ emailEnabled: true, smtpHost: 'mailpit' }),
      { email: 'ana@empresa.com', name: 'Ana', date: '2026-06-10', justifyUrl: 'https://app/justificar' },
      fakeTransport
    );

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ana@empresa.com');
    expect(String(sent[0]!.subject)).toMatch(/ausencia/i);
    expect(String(sent[0]!.html)).toContain('https://app/justificar');
  });
});
