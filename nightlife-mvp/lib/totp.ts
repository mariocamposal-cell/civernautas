/**
 * TOTP de ticket para NOCHE
 * -------------------------------------------------------------
 * · Paso por defecto: 10 s (configurable a 15 s).
 * · 8 dígitos, SHA-1, secreto de 20 bytes (compatible con otpauth).
 * · El cliente NUNCA calcula el código: lo pide a la Edge Function.
 *   Este módulo se ejecuta en el backend (Deno / Node 18+).
 *
 * En React Native no hay `crypto.subtle`; si algún día se necesita
 * verificación offline en el móvil, usar `@noble/hashes` (HMAC-SHA1).
 *
 * La defensa contra replay NO vive aquí: vive en el índice único
 * `scan_events (ticket_id, code_counter) WHERE result = 'ok'`.
 */

export const TOTP_STEP_SECONDS = 10;
export const TOTP_DIGITS = 8;
export const TOTP_VERSION = 'NLV1';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpCode {
  code: string;
  counter: number;
  expiresAt: number; // epoch ms
  secondsRemaining: number;
}

export interface QrPayload {
  version: string;
  ticketId: string;
  counter: number;
  code: string;
}

/* ------------------------------------------------------------------ */
/* Base32 (para secretos compatibles con Google Authenticator)         */
/* ------------------------------------------------------------------ */

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=|\s|-/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = B32.indexOf(char);
    if (idx === -1) throw new Error('BASE32_INVALID');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/* ------------------------------------------------------------------ */
/* HOTP / TOTP                                                         */
/* ------------------------------------------------------------------ */

function counterToBytes(counter: number): Uint8Array {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('COUNTER_INVALID');
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(counter));
  return new Uint8Array(buf);
}

async function hmacSha1(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message as unknown as BufferSource));
}

/** HOTP RFC 4226. Devuelve el código con `digits` dígitos. */
export async function hotp(
  secret: Uint8Array,
  counter: number,
  digits = TOTP_DIGITS,
): Promise<string> {
  const mac = await hmacSha1(secret, counterToBytes(counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function counterAt(atMs: number = Date.now(), step = TOTP_STEP_SECONDS): number {
  return Math.floor(atMs / 1000 / step);
}

/** Código actual + metadatos para que el cliente sepa cuándo refrescar. */
export async function generateTotp(
  secret: Uint8Array,
  atMs: number = Date.now(),
  step = TOTP_STEP_SECONDS,
): Promise<TotpCode> {
  const counter = counterAt(atMs, step);
  const code = await hotp(secret, counter);
  const expiresAt = (counter + 1) * step * 1000;
  return {
    code,
    counter,
    expiresAt,
    secondsRemaining: Math.max(0, Math.ceil((expiresAt - atMs) / 1000)),
  };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifica un código con ventana de ±`window` pasos (tolerancia de reloj).
 * Devuelve el `counter` que coincidió, o `null`.
 *
 * Nota: aceptar el counter anterior permite 1 escaneo tardío; el índice
 * único de `scan_events` impide reutilizarlo.
 */
export async function verifyTotp(
  secret: Uint8Array,
  code: string,
  atMs: number = Date.now(),
  step = TOTP_STEP_SECONDS,
  window = 1,
): Promise<number | null> {
  const normalized = code.replace(/\D/g, '');
  if (normalized.length !== TOTP_DIGITS) return null;

  const current = counterAt(atMs, step);
  for (let delta = -window; delta <= window; delta++) {
    const counter = current + delta;
    if (counter < 0) continue;
    const expected = await hotp(secret, counter);
    if (safeEqual(expected, normalized)) return counter;
  }
  return null;
}

/** Secreto nuevo de 20 bytes (160 bits), como recomienda el RFC. */
export function generateSecret(bytes = 20): Uint8Array {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Payload del QR                                                      */
/* ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildQrPayload(ticketId: string, counter: number, code: string): string {
  if (!UUID_RE.test(ticketId)) throw new Error('TICKET_ID_INVALID');
  if (!/^\d{8}$/.test(code)) throw new Error('CODE_INVALID');
  return `${TOTP_VERSION}|${ticketId}|${counter}|${code}`;
}

export function parseQrPayload(raw: string): QrPayload | null {
  const parts = raw.trim().split('|');
  if (parts.length !== 4) return null;
  const [version, ticketId, counterRaw, code] = parts;
  if (version !== TOTP_VERSION) return null;
  if (!UUID_RE.test(ticketId)) return null;
  if (!/^\d+$/.test(counterRaw)) return null;
  if (!/^\d{8}$/.test(code)) return null;
  const counter = Number(counterRaw);
  if (!Number.isSafeInteger(counter)) return null;
  return { version, ticketId: ticketId.toLowerCase(), counter, code };
}

/* ------------------------------------------------------------------ */
/* Ejemplo de verificación en la Edge Function                         */
/* ------------------------------------------------------------------ */
/*
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const { qr, eventId, deviceId, direction, idempotencyKey } = await req.json();
  const parsed = parseQrPayload(qr);
  if (!parsed) return json({ ok: false, reason: 'malformed' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);

  // El secreto solo lo lee el service role.
  const { data: ticket } = await admin
    .from('tickets').select('id, event_id, totp_secret, status')
    .eq('id', parsed.ticketId).single();
  if (!ticket) return json({ ok: false, reason: 'not_found' }, 404);

  const secret = Uint8Array.from(atob(ticket.totp_secret), c => c.charCodeAt(0));
  const matched = await verifyTotp(secret, parsed.code, Date.now(), 10, 1);
  if (matched === null || matched !== parsed.counter) {
    return json({ ok: false, reason: 'invalid_code' }, 401);
  }

  const { data, error } = await admin.rpc('commit_scan', {
    p_ticket: parsed.ticketId,
    p_event: eventId ?? ticket.event_id,
    p_counter: matched,
    p_direction: direction ?? 'in',
    p_device: deviceId,
    p_idempotency: idempotencyKey,
    p_scanner: null,
  });
  if (error) return json({ ok: false, reason: 'server_error' }, 500);
  return json(data[0]);
});
*/
