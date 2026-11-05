import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Computed scope: the layer import rules in eslint.config.js are scoped by folder, so a file
// outside every layer folder would escape them silently. This test lists every file in src/.

const src = fileURLToPath(new URL('../../src', import.meta.url));

const layers: readonly string[] = ['domain', 'interaction', 'components', 'persistence', 'app'];

interface Exception {
  readonly file: string;
  readonly reason: string;
}

const exceptions: readonly Exception[] = [
  { file: 'main.tsx', reason: 'Vite entry point' },
  { file: 'index.css', reason: 'global reset' },
];

/** `relativePath` is relative to src/ and uses `/` separators. */
function belongsToLayer(relativePath: string): boolean {
  const slash = relativePath.indexOf('/');
  if (slash === -1) return exceptions.some((e) => e.file === relativePath);
  return layers.includes(relativePath.slice(0, slash));
}

function listSourceFiles(): string[] {
  return fs
    .readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(src, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    );
}

describe('source layout', () => {
  it('puts every file in src/ inside a layer or the exception list', () => {
    // Seeded check: the classifier must reject a file outside every layer.
    expect(belongsToLayer('utils/x.ts'), 'classifier accepted src/utils/x.ts').toBe(false);

    const files = listSourceFiles();
    expect(files.length, 'found no files in src/').toBeGreaterThan(0);

    const outside = files.filter((file) => !belongsToLayer(file));
    expect(
      outside,
      `Every file in src/ belongs to a layer so the import rules can see it. Move it into a layer or add it to the exception list with a reason. Outside: ${outside.join(', ')}`,
    ).toEqual([]);
  });
});
