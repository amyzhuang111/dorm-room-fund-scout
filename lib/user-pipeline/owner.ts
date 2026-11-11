import { createHash } from 'node:crypto';
/** Only pass the email verified by the server session; never a request-body owner. */
export function pipelineOwnerKey(email: string): string {
  const owner = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(owner)) throw new Error('A verified owner is required');
  return `member:${createHash('sha256').update(owner).digest('hex')}`;
}
