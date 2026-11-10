import ts from 'typescript';

/** Extract literal environment reads without inspecting runtime values. */
export function envNamesRead(source) {
  const file = ts.createSourceFile(
    'env-inventory.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  if (file.parseDiagnostics.length > 0)
    throw new Error('Cannot parse an environment inventory source file.');

  const names = new Set();
  const isEnvironment = (node) =>
    (ts.isIdentifier(node) && ['env', 'environment'].includes(node.text)) ||
    (ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process' &&
      node.name.text === 'env');
  const isLiteral = (node) =>
    node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      isEnvironment(node.initializer)
    ) {
      for (const element of node.name.elements) {
        if (element.dotDotDotToken)
          throw new Error('Cannot inventory an environment rest binding.');
        const key = element.propertyName ?? element.name;
        const literal = ts.isComputedPropertyName(key) ? key.expression : key;
        if (!ts.isIdentifier(literal) && !isLiteral(literal))
          throw new Error('Cannot inventory a computed environment binding.');
        if (ts.isComputedPropertyName(key) && !isLiteral(literal))
          throw new Error('Cannot inventory a computed environment binding.');
        names.add(literal.text);
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      isEnvironment(node.expression)
    ) {
      names.add(node.name.text);
    } else if (
      ts.isElementAccessExpression(node) &&
      isEnvironment(node.expression) &&
      isLiteral(node.argumentExpression)
    ) {
      names.add(node.argumentExpression.text);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'required' &&
      isLiteral(node.arguments[0]) &&
      /^[A-Z][A-Z0-9_]+$/.test(node.arguments[0].text)
    ) {
      names.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return names;
}
