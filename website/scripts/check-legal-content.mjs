import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredRoutes = [
  'app/[locale]/privacy/page.tsx',
  'app/[locale]/terms/page.tsx',
  'app/[locale]/licenses/page.tsx',
];
for (const route of requiredRoutes) {
  if (!existsSync(path.join(websiteRoot, route))) throw new Error(`Missing legal route: ${route}`);
}

const legalSource = readFileSync(path.join(websiteRoot, 'lib/legalContent.ts'), 'utf8');
if (legalSource.includes('重大な過失（重過失）')) {
  throw new Error('Unapproved Japanese gross-negligence wording remains.');
}
if (!legalSource.includes('故意または重大な過失による責任')) {
  throw new Error('Approved Japanese gross-negligence wording is missing.');
}
const requiredStatements = [
  'Daiki Tokumoto',
  'tokumoto.daiki.0219@gmail.com',
  'laws of Japan',
  'Kumamoto District Court',
  'Consumer Contract Act of Japan',
  '日本法に準拠',
  '熊本地方裁判所',
  '日本の消費者契約法',
  'up to 200 new High-Quality AI Voice',
  '最大200回生成',
];
for (const statement of requiredStatements) {
  if (!legalSource.includes(statement)) throw new Error(`Missing confirmed legal statement: ${statement}`);
}

const legalFiles = [
  'lib/legalContent.ts',
  'components/legal/LegalShell.tsx',
  'components/legal/LegalDocumentView.tsx',
  ...requiredRoutes,
].map(file => readFileSync(path.join(websiteRoot, file), 'utf8')).join('\n');

const placeholderPatterns = [
  /\bTBD\b/iu,
  /\bTODO\b/iu,
  /\bREPLACE[_ -]?ME\b/iu,
  /\[INSERT[^\]]*\]/iu,
  /example\.com/iu,
  /your (legal name|contact email|governing law|jurisdiction here)/iu,
];
for (const pattern of placeholderPatterns) {
  if (pattern.test(legalFiles)) throw new Error(`Legal placeholder remains: ${pattern}`);
}

const prohibitedLiabilityCaps = [
  /JPY\s*10,?000/iu,
  /10,?000\s*(?:yen|円)/iu,
  /amounts? (?:you|the user) paid[\s\S]{0,100}(?:12|twelve) months/iu,
  /(?:preceding|previous|immediately before)[\s\S]{0,40}(?:12|twelve)[ -]month/iu,
  /subscription fees? paid by (?:you|the user)/iu,
  /損害賠償責任の総額[\s\S]{0,100}上限/iu,
  /直前12か月[\s\S]{0,100}支払/iu,
];
for (const pattern of prohibitedLiabilityCaps) {
  if (pattern.test(legalFiles)) throw new Error(`Prohibited monetary liability cap remains: ${pattern}`);
}

const inventory = JSON.parse(readFileSync(path.join(websiteRoot, 'lib/generatedLicenseInventory.json'), 'utf8'));
if (!Array.isArray(inventory.packages) || inventory.packages.length === 0) throw new Error('Licence inventory is empty.');
if (!Array.isArray(inventory.notices) || inventory.notices.length === 0) throw new Error('Licence notices are empty.');
if (!Array.isArray(inventory.unresolved) || inventory.unresolved.length > 0) {
  throw new Error(`Unresolved licences remain: ${JSON.stringify(inventory.unresolved)}`);
}

const licensePageSource = readFileSync(path.join(websiteRoot, 'app/[locale]/licenses/page.tsx'), 'utf8');
const requiredProductGroups = [
  'WordPing iOS App',
  'Cloudflare API Worker',
  'WordPing Website',
];
const groupCounts = {};
for (const group of requiredProductGroups) {
  const count = inventory.packages.filter(item => item.usedBy.includes(group)).length;
  if (count === 0) throw new Error(`Licence group is empty or missing: ${group}`);
  if (!licensePageSource.includes(`label: '${group}'`)) {
    throw new Error(`Licence page does not visibly define group: ${group}`);
  }
  groupCounts[group] = count;
}
const unexpectedGroups = [...new Set(inventory.packages.flatMap(item => item.usedBy))]
  .filter(group => !requiredProductGroups.includes(group));
if (unexpectedGroups.length > 0) {
  throw new Error(`Unexpected licence product groups: ${unexpectedGroups.join(', ')}`);
}
if (!licensePageSource.includes('item.usedBy.includes(group.label)')) {
  throw new Error('Licence page is not grouping packages by their product references.');
}
if (!licensePageSource.includes('are not embedded in the WordPing iOS binary')) {
  throw new Error('Licence page must distinguish separately deployed dependencies from the iOS binary.');
}

console.log(`Legal content check passed: ${inventory.packages.length} unique packages, ${inventory.notices.length} notices, 0 unresolved.`);
for (const group of requiredProductGroups) console.log(`${group}: ${groupCounts[group]} package references.`);
