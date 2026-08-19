import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANNOUNCEMENTS,
  sortAnnouncements,
  validAnnouncements,
  visibleAnnouncements,
  type Announcement,
} from '../../src/features/announcements/announcements';

function make(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a1',
    title: 'Version 1.1 is here',
    body: 'Backup and restore is now available.',
    publishedAt: '2026-08-19',
    ...overrides,
  };
}

test('the shipped list is empty, so the screen shows its empty state', () => {
  assert.deepEqual([...ANNOUNCEMENTS], []);
  assert.deepEqual(visibleAnnouncements(), []);
});

test('the screen can render locally supplied announcements', () => {
  const supplied = [make({ id: 'a1' }), make({ id: 'a2', title: 'Second' })];
  const rendered = visibleAnnouncements(supplied);
  assert.equal(rendered.length, 2);
  assert.deepEqual(rendered.map(item => item.id).sort(), ['a1', 'a2']);
});

test('announcements are ordered newest first', () => {
  const ordered = sortAnnouncements([
    make({ id: 'old', publishedAt: '2026-01-01' }),
    make({ id: 'new', publishedAt: '2026-08-19' }),
    make({ id: 'mid', publishedAt: '2026-05-05' }),
  ]);
  assert.deepEqual(ordered.map(item => item.id), ['new', 'mid', 'old']);
});

test('equal dates keep a stable order', () => {
  const ordered = sortAnnouncements([
    make({ id: 'b', publishedAt: '2026-08-19' }),
    make({ id: 'a', publishedAt: '2026-08-19' }),
  ]);
  assert.deepEqual(ordered.map(item => item.id), ['a', 'b']);
});

test('a malformed entry is dropped without taking the screen down', () => {
  const rendered = visibleAnnouncements([
    make({ id: 'good' }),
    make({ id: '', title: 'no id' }),
    make({ id: 'blank-title', title: '   ' }),
    make({ id: 'blank-body', body: '' }),
    make({ id: 'bad-date', publishedAt: 'yesterday' }),
    make({ id: 'impossible-date', publishedAt: '2026-13-45' }),
  ]);
  assert.deepEqual(rendered.map(item => item.id), ['good']);
});

test('a duplicated id keeps only the first occurrence', () => {
  // Ids are React list keys, so a duplicate would break reconciliation.
  const rendered = validAnnouncements([
    make({ id: 'dup', title: 'first' }),
    make({ id: 'dup', title: 'second' }),
  ]);
  assert.deepEqual(rendered.map(item => item.title), ['first']);
});

test('sorting does not mutate the input', () => {
  const input = [make({ id: 'a', publishedAt: '2026-01-01' }), make({ id: 'b', publishedAt: '2026-08-19' })];
  const before = input.map(item => item.id);
  sortAnnouncements(input);
  assert.deepEqual(input.map(item => item.id), before);
});
