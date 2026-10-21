import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cors } from 'hono/cors';
import { assertRenderable } from '../../apps/web/public/modules/trusted-html.js';

export function unsafeDynamicCode(source) {
  // ruleid: clinic.javascript.dynamic-code-execution
  return eval(source);
}

export function unsafeCommand(command) {
  // ruleid: clinic.javascript.command-shell-execution
  return spawn(command, [], { shell: true });
}

// ruleid: clinic.javascript.tls-verification-disabled
export const unsafeAgent = {
  rejectUnauthorized: false
};

export function unsafeHash(value) {
  // ruleid: clinic.javascript.weak-cryptography
  return createHash('sha1').update(value).digest('hex');
}

// ruleid: clinic.javascript.credentialed-wildcard-cors
export const unsafeCors = cors({
  origin: '*',
  credentials: true
});

export function unsafeHtml(element, html) {
  // ruleid: clinic.javascript.html-sink-outside-trusted-entrypoint
  element.innerHTML = html;
}

export function unsafeTrustedTypesPolicy(trustedTypes) {
  // ruleid: clinic.javascript.unapproved-trusted-types-policy
  return trustedTypes.createPolicy('bypass', { createHTML: (html) => html });
}

// ruleid: clinic.javascript.jwt-none-algorithm
export const unsafeJwtOptions = {
  algorithms: ['RS256', 'none']
};

// ok: clinic.javascript.dynamic-code-execution
export const parsed = JSON.parse('{"safe":true}');

// ok: clinic.javascript.command-shell-execution
export const safeChild = spawn('pnpm', ['--version'], { shell: false });

// ok: clinic.javascript.tls-verification-disabled
export const safeAgent = { rejectUnauthorized: true };

// ok: clinic.javascript.weak-cryptography
export const digest = createHash('sha256').update('clinic').digest('hex');

// ok: clinic.javascript.credentialed-wildcard-cors
export const safeCors = cors({
  origin: 'https://clinic.example',
  credentials: true
});

// ok: clinic.javascript.html-sink-outside-trusted-entrypoint
document.querySelector('main').textContent = 'safe text';

// ok: clinic.javascript.jwt-none-algorithm
export const safeJwtOptions = { algorithms: ['RS256'] };

export function nestCors(app) {
  // ruleid: clinic.javascript.credentialed-wildcard-cors
  app.enableCors({ origin: '*', credentials: true });
  // ok: clinic.javascript.credentialed-wildcard-cors
  app.enableCors({
    origin: 'https://synthetic.example.invalid',
    credentials: true
  });
  // ruleid: clinic.javascript.credentialed-wildcard-cors
  app.enableCors({ credentials: true, origin: true });
  // ok: clinic.javascript.credentialed-wildcard-cors
  app.enableCors({ origin: '*', credentials: false });
}

export function fastifyCors(app, plugin) {
  // ruleid: clinic.javascript.credentialed-wildcard-cors
  app.register(plugin, { credentials: true, origin: '*' });
  // ok: clinic.javascript.credentialed-wildcard-cors
  app.register(plugin, {
    credentials: true,
    origin: ['https://synthetic.example.invalid']
  });
  // ruleid: clinic.javascript.credentialed-wildcard-cors
  app.register(plugin, { origin: true, credentials: true });
  // ok: clinic.javascript.credentialed-wildcard-cors
  app.register(plugin, { origin: '*', credentials: false });
}

export function checkedHtml(element, html) {
  // ok: clinic.javascript.html-sink-outside-trusted-entrypoint
  element.innerHTML = assertRenderable(html);
  // ok: clinic.javascript.html-sink-outside-trusted-entrypoint
  element.outerHTML = assertRenderable(html);
  // ok: clinic.javascript.html-sink-outside-trusted-entrypoint
  element.insertAdjacentHTML('beforeend', assertRenderable(html));
  // ok: clinic.javascript.html-sink-outside-trusted-entrypoint
  element.innerHTML = '';
  // ruleid: clinic.javascript.html-sink-outside-trusted-entrypoint
  element.innerHTML = html;
}
