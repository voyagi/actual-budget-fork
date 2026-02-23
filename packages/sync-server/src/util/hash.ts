import crypto from 'crypto';

export async function sha256String(str: string): Promise<string> {
  return crypto.createHash('sha256').update(str).digest('base64');
}
