const fs = require('fs');
const path = require('path');
const { ensurePs1Utf8Bom } = require('./powershell');

const MIRROR_VERSION = '10';

function getMirrorDir() {
  const userData = process.env.PATENT_USER_DATA;
  if (!userData) return null;
  return path.join(userData, 'skill');
}

function getSourceSkillRoot() {
  const candidates = [
    process.env.PATENT_SKILL_ROOT_SOURCE,
    process.env.PATENT_SKILL_ROOT,
    process.resourcesPath ? path.join(process.resourcesPath, 'patent-skill') : null,
    path.join(__dirname, '..', '..', '..', 'patent-draft-android'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'SKILL.md'))) return p;
  }
  return candidates[0] || null;
}

function needsMirror(skillPath) {
  if (!skillPath) return false;
  return skillPath.includes(' ') || skillPath.includes('app.asar');
}

function ensureSkillMirror() {
  const source = getSourceSkillRoot();
  const mirror = getMirrorDir();
  if (!source || !mirror) return source;

  if (!needsMirror(source) && !source.includes('app.asar')) {
    return source;
  }

  const marker = path.join(mirror, '.mirror-version');
  const srcSkill = path.join(source, 'SKILL.md');
  const mustSync = !fs.existsSync(marker)
    || fs.readFileSync(marker, 'utf8').trim() !== MIRROR_VERSION
    || !fs.existsSync(path.join(mirror, 'SKILL.md'));

  if (mustSync) {
    if (fs.existsSync(mirror)) {
      fs.rmSync(mirror, { recursive: true, force: true });
    }
    fs.mkdirSync(mirror, { recursive: true });
    fs.cpSync(source, mirror, { recursive: true, dereference: true });
    for (const rel of ['scripts', 'templates']) {
      const sub = path.join(mirror, rel);
      if (!fs.existsSync(sub)) continue;
      const walk = (d) => {
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, ent.name);
          if (ent.isDirectory()) walk(p);
          else if (ent.name.endsWith('.ps1')) ensurePs1Utf8Bom(p);
        }
      };
      walk(sub);
    }
    fs.writeFileSync(marker, MIRROR_VERSION, 'utf8');
  }

  process.env.PATENT_SKILL_ROOT = mirror;
  return mirror;
}

module.exports = { ensureSkillMirror, getMirrorDir, getSourceSkillRoot };
