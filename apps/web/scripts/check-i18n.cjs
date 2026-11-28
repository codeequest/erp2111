/**
 * Checks that every text shown in the web app has an Arabic translation.
 *
 *   node scripts/check-i18n.cjs          → lists missing translations (exit 1 if any)
 *   node scripts/check-i18n.cjs --keys   → prints every key as JSON
 *
 * Keys are: the first argument of every tr('...') call, the menu labels from
 * @erp/shared NAVIGATION, and the values of the label maps listed in MAPS
 * (they are translated where they are displayed: tr(MAP[x])).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC = path.join(__dirname, '..', 'src');
const MAPS = new Set(['MOVE_TYPE_LABEL', 'FIELD_LABELS', 'ACTION_LABELS']);

const keys = new Map(); // key → first place it is used
const add = (k, where) => {
  if (!keys.has(k)) keys.set(k, where);
};

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.tsx?$/.test(e.name) && !/i18n-ar\.ts$/.test(e.name)) scan(f);
  }
}

function scan(file) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  (function visit(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr') {
      const a = n.arguments[0];
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) add(a.text, where(n));
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && MAPS.has(n.name.text) && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) add(p.initializer.text, where(p));
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
}

walk(SRC);
const { NAVIGATION } = require('@erp/shared');
for (const m of NAVIGATION) {
  add(m.label, 'navigation');
  add(m.description, 'navigation');
  for (const i of m.items) {
    add(i.label, 'navigation');
    add(i.description, 'navigation');
  }
}

if (process.argv.includes('--keys')) {
  console.log(JSON.stringify([...keys.keys()], null, 1));
  process.exit(0);
}

// Read the dictionary without compiling it: it is a plain object of string pairs.
const dictSource = fs.readFileSync(path.join(SRC, 'lib', 'i18n-ar.ts'), 'utf8');
const dictFile = ts.createSourceFile('ar.ts', dictSource, ts.ScriptTarget.Latest, true);
const ar = new Map();
(function visit(n) {
  if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name) || ts.isIdentifier(n.name)) && ts.isStringLiteral(n.initializer)) {
    ar.set(n.name.text, n.initializer.text);
  }
  ts.forEachChild(n, visit);
})(dictFile);

const missing = [...keys].filter(([k]) => !ar.has(k));
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
const badParams = [...keys.keys()].filter((k) => ar.has(k) && placeholders(k) !== placeholders(ar.get(k)));
const unused = [...ar.keys()].filter((k) => !keys.has(k));

if (unused.length) console.log(`(${unused.length} translation(s) no longer used)`);
if (badParams.length) console.log('Placeholders differ:\n' + badParams.map((k) => `  "${k}" → "${ar.get(k)}"`).join('\n'));
if (missing.length) console.log(`Missing Arabic for ${missing.length} text(s):\n` + missing.map(([k, w]) => `  ${w}  "${k}"`).join('\n'));
if (missing.length || badParams.length) process.exit(1);
console.log(`OK: ${keys.size} texts, all translated.`);
