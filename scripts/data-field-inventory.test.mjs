import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUSINESS_EXPORT_FIELDS } from '../packages/domain/src/business-delivery-export.ts';
import { sectionText } from './check-docs-links.mjs';

const SECTION = '3. Local Firestore/contract baseline';
const REGISTRIES = [
  ['PATIENT_COLLECTIONS', '../apps/api/src/patients/patient-directory.ts'],
  [
    'BUSINESS_DELIVERY_COLLECTIONS',
    '../apps/api/src/business-delivery/usage-events.ts'
  ],
  [
    'EXPORT_COLLECTIONS',
    '../apps/api/src/firestore/business-delivery-export.repository.ts'
  ],
  [
    'RETENTION_COLLECTIONS',
    '../apps/api/src/firestore/business-delivery-retention.repository.ts'
  ],
  [
    'TERMINATION_COLLECTIONS',
    '../apps/api/src/firestore/business-delivery-termination.repository.ts'
  ],
  [
    'MILESTONE_ACKNOWLEDGEMENT_LOG',
    '../apps/api/src/firestore/business-delivery.repository.ts'
  ]
];

// shortcut: flat ASCII string literals only; upgrade to a TS AST if registries become computed.
function flatRegistryValues(source, name) {
  const literal = source.match(
    new RegExp(
      `^export\\s+const\\s+${name}\\s*=\\s*(['"])([A-Za-z0-9_-]+)\\1\\s*;`,
      'm'
    )
  );
  if (literal) return [literal[2]];

  const declaration = source.match(
    new RegExp(
      `export\\s+const\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*as\\s+const\\s*;`
    )
  );
  if (!declaration)
    throw new Error(`Missing ${name} flat registry declaration`);

  const fields = declaration[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  const values = [];
  for (const field of fields) {
    const literal = field.match(
      /^[A-Za-z_$][\w$]*\s*:\s*(['"])([A-Za-z0-9_-]+)\1$/
    );
    if (literal) values.push(literal[2]);
  }
  if (fields.length !== values.length)
    throw new Error(`${name} contains a non-literal or unsupported field`);
  return values;
}

// shortcut: section 3 uses unfenced table rows; strip fences if code samples are added.
function collectionTableValues(section) {
  return [...section.matchAll(/^\|[ \t]*`([^`]+)`[ \t]*\|/gm)].map(
    ([, name]) => name
  );
}

function missingCollections(required, section) {
  const documented = new Set(collectionTableValues(section));
  return [...new Set(required)].filter((name) => !documented.has(name));
}

describe('data-field inventory collection baseline', () => {
  it('documents every unique collection in registries and standalone exports', () => {
    const required = [
      ...new Set(
        REGISTRIES.flatMap(([name, path]) =>
          flatRegistryValues(
            readFileSync(new URL(path, import.meta.url), 'utf8'),
            name
          )
        )
      )
    ];
    const inventory = readFileSync(
      new URL(
        '../docs/security/data-classification-and-field-inventory-2026-07-29.md',
        import.meta.url
      ),
      'utf8'
    );
    const section = sectionText(inventory, SECTION);

    expect(missingCollections(required, section)).toEqual([]);
  });

  it.each(['patients', 'bd_milestone_acknowledgement_log'])(
    'does not count prose mentioning %s as a table row',
    (collection) => {
      const fixtureWithRow = `## ${SECTION}\n\n| \`collection\` | Purpose |\n| --- | --- |\n| \`${collection}\` | registry |\n| \`appointments\` | registry |\n`;
      const fixtureWithoutRow = fixtureWithRow.replace(
        `| \`${collection}\` | registry |\n`,
        ''
      );
      const fixture = `${fixtureWithoutRow}\nThe prose still mentions ${collection}.\n`;
      const section = sectionText(fixture, SECTION);

      expect(missingCollections([collection], section)).toEqual([collection]);
    }
  );

  it.each(["'", '"'])(
    'reads a standalone collection with %s quotes',
    (quote) => {
      expect(
        flatRegistryValues(
          `export const TEST_COLLECTIONS = ${quote}test_collection${quote};`,
          'TEST_COLLECTIONS'
        )
      ).toEqual(['test_collection']);
    }
  );

  it.each([
    [
      'export const TEST_COLLECTIONS = { patients: collectionName } as const;',
      /non-literal/
    ],
    ["export const TEST_COLLECTIONS = 'prefix' + suffix;", /Missing/]
  ])('fails closed on computed declarations: %s', (source, error) => {
    expect(() => flatRegistryValues(source, 'TEST_COLLECTIONS')).toThrow(error);
  });

  it('aligns the engineering nationality row with the approved export amendment', () => {
    const draft = readFileSync(
      new URL(
        '../docs/legal/privacy-engineering-review-draft-2026-10-29.md',
        import.meta.url
      ),
      'utf8'
    );
    const rows = draft
      .split(/\r?\n/)
      .filter((line) => /^\|\s*國籍\s*\|/.test(line));
    expect(rows).toHaveLength(1);
    expect(BUSINESS_EXPORT_FIELDS).toContain('nationality');
    expect(rows[0]).toContain('2026-09-29');
    expect(rows[0]).toContain('ADR-0009');
    expect(rows[0]).not.toContain('不進身分比對、Calendar 或匯出');
  });
});
