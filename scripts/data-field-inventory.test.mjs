import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
  ]
];

// shortcut: flat ASCII string literals only; upgrade to a TS AST if registries become computed.
function flatRegistryValues(source, name) {
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
  it('documents every unique literal collection in all five registries', () => {
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

  it('does not count prose mentioning a collection as a table row', () => {
    const fixtureWithPatientsRow = `## ${SECTION}\n\n| \`collection\` | Purpose |\n| --- | --- |\n| \`patients\` | registry |\n| \`appointments\` | registry |\n`;
    const fixtureWithoutPatientsRow = fixtureWithPatientsRow.replace(
      '| `patients` | registry |\n',
      ''
    );
    const fixture = `${fixtureWithoutPatientsRow}\nThe prose still mentions patients.\n`;
    const section = sectionText(fixture, SECTION);

    expect(missingCollections(['patients'], section)).toEqual(['patients']);
  });

  it('fails closed on computed registry fields', () => {
    expect(() =>
      flatRegistryValues(
        'export const TEST_COLLECTIONS = { patients: collectionName } as const;',
        'TEST_COLLECTIONS'
      )
    ).toThrow(/non-literal/);
  });
});
