import assert from 'node:assert/strict';
import {
  base32Decode,
  base32Encode,
  buildQrPayload,
  generateSecret,
  generateTotp,
  hotp,
  parseQrPayload,
  verifyTotp,
} from './totp.ts';

// Vectores oficiales del RFC 6238 (SHA-1, 8 dígitos).
// https://datatracker.ietf.org/doc/html/rfc6238#appendix-B
const secret = new TextEncoder().encode('12345678901234567890');
const vectors: Array<[number, number, string]> = [
  [59, 1, '94287082'],
  [1111111109, 37037036, '07081804'],
  [1111111111, 37037037, '14050471'],
  [1234567890, 41152263, '89005924'],
  [2000000000, 66666666, '69279037'],
  [20000000000, 666666666, '65353130'],
];

for (const [t, counter, expected] of vectors) {
  assert.equal(await hotp(secret, counter, 8), expected, `RFC 6238 T=${t}`);
}
console.log(`✓ ${vectors.length} vectores RFC 6238`);

const now = await generateTotp(secret, 59_500, 30);
assert.equal(now.code, '94287082');
assert.equal(now.counter, 1);
assert.equal(now.expiresAt, 60_000);
assert.equal(now.secondsRemaining, 1);
assert.equal(await verifyTotp(secret, now.code, 59_500, 30, 1), 1);
assert.equal(await verifyTotp(secret, now.code, 200_000, 30, 1), null);
console.log('✓ generación, expiración y ventana de reloj');

const b32 = base32Encode(secret);
assert.deepEqual(base32Decode(b32), secret);
console.log(`✓ base32 roundtrip (${b32})`);

const ticketId = '12121212-1212-1212-1212-121212121212';
const payload = buildQrPayload(ticketId, now.counter, now.code);
const parsed = parseQrPayload(payload);
assert.ok(parsed);
assert.equal(parsed.ticketId, ticketId);
assert.equal(parsed.counter, now.counter);
assert.equal(parseQrPayload('NLV2|mal'), null);
assert.equal(parseQrPayload(payload.replace('NLV1', 'NLV2')), null);
console.log(`✓ payload QR (${payload})`);

assert.equal(generateSecret().length, 20);
console.log('✓ secreto de 20 bytes');
console.log('\nTodo OK. Para ver el QR rotando: npm run demo:totp');
