/**
 * Demo de terminal: muestra un QR de ticket que rota cada 10 s.
 *
 *   npm run demo:totp
 *
 * · Imprime el QR y una cuenta atrás.
 * · Al llegar a 0, el payload cambia y el anterior deja de ser válido.
 * · Sirve para enseñar el concepto anti-captura sin levantar la app.
 */

import qrcode from 'qrcode-terminal';
import {
  TOTP_STEP_SECONDS,
  base32Decode,
  base32Encode,
  buildQrPayload,
  generateSecret,
  generateTotp,
} from '../lib/totp.ts';

const ticketId = process.env.TICKET_ID ?? '12121212-1212-1212-1212-121212121212';
const secret = process.env.TICKET_SECRET
  ? base32Decode(process.env.TICKET_SECRET)
  : generateSecret();

let lastCounter = -1;
let qrArt = '';
let payload = '';

function progress(secondsLeft: number): string {
  const total = TOTP_STEP_SECONDS;
  const filled = Math.max(0, Math.min(total, Math.round((secondsLeft / total) * total)));
  return `[${'█'.repeat(filled)}${'░'.repeat(total - filled)}] ${secondsLeft}s`;
}

async function render(): Promise<void> {
  const totp = await generateTotp(secret);

  if (totp.counter !== lastCounter) {
    lastCounter = totp.counter;
    payload = buildQrPayload(ticketId, totp.counter, totp.code);
    qrArt = await new Promise<string>((resolve) => {
      qrcode.generate(payload, { small: true }, resolve);
    });
  }

  const expires = new Date(totp.expiresAt).toLocaleTimeString('es-ES');
  process.stdout.write('\x1b[2J\x1b[H');
  process.stdout.write('\n  NOCHE · ticket TOTP (demo de terminal)\n');
  process.stdout.write('  ────────────────────────────────────────\n\n');
  process.stdout.write(qrArt + '\n');
  process.stdout.write(`  ${progress(totp.secondsRemaining)}\n\n`);
  process.stdout.write(`  ticket     ${ticketId}\n`);
  process.stdout.write(`  counter    ${totp.counter}\n`);
  process.stdout.write(`  caduca     ${expires}\n`);
  process.stdout.write('  secreto    ' + base32Encode(secret) + '  (solo demo)\n\n');
  process.stdout.write('  Captura esta pantalla: cuando la cuenta llegue a 0,\n');
  process.stdout.write('  el QR habrá cambiado y la captura ya no servirá.\n\n');
  process.stdout.write('  Ctrl+C para salir.\n');
}

render().catch((error) => {
  console.error(error);
  process.exit(1);
});

setInterval(() => {
  render().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}, 1000);
