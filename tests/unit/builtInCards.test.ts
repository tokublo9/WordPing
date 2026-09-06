import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isBuiltInTutorialCard,
  needsUserContentMask,
} from '../../src/features/cards/builtInCards';

/**
 * Which cards Session Replay may show.
 *
 * The rule answers from one stored field and nothing else. What is covered here
 * is the direction it fails in: anything that is not provably the app's own copy
 * is masked, so a card from an older database, a backup, an import, or a shape
 * nobody anticipated is private by default.
 */

test('only an explicit stored flag makes a card visible', () => {
  assert.equal(isBuiltInTutorialCard({ builtIn: true }), true);
  assert.equal(needsUserContentMask({ builtIn: true }), false);
});

test('everything else is the user’s, including anything ambiguous', () => {
  for (const card of [
    { builtIn: false },
    {},                      // a row from a database that predates the column
    { builtIn: undefined },  // declassified by an edit
    null,
    undefined,
  ]) {
    assert.equal(needsUserContentMask(card), true, JSON.stringify(card) ?? 'nullish');
  }
});

test('a truthy non-true value does not count as app-authored', () => {
  // Defensive: the flag arrives from SQLite as a number, and only the mapper is
  // allowed to turn 1 into true. Anything else must fail towards masked.
  for (const value of [1, 'true', 'yes', {}]) {
    assert.equal(
      needsUserContentMask({ builtIn: value as unknown as boolean }),
      true,
      `builtIn=${String(value)} must not unmask`,
    );
  }
});

test('the id a card was seeded with is not a privacy signal', () => {
  // The point of the stored field: a seeded id survives editing, so it can no
  // longer be what decides visibility. A card carrying a tutorial id but no
  // flag — exactly what an edited card looks like — stays masked.
  assert.equal(needsUserContentMask({ id: 'wp-w3' } as { builtIn?: boolean }), true);
  assert.equal(needsUserContentMask({ id: 'wp-w3', builtIn: true } as { builtIn?: boolean }), false);
});
