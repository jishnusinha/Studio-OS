/**
 * C2PA-lite claim signing / verification using Node crypto (RSA-SHA256).
 * Dev-friendly; swap for full C2PA SDK later without changing call sites.
 */

import {
  createHash,
  createSign,
  createVerify,
  generateKeyPairSync,
  type KeyPairSyncResult,
} from 'node:crypto';

export interface C2paKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateDevKeyPair(): C2paKeyPair {
  const pair: KeyPairSyncResult<string, string> = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: pair.publicKey, privateKeyPem: pair.privateKey };
}

export function hashClaimPayload(claim: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(claim)).digest('hex');
}

/** Sign a C2PA-lite claim JSON with RSA-SHA256 → base64 signature. */
export function signC2paClaim(
  claim: Record<string, unknown>,
  privateKeyPem: string,
): string {
  const signer = createSign('RSA-SHA256');
  signer.update(JSON.stringify(claim));
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

/** Verify a C2PA-lite claim signature. */
export function verifyC2paClaim(
  claim: Record<string, unknown>,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  const verifier = createVerify('RSA-SHA256');
  verifier.update(JSON.stringify(claim));
  verifier.end();
  return verifier.verify(publicKeyPem, signatureBase64, 'base64');
}

export function buildC2paLiteClaim(input: {
  assetId: string;
  projectId?: string;
  title?: string;
  action?: string;
  modelId?: string;
  prompt?: string;
  parameters?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    claim_generator: 'StudioOS/dev',
    title: input.title ?? input.assetId,
    format: 'c2pa-lite',
    assetId: input.assetId,
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [
            {
              action: input.action ?? 'c2pa.created',
              softwareAgent: 'StudioOS',
              modelId: input.modelId,
              prompt: input.prompt,
              parameters: input.parameters ?? {},
            },
          ],
        },
      },
    ],
    hash: createHash('sha256').update(`${input.assetId}:${input.title ?? ''}`).digest('hex'),
  };
}
