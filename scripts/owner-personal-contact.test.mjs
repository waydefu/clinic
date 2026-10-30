import { execFileSync } from 'node:child_process';
import { scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner decision Q3 (decision register, 2026-10-10～11): the owner's personal
// email and mobile number must not appear in CURRENT tracked files; role
// information replaces them. Git history is not rewritten, so this guard says
// nothing about history.
//
// The values themselves must not be written here, so the repository stores only
// salted scrypt fingerprints. shortcut: a 10-digit mobile number is a small
// space, so a fingerprint slows a guesser down but is not secrecy, and the
// values are already public in older commits; use a different scheme only if
// the owner ever needs the old values to be unguessable.
const SALT = 'beauessence-owner-contact-guard-v1';
const OWNER_CONTACT_FINGERPRINTS = new Set([
  '14a7f5d9c284e927f9e0e8af68c0bb3ef385f7e13cebaad6d9b0022f6b238313',
  '31e387d5a85e0a644e999ac683ceaa8a7c76f33b7025b448f9a9f85b92285382'
]);

// Owner decision Q4: firebase.json `supportEmail` keeps the owner's address
// until the owner provides a clinic mailbox. Remove this entry in that change.
const ALLOWED_PATHS = new Set(['firebase.json']);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DIGIT_RUN = /\+?\d+(?:[ -]\d+)*/g;
// Reserved or machine-account domains can never be a person's mailbox.
const NOT_A_MAILBOX =
  /(^|\.)(example\.(com|org|net)|invalid|test|localhost|gserviceaccount\.com|group\.calendar\.google\.com)$/;

const fingerprint = (value) =>
  scryptSync(value, SALT, 32, { N: 2 ** 13 }).toString('hex');

/** Email and mobile tokens in one text, normalised as the owner's were fingerprinted. */
function candidateTokens(text) {
  const tokens = new Set();
  for (const raw of text.match(EMAIL) ?? []) {
    const email = raw.toLowerCase();
    if (!NOT_A_MAILBOX.test(email.split('@')[1])) tokens.add(email);
  }
  for (const run of text.match(DIGIT_RUN) ?? []) {
    // Join consecutive digit groups so "0900 000 000" and "+886 900 000 000"
    // match, and start at every group so a date right before a number does not hide it.
    const groups = run.replace('+', '').split(/[ -]/);
    for (let i = 0; i < groups.length; i += 1) {
      let digits = '';
      for (let j = i; j < groups.length && digits.length < 12; j += 1) {
        digits += groups[j];
        const local =
          digits.length === 12 && digits.startsWith('886')
            ? `0${digits.slice(3)}`
            : digits;
        if (/^09\d{8}$/.test(local)) tokens.add(local);
      }
    }
  }
  return [...tokens];
}

function countOwnerContacts(text, fingerprints, cache = new Map()) {
  return candidateTokens(text).filter((token) => {
    if (!cache.has(token)) cache.set(token, fingerprint(token));
    return fingerprints.has(cache.get(token));
  }).length;
}

describe('owner personal contact guard (Q3)', () => {
  it('detects a fingerprinted email or mobile in the forms a document would use', () => {
    const mailbox = 'Synthetic.Owner@mailbox-fixture.org';
    const fingerprints = new Set([
      fingerprint(mailbox.toLowerCase()),
      fingerprint('0900000000')
    ]);
    expect(countOwnerContacts(`contact ${mailbox}`, fingerprints)).toBe(1);
    expect(countOwnerContacts('tel 0900-000-000', fingerprints)).toBe(1);
    expect(countOwnerContacts('tel +886 900 000 000', fingerprints)).toBe(1);
    expect(countOwnerContacts('2026-10-30 0900000000', fingerprints)).toBe(1);
    expect(
      countOwnerContacts('0900000000 and 0900 000 000', fingerprints)
    ).toBe(1);
    expect(
      countOwnerContacts(
        '02-2577-1314 / 0800-000-913 / other@mailbox-fixture.org / 0911111111',
        fingerprints
      )
    ).toBe(0);
  });

  it('keeps the owner personal email and mobile out of tracked files', () => {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8'
    }).trim();
    const tracked = execFileSync('git', ['ls-files', '--full-name', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1 << 28
    })
      .split('\0')
      .filter(Boolean);
    const cache = new Map();
    const offenders = [];
    for (const file of tracked) {
      if (ALLOWED_PATHS.has(file)) continue;
      let buffer;
      try {
        buffer = readFileSync(`${root}/${file}`);
      } catch {
        continue; // deleted in the working tree, or not a regular file
      }
      if (buffer.subarray(0, 8000).includes(0)) continue; // binary
      const text = buffer.toString('utf8');
      if (countOwnerContacts(text, OWNER_CONTACT_FINGERPRINTS, cache) > 0) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
