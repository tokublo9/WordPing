import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANNOUNCEMENTS,
  WELCOME_ANNOUNCEMENT_ID,
  initialReadAnnouncementIds,
  parseReadAnnouncementIds,
  serializeReadAnnouncementIds,
  sortAnnouncements,
  unreadAnnouncementIds,
  validAnnouncements,
  visibleAnnouncements,
  type Announcement,
} from '../../src/features/announcements/announcements';
import { SUPPORTED_LANGUAGES, translate } from '../../src/i18n';
import { fillTemplate } from '../../src/lib/fillTemplate';

function make(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a1',
    titleKey: 'announcement_welcome_title',
    bodyKey: 'announcement_welcome_body',
    publishedAt: '2026-08-19',
    ...overrides,
  };
}

test('the shipped list contains the stable first-install welcome announcement', () => {
  assert.equal(ANNOUNCEMENTS.length, 1);
  assert.equal(ANNOUNCEMENTS[0].id, WELCOME_ANNOUNCEMENT_ID);
  assert.equal(ANNOUNCEMENTS[0].titleKey, 'announcement_welcome_title');
  assert.equal(ANNOUNCEMENTS[0].bodyKey, 'announcement_welcome_body');
});

test('welcome copy is explicit in all 20 supported locales', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 20);
  for (const language of SUPPORTED_LANGUAGES) {
    for (const key of ['announcement_welcome_title', 'announcement_welcome_body'] as const) {
      const copy = translate(language.code, key);
      assert.notEqual(copy, key);
      assert.notEqual(copy.trim(), '');
    }
  }
  // The copy interpolates the brand rather than spelling it out, so the twenty
  // localized names live in `app_name` alone. What each locale actually shows is
  // the filled form, which is what these assert.
  const welcomeTitle = (code: string) => fillTemplate(
    translate(code, 'announcement_welcome_title'),
    { appName: translate(code, 'app_name') },
  );
  assert.match(translate('ja', 'announcement_welcome_title'), /\{appName\}/u);
  assert.equal(welcomeTitle('en-US'), 'Thank you for installing WordCore!');
  assert.equal(welcomeTitle('ja'), 'ワードコアをインストールしていただきありがとうございます！');
  assert.equal(welcomeTitle('ko'), '워드코어를 설치해 주셔서 감사합니다!');
  assert.equal(welcomeTitle('zh-CN'), '感谢安装沃德科尔！');
});

test('the screen can render locally supplied announcements', () => {
  const supplied = [make({ id: 'a1' }), make({ id: 'a2' })];
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
    make({ id: '' }),
    make({ id: 'blank-title', titleKey: '' as Announcement['titleKey'] }),
    make({ id: 'blank-body', bodyKey: '' as Announcement['bodyKey'] }),
    make({ id: 'bad-date', publishedAt: 'yesterday' }),
    make({ id: 'impossible-date', publishedAt: '2026-13-45' }),
  ]);
  assert.deepEqual(rendered.map(item => item.id), ['good']);
});

test('a duplicated id keeps only the first occurrence', () => {
  // Ids are React list keys, so a duplicate would break reconciliation.
  const rendered = validAnnouncements([
    make({ id: 'dup', titleKey: 'announcement_welcome_title' }),
    make({ id: 'dup', titleKey: 'announcement_unread' }),
  ]);
  assert.deepEqual(rendered.map(item => item.titleKey), ['announcement_welcome_title']);
});

test('only a genuine first install starts with the welcome announcement unread', () => {
  assert.equal(initialReadAnnouncementIds(null, true).has(WELCOME_ANNOUNCEMENT_ID), false);
  assert.equal(initialReadAnnouncementIds(null, false).has(WELCOME_ANNOUNCEMENT_ID), true);
  assert.equal(initialReadAnnouncementIds('[]', false).has(WELCOME_ANNOUNCEMENT_ID), false);
  assert.equal(initialReadAnnouncementIds('{broken', false).has(WELCOME_ANNOUNCEMENT_ID), true);
});

test('persisted read ids survive relaunches and unknown future ids are preserved', () => {
  const stored = serializeReadAnnouncementIds(new Set([WELCOME_ANNOUNCEMENT_ID, 'future.v2']));
  const restored = initialReadAnnouncementIds(stored, false);
  assert.deepEqual([...restored].sort(), ['future.v2', WELCOME_ANNOUNCEMENT_ID].sort());
  assert.deepEqual(parseReadAnnouncementIds('{broken'), new Set());
});

test('the DEV override changes unread presentation without changing persisted state', () => {
  const read = new Set([WELCOME_ANNOUNCEMENT_ID]);
  assert.equal(unreadAnnouncementIds(read, false).has(WELCOME_ANNOUNCEMENT_ID), false);
  assert.equal(unreadAnnouncementIds(read, true).has(WELCOME_ANNOUNCEMENT_ID), true);
  assert.equal(read.has(WELCOME_ANNOUNCEMENT_ID), true);
});

test('sorting does not mutate the input', () => {
  const input = [make({ id: 'a', publishedAt: '2026-01-01' }), make({ id: 'b', publishedAt: '2026-08-19' })];
  const before = input.map(item => item.id);
  sortAnnouncements(input);
  assert.deepEqual(input.map(item => item.id), before);
});
