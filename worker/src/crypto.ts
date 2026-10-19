// WebCrypto helpers. Runs in Workers and in Node 20+ (tests).

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function toB64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 256-bit random token, base64url. */
export function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomId(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(8)));
}

/** Uniform six-digit code (rejection sampling avoids modulo bias). */
export function randomSixDigits(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return String(v % 1_000_000).padStart(6, '0');
  }
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** HMAC-SHA256 hex. Used for short secrets (pairing codes) so a DB leak alone cannot brute-force them. */
export async function hmacHex(keyMaterial: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

/** Constant-time string compare. Inputs should be equal-length hex digests. */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function aesKey(b64: string): Promise<CryptoKey> {
  const raw = fromB64(b64.trim());
  if (raw.length !== 32) throw new Error('KEY_ENCRYPTION_KEY must be 32 bytes base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM. `aad` binds the ciphertext to its key name so blobs cannot be swapped. */
export async function encrypt(b64Key: string, plaintext: string, aad: string): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, await aesKey(b64Key), enc.encode(plaintext));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function decrypt(b64Key: string, iv: string, ct: string, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: enc.encode(aad) }, await aesKey(b64Key), fromB64(ct));
  return dec.decode(pt);
}
