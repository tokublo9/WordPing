import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SHOW_RESULT_COLOR,
  parseShowResultColorPreference,
  serializeShowResultColorPreference,
} from '../../src/features/settings/resultColorPreference';

test('result colour is explicitly off by default for new and upgrading users', () => {
  assert.equal(DEFAULT_SHOW_RESULT_COLOR, false);
  assert.equal(parseShowResultColorPreference(null), false);
  assert.equal(parseShowResultColorPreference(undefined), false);
});

test('invalid stored result-colour values fail closed', () => {
  for (const raw of ['', 'TRUE', '1', 'yes', 'false ', '{"value":true}']) {
    assert.equal(parseShowResultColorPreference(raw), false, raw);
  }
});

test('an enabled result-colour preference survives a storage round trip', () => {
  assert.equal(parseShowResultColorPreference(serializeShowResultColorPreference(true)), true);
  assert.equal(parseShowResultColorPreference(serializeShowResultColorPreference(false)), false);
});
