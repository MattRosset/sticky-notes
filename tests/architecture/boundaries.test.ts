import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Proves the layer rules in eslint.config.js fire. Each fixture is a minimal file that breaks
// exactly one rule; the fixtures are ignored by the normal lint, so this test lints them with
// `ignore: false`. If a fixture stops producing its message, the rule is broken: fix the rule.

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

interface Violation {
  readonly fixture: string;
  readonly ruleId: string;
  /** A distinctive part of the configured message, so the right rule block is the one firing. */
  readonly messageIncludes: string;
}

const violations: readonly Violation[] = [
  {
    fixture: 'src/domain/__lint-fixtures__/imports-react.ts',
    ruleId: 'no-restricted-imports',
    messageIncludes: 'domain/ is framework-free',
  },
  {
    fixture: 'src/domain/__lint-fixtures__/imports-components.ts',
    ruleId: 'no-restricted-imports',
    messageIncludes: 'domain/ is the bottom layer',
  },
  {
    fixture: 'src/domain/__lint-fixtures__/nested/deep/uses-random.ts',
    ruleId: 'no-restricted-properties',
    messageIncludes: 'domain/ is deterministic',
  },
  {
    fixture: 'src/domain/__lint-fixtures__/uses-window.ts',
    ruleId: 'no-restricted-globals',
    messageIncludes: 'domain/ must run in Node tests',
  },
  {
    fixture: 'src/interaction/__lint-fixtures__/imports-components.ts',
    ruleId: 'no-restricted-imports',
    messageIncludes: 'interaction/ turns pointer input into domain actions',
  },
  {
    fixture: 'src/components/__lint-fixtures__/imports-persistence.ts',
    ruleId: 'no-restricted-imports',
    messageIncludes: 'components/ render state and dispatch actions',
  },
  {
    fixture: 'src/persistence/__lint-fixtures__/imports-react.ts',
    ruleId: 'no-restricted-imports',
    messageIncludes: 'persistence/ adapts storage to the domain model only',
  },
];

const compositionRootFixture = 'src/app/__lint-fixtures__/imports-everything.ts';

const messagesByFixture = new Map<string, readonly Linter.LintMessage[]>();

function messagesFor(fixture: string): readonly Linter.LintMessage[] {
  const messages = messagesByFixture.get(fixture);
  if (messages === undefined) throw new Error(`${fixture} was not linted`);
  return messages;
}

function describeMessages(messages: readonly Linter.LintMessage[]): string {
  return JSON.stringify(messages.map((m) => ({ ruleId: m.ruleId, message: m.message })));
}

beforeAll(async () => {
  const eslint = new ESLint({ cwd: repoRoot, ignore: false });
  const fixtures = [...violations.map((v) => v.fixture), compositionRootFixture];
  const results = await eslint.lintFiles(fixtures);
  for (const result of results) {
    const relative = path.relative(repoRoot, result.filePath).split(path.sep).join('/');
    messagesByFixture.set(relative, result.messages);
  }
}, 30_000);

describe('layer boundaries', () => {
  it.each(violations)('$fixture reports $ruleId', ({ fixture, ruleId, messageIncludes }) => {
    const messages = messagesFor(fixture);
    const matched = messages.some(
      (m) => m.ruleId === ruleId && m.message.includes(messageIncludes),
    );
    expect(
      matched,
      `${fixture}: expected ${ruleId} containing "${messageIncludes}", found ${describeMessages(messages)}`,
    ).toBe(true);
  });

  it('lets app/ import every layer (composition root)', () => {
    const messages = messagesFor(compositionRootFixture);
    const restricted = messages.filter((m) => m.ruleId?.startsWith('no-restricted-') === true);
    expect(
      restricted,
      `${compositionRootFixture}: expected no no-restricted-* messages, found ${describeMessages(restricted)}`,
    ).toEqual([]);
  });
});
