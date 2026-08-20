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
  // The failure path must NOT open it. This assertion previously required the
  // opposite — "a bootstrap error cannot disable saving" — which is precisely
  // what turned a transient read failure into permanent data loss: `cards` is []
  // after a failed read, and the next persist writes that empty array as the
  // complete card list. Availability is not worth the user's vocabulary.
  assert.match(bootstrap, /hasLoaded\.current = readSucceeded;/u);
  assert.match(bootstrap, /cardsLoaded: MutableRefObject<boolean>;/u);

  // Card and folder writes use the earlier gate; UI preferences keep the later one,
  // since those are only read in Phase 2 and would otherwise persist their defaults.
  assert.match(persistence, /if \(!cardsLoaded\.current\) return;\s*persist\(\{ cards/u);
  assert.match(persistence, /if \(!cardsLoaded\.current\) return;\s*foldersRef\.current = folders;/u);
  assert.match(persistence, /if \(!hasLoaded\.current\) return;\s*AsyncStorage\.setItem\(SHOW_FULL_CARD_KEY/u);
});

test('vocabulary data is local-only and never waits on the network', () => {
  const db = read('src/lib/db.ts');

  // persist() and persistFolders() both feed one queued transaction, so a word
  // created alongside a brand-new folder satisfies its foreign key.
  assert.match(db, /pendingCards = data\.cards;/u);
  assert.match(db, /pendingFolders = folders;/u);
  assert.match(db, /\.\.\.\(folders !== null \? \{ folders \} : \{\}\),\s*\.\.\.\(cards !== null \? \{ cards \} : \{\}\)/u);

  // Nothing in the local data path can fail because the device is offline.
  for (const path of [
    'src/lib/db.ts',
    'src/lib/sqlite/repositories.ts',
    'src/lib/sqlite/legacyMigration.ts',
    'src/app/useAppBootstrap.ts',
    'src/app/useAppPersistence.ts',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /\bfetch\(/u, `${path} must not make a network request`);
  }
});

test('the app depends on no hosted backend or auth provider', () => {
  // WordPing has no accounts and no server-side copy of user data. The only
  // backend is the stateless AI proxy in cloudflare/wordping-api, which the app
  // reaches through src/lib/api/client.ts and nothing else.
  const pkg = JSON.parse(read('package.json'));
  const installed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  for (const forbidden of [
    '@supabase/supabase-js', 'firebase', '@aws-amplify/core',
    'appwrite', 'pocketbase', '@auth0/auth0-react',
  ]) {
    assert.ok(!installed.includes(forbidden), `${forbidden} must not be a dependency`);
  }

  // api/client.ts owns every outbound request, so a second fetch caller would be
  // a network path outside the timeout, error-mapping and identity rules.
  const clientSource = read('src/lib/api/client.ts');
  assert.match(clientSource, /EXPO_PUBLIC_WORDPING_API_BASE_URL/u);
  assert.match(clientSource, /await fetch\(`\$\{BASE_URL\}\$\{path\}`/u);
});

test('AI requests never start during app bootstrap', () => {
  const bootstrap = read('src/app/useAppBootstrap.ts');
  // Local vocabulary must load without waiting on RevenueCat or the AI proxy.
  assert.doesNotMatch(bootstrap, /openaiGateway|api\/client|Purchases/u);

  // The API client resolves its identity lazily, on first use.
  const client = read('src/lib/api/client.ts');
  assert.match(client, /identityRequest \?\?= resolveIdentity\(\)/u);
  assert.match(client, /const identity = await getIdentity\(\);/u);
});

test('a failed data load never opens the persistence write gate', () => {
  // Regression: the finally block used to set cardsLoaded unconditionally. After
  // a failed read `cards` is [] for reasons unrelated to what is on disk, and
  // every persist writes the full array — so the first word the user added would
  // have been written as the complete card list, deleting everything else.
  const bootstrap = read('src/app/useAppBootstrap.ts');

  assert.match(bootstrap, /loadFailedRef\.current = true;/u, 'the failure path must record that the read failed');
  assert.match(
    bootstrap,
    /const readSucceeded = !loadFailedRef\.current;\s*hasLoaded\.current = readSucceeded;\s*cardsLoaded\.current = readSucceeded;\s*activeResultFiltersLoaded\.current = readSucceeded;/u,
    'all three gates must be conditional on a successful read',
  );
  assert.doesNotMatch(bootstrap, /cardsLoaded\.current = true;\s*activeResultFiltersLoaded\.current = true;/u,
    'no unconditional gate opening may remain');

  // The user has to be told, or the app silently discards what they type.
  const app = read('App.tsx');
  assert.match(app, /if \(!loadFailed\) return;\s*Alert\.alert\(t\('load_failed_title'\)/u);
});

test('a backup import cannot be overwritten by a queued write', () => {
  // Regression: restoreFromBackup wrote straight to the database. A snapshot
  // queued just before the import describes pre-import data, so flushing it
  // afterwards silently undid the restore. expo-sqlite also runs one
  // connection, so the two transactions could collide.
  const db = read('src/lib/db.ts');
  const backupFile = read('src/lib/backup/backupFile.ts');

  assert.match(db, /export async function runExclusive<T>/u);
  assert.match(db, /if \(exclusiveTask !== null\) return;/u, 'flush must stand down during an exclusive task');
  // An in-flight flush owns a transaction, so it is awaited first — but with a
  // deadline, so a wedged write cannot leave the import spinning forever.
  assert.match(db, /while \(flushActive && Date\.now\(\) < deadline\)/u);
  // Stale snapshots are dropped on success, kept on failure.
  assert.match(db, /const result = await run;[\s\S]*?pendingCards = null;\s*pendingFolders = null;\s*pendingSettings = null;/u);
  assert.match(db, /catch \(error\) \{[\s\S]*?scheduleFlush\(\);\s*throw error;/u);

  assert.match(backupFile, /return runExclusive\(\(\) => importBackup\(db, raw/u);
});
