import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_STEP_DURATION_MS,
  HERO_STEPS,
  createHeroPlayback,
  nextHeroStep,
} from '../lib/heroPlayback.mjs';

function fakeTimers() {
  let nextId = 1;
  const jobs = new Map();
  return {
    schedule(callback, delay) {
      const id = nextId++;
      jobs.set(id, { callback, delay });
      return id;
    },
    cancel(id) {
      jobs.delete(id);
    },
    runNext() {
      const entry = jobs.entries().next().value;
      assert.ok(entry, 'expected a queued hero stage');
      const [id, job] = entry;
      jobs.delete(id);
      job.callback();
      return job.delay;
    },
    size() {
      return jobs.size;
    },
  };
}

test('the hero advances automatically through one calm ten-second cycle', () => {
  assert.deepEqual(HERO_STEPS, ['word', 'meaning', 'test', 'result']);
  assert.equal(HERO_STEP_DURATION_MS * HERO_STEPS.length, 10_000);
  assert.equal(nextHeroStep('result'), 'word');

  const timers = fakeTimers();
  const seen = [];
  const playback = createHeroPlayback({
    onStep: step => seen.push(step),
    schedule: timers.schedule,
    cancel: timers.cancel,
  });

  playback.setVisible(true);
  for (let index = 0; index < 4; index += 1) {
    assert.equal(timers.runNext(), HERO_STEP_DURATION_MS);
  }
  assert.deepEqual(seen, ['meaning', 'test', 'result', 'word']);
  playback.dispose();
});

test('visibility, reduced motion and disposal pause and clean up hero timers', () => {
  const timers = fakeTimers();
  const seen = [];
  const playback = createHeroPlayback({
    onStep: step => seen.push(step),
    schedule: timers.schedule,
    cancel: timers.cancel,
  });

  playback.setVisible(true);
  assert.equal(timers.size(), 1);
  playback.setDocumentVisible(false);
  assert.equal(timers.size(), 0);
  playback.setDocumentVisible(true);
  assert.equal(timers.size(), 1);
  timers.runNext();
  assert.deepEqual(seen, ['meaning']);

  playback.setReducedMotion(true);
  assert.equal(timers.size(), 0);
  assert.equal(playback.getStep(), 'word');
  assert.deepEqual(seen, ['meaning', 'word']);

  playback.setReducedMotion(false);
  assert.equal(timers.size(), 1);
  playback.setVisible(false);
  assert.equal(timers.size(), 0);
  playback.setVisible(true);
  assert.equal(timers.size(), 1);
  playback.dispose();
  assert.equal(timers.size(), 0);
});
