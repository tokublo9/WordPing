const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('counts of 1-99 keep the original circular badge, position and size', () => {
  const source = read('src/components/TestStatusIcon.tsx');
  // Original geometry: a 15pt circle overhanging the icon's bottom-right corner.
  assert.match(
    source,
    /badgeCircle: \{\s*right: -BADGE_OVERHANG,\s*width: BADGE_SIZE,\s*height: BADGE_SIZE,\s*\}/u,
  );
  assert.match(source, /badge: \{[\s\S]*?bottom: -4,\s*borderRadius: 20,/u);
  // No sized wrapper box around the icon: reserving layout width and cancelling it with
  // a negative margin is what knocked the badge off its original position.
  assert.doesNotMatch(source, /ROOT_WIDTH|marginRight|marginLeft/u);
  assert.doesNotMatch(source, /rootShifted: \{[^}]*(width|height|margin)/u);
  // Counts of 1-99 get no wrapper style at all, so nothing can displace them.
  assert.match(source, /<View style=\{over99 \? styles\.rootShifted : undefined\}>/u);
  // The pill applies to "99+" only; every other count takes the circle.
  assert.match(source, /over99 \? styles\.badgePill : twoDigit \? styles\.badgeCircleWide : styles\.badgeCircle/u);
  assert.match(source, /styles\.badge, styles\.badgeCircle/u);
  assert.match(source, /const label     = over99 \? '99\+' : String\(untestedCount\)/u);
  assert.match(source, /const twoDigit  = !over99 && untestedCount >= 10;/u);
});

test('"99+" gets an oval wide enough for the whole label, on the same left edge', () => {
  const source = read('src/components/TestStatusIcon.tsx');
  // `left` plus a negative `right` derives the width from the insets. Content sizing
  // capped the pill at the parent's width, which wrapped or ellipsized the label —
  // that is where "99-" and "9…" came from.
  assert.match(
    source,
    /badgePill: \{\s*left: BADGE_LEFT,\s*right: -BADGE_PILL_OVERHANG,\s*minWidth: BADGE_PILL_WIDTH,\s*height: BADGE_SIZE,\s*paddingHorizontal: 3,\s*\}/u,
  );
  // minWidth restates the inset width as a floor, so the box cannot be squeezed by how
  // the parent resolves its own width. No maxWidth, which would cap it again.
  assert.match(source, /const BADGE_PILL_WIDTH = ICON_SIZE - BADGE_LEFT \+ BADGE_PILL_OVERHANG;/u);
  assert.doesNotMatch(source, /badgePill: \{[^}]*maxWidth/u);
  // Same left edge as the circle, so the badge does not move between the two states.
  assert.match(source, /const BADGE_LEFT = ICON_SIZE \+ BADGE_OVERHANG - BADGE_SIZE;/u);
  assert.match(source, /size=\{ICON_SIZE\}/u);
  assert.doesNotMatch(source, /badge: \{[^}]*(right|left):/u);

  // The box must clear the label at whatever size the label is set to: three characters
  // at roughly 0.62em each, inside the padding and the 1pt border on each side.
  const value = name => Number(new RegExp(`const ${name} = (?:[A-Z_ +-]*?)?(\\d+);`, 'u').exec(source)[1]);
  const iconSize = value('ICON_SIZE');
  const badgeSize = value('BADGE_SIZE');
  const overhang = value('BADGE_OVERHANG');
  const pillOverhang = value('BADGE_PILL_OVERHANG');
  const badgeLeft = iconSize + overhang - badgeSize;
  const pillWidth = iconSize - badgeLeft + pillOverhang;

  const fontSize = Number(/badgeText: \{ fontSize: (\d+)/u.exec(source)[1]);
  const padding = Number(/badgePill: \{[\s\S]*?paddingHorizontal: (\d+)/u.exec(source)[1]);
  const interior = pillWidth - 2 * padding - 2;
  const labelWidth = 3 * 0.62 * fontSize;
  assert.ok(
    interior >= labelWidth,
    `pill interior ${interior} must fit "99+" at ${fontSize}pt (~${labelWidth.toFixed(1)})`,
  );
  // And it must be an oval, i.e. wider than the circle it replaces.
  assert.ok(pillWidth > badgeSize, `pill width ${pillWidth} must exceed circle ${badgeSize}`);

  // The label must render in full: never truncated, and never resized by the system font
  // scale, which is what turned "99+" into "9…" no matter how wide the box was.
  assert.match(source, /allowFontScaling=\{false\}/u);
  assert.doesNotMatch(source, /numberOfLines=|ellipsizeMode=|adjustsFontSizeToFit/u);
  // A fixed label size is what makes the width arithmetic above meaningful.
  assert.match(source, /badgeText: \{ fontSize: \d+,/u);
});

test('two digits widen the badge instead of shrinking the label', () => {
  const source = read('src/components/TestStatusIcon.tsx');
  // One font size for every count: the shrink-to-8pt variant is gone.
  assert.doesNotMatch(source, /badgeTextSm/u);
  assert.equal((source.match(/fontSize:/gu) ?? []).length, 1, 'a single label size');

  // Two digits get their own slightly larger circle; one digit keeps the original.
  assert.match(
    source,
    /badgeCircleWide: \{\s*right: -BADGE_OVERHANG,\s*width: BADGE_TWO_DIGIT_SIZE,\s*height: BADGE_TWO_DIGIT_SIZE,\s*\}/u,
  );
  assert.match(
    source,
    /over99 \? styles\.badgePill : twoDigit \? styles\.badgeCircleWide : styles\.badgeCircle/u,
  );

  const value = name => Number(new RegExp(`const ${name} = (\\d+);`, 'u').exec(source)[1]);
  const size = value('BADGE_SIZE');
  const wide = value('BADGE_TWO_DIGIT_SIZE');
  // Big enough for two digits at whatever size the label uses (~0.62em per digit),
  // measured against the interior left once the 1pt border is taken off each side.
  const fontSize = Number(/badgeText: \{ fontSize: (\d+)/u.exec(source)[1]);
  const twoDigitsWide = 2 * 0.62 * fontSize;
  assert.ok(
    wide - 2 >= twoDigitsWide,
    `interior ${wide - 2} must fit two ${fontSize}pt digits (~${twoDigitsWide.toFixed(1)})`,
  );
  // …but only slightly larger, and still a circle so the styling is unchanged.
  assert.ok(wide > size && wide <= size + 6, `${wide} should be a slight step up from ${size}`);
  // Pinned bottom-right like the small circle, so the corner it occupies does not move.
  assert.match(source, /badge: \{[\s\S]*?bottom: -4,/u);
  assert.doesNotMatch(source, /badgeCircleWide: \{[^}]*(left|bottom|top):/u);
});

test('only the "99+" state nudges the icon and badge left, together', () => {
  const source = read('src/components/TestStatusIcon.tsx');
  // A transform on the shared wrapper moves icon and badge as one unit, and unlike a
  // margin it cannot reflow the header row around it.
  assert.match(
    source,
    /rootShifted: \{\s*transform: \[\{ translateX: -BADGE_PILL_SHIFT \}\],\s*\}/u,
  );
  // Gated on the same flag that selects the pill, so the two can never disagree.
  assert.match(source, /const over99   = !complete && untestedCount > 99;/u);
  assert.match(source, /<View style=\{over99 \? styles\.rootShifted : undefined\}>/u);
  // One source of truth for the flag — no second, drifting definition inside the badge.
  assert.equal((source.match(/untestedCount > 99/gu) ?? []).length, 1);

  // How far to nudge is a visual judgement; what matters is that it moves left and stays
  // within the room the pill overhangs, so the badge cannot be pushed back under the row.
  const value = name => Number(new RegExp(`const ${name} = (\\d+);`, 'u').exec(source)[1]);
  const shift = value('BADGE_PILL_SHIFT');
  const pillOverhang = value('BADGE_PILL_OVERHANG');
  assert.ok(shift > 0, `shift ${shift} must move the control left`);
  assert.ok(shift <= pillOverhang, `shift ${shift} must stay within the ${pillOverhang} overhang`);
});

test('no plan limit or Pro popup gates adding words or creating folders', () => {
  const useCards = read('src/features/cards/useCards.ts');
  const useFolders = read('src/features/folders/useFolders.ts');
  const constants = read('src/constants.ts');
  const app = read('App.tsx');

  // The count check and its paywall callback are gone from registration.
  assert.doesNotMatch(useCards, /FREE_WORD_LIMIT|onWordLimitReached/u);
  assert.doesNotMatch(useCards, /cards\.length >=/u);
  // Registration no longer needs to know the plan at all.
  assert.doesNotMatch(useCards, /isSubscribed/u);
  assert.match(useCards, /if \(!word\.trim\(\)\) \{[\s\S]*?\}\s*\/\/ Words are unlimited/u);

  // Folder creation never consulted a plan and must stay that way.
  assert.doesNotMatch(useFolders, /isSubscribed|isPremium|LIMIT|paywall|Paywall/u);

  // The constant itself is gone, so no caller can reintroduce the limit.
  assert.doesNotMatch(constants, /FREE_WORD_LIMIT/u);

  // Nothing raises the paywall for words: its only trigger is locked voice playback.
  assert.doesNotMatch(app, /openPaywall\('words'\)|paywallReason|'words'/u);
  assert.match(app, /onVoiceLocked: openVoicePaywall/u);
  const paywallOpeners = app.match(/setPaywallVisible\(true\)/gu) ?? [];
  assert.equal(paywallOpeners.length, 1, 'exactly one paywall trigger remains');
});

test('the paywall only describes the voice limit', () => {
  const paywall = read('src/components/PaywallModal.tsx');
  const appModals = read('src/app/AppModals.tsx');
  // With no word limit there is no "reached the word limit" state to render.
  assert.doesNotMatch(paywall, /reason|reached_word_limit/u);
  assert.match(paywall, /\{t\('voice_limited'\)\}/u);
  assert.doesNotMatch(appModals, /reason/u);
});

test('cards persist as soon as stored cards reach state, not after every phase', () => {
  const bootstrap = read('src/app/useAppBootstrap.ts');
  const persistence = read('src/app/useAppPersistence.ts');

  // The gate opens in Phase 1, right after stored cards and settings are applied, so a
  // word added during the later phases is written instead of held in memory.
  assert.match(
    bootstrap,
    /setCards\(migratedCards\);[\s\S]*?applySettings\(local\.settings\);[\s\S]*?cardsLoaded\.current = true;/u,
  );
  // The failure path still opens it, so a bootstrap error cannot disable saving.
  assert.match(bootstrap, /hasLoaded\.current = true;\s*cardsLoaded\.current = true;/u);
  assert.match(bootstrap, /cardsLoaded: MutableRefObject<boolean>;/u);

  // Card and folder writes use the earlier gate; UI preferences keep the later one,
  // since those are only read in Phase 2 and would otherwise persist their defaults.
  assert.match(persistence, /if \(!cardsLoaded\.current\) return;\s*persist\(\{ cards/u);
  assert.match(persistence, /if \(!cardsLoaded\.current\) return;\s*foldersRef\.current = folders;/u);
  assert.match(persistence, /if \(!hasLoaded\.current\) return;\s*AsyncStorage\.setItem\(SHOW_FULL_CARD_KEY/u);
});

test('local storage is written immediately and never overwritten by a late remote read', () => {
  const db = read('src/lib/db.ts');

  // persist() writes AsyncStorage on the spot; only the Supabase upsert is debounced.
  assert.match(db, /pendingLocal = data;\s*void flushLocal\(\);/u);
  assert.match(db, /remoteTimer = setTimeout\(\(\) => \{[\s\S]*?void flushRemote\(\);\s*\}, 750\);/u);
  assert.match(db, /AsyncStorage\.setItem\(CARDS_KEY, JSON\.stringify\(cards\)\)/u);

  // The single remote read is awaited inside bootstrapData and only runs when there is
  // no local card data, so a slow server response can never land on newer local cards.
  const remoteReads = db.match(/\.from\('device_data'\)\s*\n?\s*\.select\(/gu) ?? [];
  assert.equal(remoteReads.length, 1, 'one remote read, inside bootstrapData');
  assert.match(db, /if \(local\.cards\.length === 0 && supabase && deviceId\) \{[\s\S]*?await withTimeout\(/u);

  // Restoring is a load-time decision only: no module here pushes remote data into
  // state after bootstrap, which is what would clobber newer local edits.
  for (const path of ['src/app/useAppBootstrap.ts', 'src/app/useAppPersistence.ts', 'App.tsx']) {
    assert.doesNotMatch(read(path), /device_data|\.select\(/u, `${path} must not read remote data`);
  }
});
