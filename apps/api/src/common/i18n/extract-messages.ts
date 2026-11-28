import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

/**
 * Finds every message the API can send to a user, as templates:
 * `Line ${i + 1}: ${error}` becomes "Line {1}: {2}".
 *
 * Looked at:
 *  - arguments of `new XxxException(...)` (string, template, array of them, ternary)
 *  - strings pushed into arrays (`errors.push('...')`, `errors.push({ error: '...' })`)
 *  - `message: '...'` options of validation decorators and *_MESSAGE constants
 *  - strings returned by functions whose name ends in "Error" (e.g. moveLineError)
 * Used by the coverage test (messages.spec.ts) so a new message without Arabic fails.
 */
export interface FoundMessage {
  template: string;
  where: string;
}

function templateOf(node: ts.Node, sf: ts.SourceFile): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    node.templateSpans.forEach((s, i) => {
      out += `{${i + 1}}` + s.literal.text;
    });
    return out;
  }
  if (ts.isParenthesizedExpression(node)) return templateOf(node.expression, sf);
  return null;
}

/** Strings a message expression can produce (ternaries and "a" + "b" give several). */
function messagesOf(node: ts.Node, sf: ts.SourceFile): string[] {
  const t = templateOf(node, sf);
  if (t !== null) return [t];
  if (ts.isConditionalExpression(node)) return [...messagesOf(node.whenTrue, sf), ...messagesOf(node.whenFalse, sf)];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((e) => messagesOf(e, sf));
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    // "a " + `b ${x}` → one template
    const parts = [node.left, node.right].map((p) => messagesOf(p, sf));
    if (parts.every((p) => p.length === 1)) {
      let n = 0;
      return [parts.map((p) => p[0].replace(/\{\d+\}/g, () => `{${++n}}`)).join('')];
    }
    let n = 0;
    return [parts.map((p) => (p.length === 1 ? p[0] : '{x}').replace(/\{\d+\}|\{x\}/g, () => `{${++n}}`)).join('')];
  }
  return [];
}

const isSentence = (s: string) => /[a-z]{2,}/i.test(s) && /\s/.test(s.replace(/\{\d+\}/g, '')) ;

export function extractMessages(srcDir: string): FoundMessage[] {
  const found = new Map<string, string>();
  const add = (m: string, where: string) => {
    if (isSentence(m) && !found.has(m)) found.set(m, where);
  };

  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && !f.includes(`${path.sep}i18n${path.sep}`)) scan(f);
    }
  };

  const scan = (file: string) => {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const where = (n: ts.Node) =>
      `${path.relative(srcDir, file).replace(/\\/g, '/')}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const visit = (n: ts.Node): void => {
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && /Exception$/.test(n.expression.text) && n.arguments?.[0]) {
        messagesOf(n.arguments[0], sf).forEach((m) => add(m, where(n)));
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'push') {
        for (const a of n.arguments) {
          if (ts.isObjectLiteralExpression(a)) {
            for (const p of a.properties) {
              if (ts.isPropertyAssignment(p) && p.name.getText(sf) === 'error') messagesOf(p.initializer, sf).forEach((m) => add(m, where(p)));
            }
          } else messagesOf(a, sf).forEach((m) => add(m, where(n)));
        }
      }
      if (ts.isPropertyAssignment(n) && ['message', 'error'].includes(n.name.getText(sf))) {
        messagesOf(n.initializer, sf).forEach((m) => add(m, where(n)));
      }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /_MESSAGE$/.test(n.name.text) && n.initializer) {
        messagesOf(n.initializer, sf).forEach((m) => add(m, where(n)));
      }
      if (ts.isReturnStatement(n) && n.expression) {
        let fn: ts.Node | undefined = n.parent;
        while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
        const name = fn && (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name ? fn.name.getText(sf) : '';
        if (/Error$/.test(name)) messagesOf(n.expression, sf).forEach((m) => add(m, where(n)));
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  };

  walk(srcDir);
  return [...found].map(([template, where]) => ({ template, where }));
}
