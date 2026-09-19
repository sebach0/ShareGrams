/** Imports Java ordenados y sin duplicados -- mismo criterio en todos los templates para que la salida sea determinista. */
export function renderImports(fqcns: Iterable<string>): string {
  return [...new Set(fqcns)].sort().map((fqcn) => `import ${fqcn};`).join('\n');
}

export function indent(lines: string, spaces = 4): string {
  const pad = ' '.repeat(spaces);
  return lines
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
}
