import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deferAudioPlayerRemoval,
  type AudioCleanupScheduler,
} from '../../src/lib/audioPlayerCleanup';

function controlledScheduler() {
  const queued: Array<() => void> = [];
  const schedule: AudioCleanupScheduler = cleanup => { queued.push(cleanup); };
  return { queued, schedule };
}

test('flipping while Custom Voice plays defers native removal off the interaction path', () => {
  const { queued, schedule } = controlledScheduler();
  let removals = 0;
  const player = { remove: () => { removals++; } };

  deferAudioPlayerRemoval(player, schedule);

  assert.equal(removals, 0, 'remove must not block the tap that starts the flip');
  assert.equal(queued.length, 1);
  queued[0]!();
  assert.equal(removals, 1, 'background cleanup still destroys the old player');
});

test('rapid repeated flips schedule native cleanup only once per player', () => {
  const { queued, schedule } = controlledScheduler();
  let removals = 0;
  const player = { remove: () => { removals++; } };

  deferAudioPlayerRemoval(player, schedule);
  deferAudioPlayerRemoval(player, schedule);
  deferAudioPlayerRemoval(player, schedule);

  assert.equal(queued.length, 1);
  assert.equal(removals, 0);
  queued[0]!();
  assert.equal(removals, 1);
});

test('finishing stale cleanup cannot touch a newer player while cleanup is pending', () => {
  const { queued, schedule } = controlledScheduler();
  let oldRemovals = 0;
  let newRemovals = 0;
  const oldPlayer = { remove: () => { oldRemovals++; } };
  const newPlayer = { remove: () => { newRemovals++; } };

  deferAudioPlayerRemoval(oldPlayer, schedule);
  deferAudioPlayerRemoval(newPlayer, schedule);
  assert.equal(queued.length, 2);

  queued[0]!();
  assert.equal(oldRemovals, 1);
  assert.equal(newRemovals, 0, 'old cleanup owns no reference to new playback');

  queued[1]!();
  assert.equal(newRemovals, 1);
});
