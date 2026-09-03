import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESULT_COLOR_FILTERS,
  RESULT_FILTER_EXPLANATION_KEYS,
  RESULT_FILTER_INTERVAL_KEYS,
  emphasiseInterval,
  isResultColorFilter,
} from '../../src/features/cards/resultFilterCopy';
import { translate } from '../../src/i18n';

test('only the three colours have an explanation; grey has none', () => {
  assert.deepEqual([...RESULT_COLOR_FILTERS], ['good', 'slightly', 'unknown']);
  assert.equal(isResultColorFilter('none'), false);
  assert.equal(isResultColorFilter('perfect'), false);
  assert.equal(isResultColorFilter(undefined), false);
  for (const level of RESULT_COLOR_FILTERS) {
    assert.equal(isResultColorFilter(level), true, level);
  }
});

test('every explanation contains its interval verbatim, in both required languages', () => {
  // The dialog emphasises by finding this phrase inside the sentence, so a
  // reworded translation would quietly lose the emphasis. Checked rather than
  // trusted.
  for (const locale of ['en-US', 'ja'] as const) {
    for (const level of RESULT_COLOR_FILTERS) {
      const body = translate(locale, RESULT_FILTER_EXPLANATION_KEYS[level]);
      const interval = translate(locale, RESULT_FILTER_INTERVAL_KEYS[level]);
      assert.ok(interval.length > 0, `${locale} ${level} interval`);
      assert.ok(body.includes(interval), `${locale} ${level}: "${interval}" not in body`);
    }
  }
});

test('the English intervals are the ones grading actually waits', () => {
  assert.equal(translate('en-US', RESULT_FILTER_INTERVAL_KEYS.good), 'three days');
  assert.equal(translate('en-US', RESULT_FILTER_INTERVAL_KEYS.slightly), 'one day');
  assert.equal(translate('en-US', RESULT_FILTER_INTERVAL_KEYS.unknown), 'one hour');
  assert.equal(translate('ja', RESULT_FILTER_INTERVAL_KEYS.good), '3日後');
  assert.equal(translate('ja', RESULT_FILTER_INTERVAL_KEYS.slightly), '1日後');
  assert.equal(translate('ja', RESULT_FILTER_INTERVAL_KEYS.unknown), '1時間後');
});

test('splitting emphasises the interval and keeps the sentence whole', () => {
  const split = emphasiseInterval('back after three days so you can test again', 'three days');
  assert.deepEqual(split, {
    before: 'back after ',
    emphasis: 'three days',
    after: ' so you can test again',
  });
  // Nothing is dropped, whatever the split.
  assert.equal(
    split.before + split.emphasis + split.after,
    'back after three days so you can test again',
  );
});

test('a body that does not contain its interval is left whole and unemphasised', () => {
  // A reworded translation, or one locale falling back while the other does not.
  const body = 'Words come back later.';
  assert.deepEqual(emphasiseInterval(body, 'three days'), {
    before: body, emphasis: '', after: '',
  });
  assert.deepEqual(emphasiseInterval(body, ''), { before: body, emphasis: '', after: '' });
});

test('the interval is emphasised wherever it sits in the sentence', () => {
  // Japanese puts it early; English puts it late. Both are one substring.
  const ja = emphasiseInterval('3日後にメインのリストへ戻ります。', '3日後');
  assert.deepEqual(ja, { before: '', emphasis: '3日後', after: 'にメインのリストへ戻ります。' });

  const trailing = emphasiseInterval('comes back in one hour', 'one hour');
  assert.deepEqual(trailing, { before: 'comes back in ', emphasis: 'one hour', after: '' });

  // Only the first occurrence is emphasised — never two runs of bold.
  const twice = emphasiseInterval('one day, then one day again', 'one day');
  assert.equal(twice.before, '');
  assert.equal(twice.emphasis, 'one day');
  assert.equal(twice.after, ', then one day again');
});

test('the real explanations split into a bold interval with text around it', () => {
  for (const level of RESULT_COLOR_FILTERS) {
    const body = translate('en-US', RESULT_FILTER_EXPLANATION_KEYS[level]);
    const split = emphasiseInterval(body, translate('en-US', RESULT_FILTER_INTERVAL_KEYS[level]));
    assert.notEqual(split.emphasis, '', level);
    assert.equal(split.before + split.emphasis + split.after, body, level);
    assert.ok(split.before.length > 0, level);
    assert.ok(split.after.length > 0, level);
  }
});
