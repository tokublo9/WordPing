import assert from 'node:assert/strict';
import test from 'node:test';

import { isWordTextHidden } from '../../src/features/cards/hideWordAccess';

test('the stored Hide Word flag controls front-text visibility directly', () => {
  assert.equal(isWordTextHidden({ hideWord: true }), true);
  assert.equal(isWordTextHidden({ hideWord: false }), false);
  assert.equal(isWordTextHidden({}), false, 'off unless the user enables it');
});

test('a missing card is never treated as hidden', () => {
  assert.equal(isWordTextHidden(null), false);
  assert.equal(isWordTextHidden(undefined), false);
});
