import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(websiteRoot, '..');
const outputPath = path.join(websiteRoot, 'lib', 'generatedLicenseInventory.json');

const projects = [
  { label: 'WordPing iOS App', root: repositoryRoot },
  { label: 'Cloudflare API Worker', root: path.join(repositoryRoot, 'cloudflare', 'wordping-api') },
  { label: 'WordPing Website', root: websiteRoot },
];

function packageNameFromPath(packagePath) {
  const marker = packagePath.lastIndexOf('node_modules/');
  const segments = packagePath.slice(marker + 'node_modules/'.length).split('/');
  return segments[0]?.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
}

function parentPackagePath(packagePath) {
  const marker = packagePath.lastIndexOf('/node_modules/');
  return marker === -1 ? '' : packagePath.slice(0, marker);
}

function resolveDependency(packages, requesterPath, dependencyName) {
  let current = requesterPath;
  while (true) {
    const candidate = current
      ? `${current}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    if (!current) return null;
    current = parentPackagePath(current);
  }
}

function normalizeRepository(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url;
  if (!raw) return null;
  return raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/u, '');
}

function readNotices(projectRoot, packagePath) {
  const directory = path.join(projectRoot, packagePath);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter(name => /^(licen[cs]e|copying|notice)(\..*)?$/iu.test(name))
    .flatMap(name => {
      const noticePath = path.join(directory, name);
      if (!statSync(noticePath).isFile()) return [];
      const text = readFileSync(noticePath, 'utf8').trim();
      return text ? [{ fileName: name, text }] : [];
    });
}

function readInstalledManifest(projectRoot, packagePath) {
  const manifestPath = path.join(projectRoot, packagePath, 'package.json');
  if (!existsSync(manifestPath)) return {};
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return {};
  }
}

function installedLicense(manifest) {
  if (typeof manifest.license === 'string') return manifest.license.trim();
  const legacy = manifest.licenses;
  if (typeof legacy === 'string') return legacy.trim();
  if (Array.isArray(legacy)) {
    return legacy
      .map(item => typeof item === 'string' ? item : item?.type)
      .filter(Boolean)
      .join(' OR ');
  }
  return '';
}

const packageMap = new Map();
const noticeMap = new Map();
const unresolvedMap = new Map();

for (const project of projects) {
  const manifest = JSON.parse(readFileSync(path.join(project.root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(project.root, 'package-lock.json'), 'utf8'));
  const packages = lock.packages ?? {};
  const queue = Object.keys(manifest.dependencies ?? {})
    .map(name => resolveDependency(packages, '', name))
    .filter(Boolean);
  const visited = new Set();

  while (queue.length > 0) {
    const packagePath = queue.shift();
    if (!packagePath || visited.has(packagePath)) continue;
    visited.add(packagePath);
    const entry = packages[packagePath];
    if (!entry) continue;

    const name = entry.name ?? packageNameFromPath(packagePath);
    const version = entry.version ?? 'unknown';
    const key = `${name}@${version}`;
    const installedManifest = readInstalledManifest(project.root, packagePath);
    const license = typeof entry.license === 'string'
      ? entry.license.trim()
      : installedLicense(installedManifest);
    const notices = readNotices(project.root, packagePath);
    const noticeIds = notices.map(({ fileName, text }) => {
      const id = createHash('sha256').update(text).digest('hex').slice(0, 16);
      if (!noticeMap.has(id)) noticeMap.set(id, { id, fileName, text });
      return id;
    });

    const existing = packageMap.get(key);
    if (existing) {
      existing.usedBy = [...new Set([...existing.usedBy, project.label])].sort();
      existing.noticeIds = [...new Set([...existing.noticeIds, ...noticeIds])].sort();
    } else {
      packageMap.set(key, {
        name,
        version,
        license: license || null,
        homepage: entry.homepage ?? installedManifest.homepage ?? null,
        repository: normalizeRepository(entry.repository ?? installedManifest.repository),
        npm: `https://www.npmjs.com/package/${name}/v/${version}`,
        usedBy: [project.label],
        noticeIds: [...new Set(noticeIds)].sort(),
      });
    }

    if (!license || /^(unknown|unlicensed)$/iu.test(license)) {
      unresolvedMap.set(key, { name, version, reason: 'No licence metadata in the production lockfile.' });
    } else if (/^see license in /iu.test(license) && notices.length === 0) {
      unresolvedMap.set(key, { name, version, reason: `Referenced licence file was not found (${license}).` });
    }

    const dependencyNames = new Set([
      ...Object.keys(entry.dependencies ?? {}),
      ...Object.keys(entry.optionalDependencies ?? {}),
      ...Object.keys(entry.peerDependencies ?? {}).filter(
        peer => entry.peerDependenciesMeta?.[peer]?.optional !== true,
      ),
    ]);
    for (const dependencyName of dependencyNames) {
      const resolved = resolveDependency(packages, packagePath, dependencyName);
      if (resolved) queue.push(resolved);
    }
  }
}

const inventory = {
  schemaVersion: 1,
  generatedFrom: projects.map(project => ({
    project: project.label,
    lockfile: path.relative(repositoryRoot, path.join(project.root, 'package-lock.json')),
  })),
  packages: [...packageMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name) || a.version.localeCompare(b.version)),
  notices: [...noticeMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  unresolved: [...unresolvedMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name) || a.version.localeCompare(b.version)),
};

writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`Generated ${inventory.packages.length} package records and ${inventory.notices.length} unique notices.`);
console.log(`Unresolved licences: ${inventory.unresolved.length}.`);
if (inventory.unresolved.length > 0) process.exitCode = 2;
