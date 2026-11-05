// Falha se algum arquivo-fonte tiver caracteres de controle ou marcas combinantes gravados literalmente
// (ex.: "\b" virando o caractere backspace, "\n" virando quebra de linha dentro de regex/strings).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["app", "components", "lib", "data", "hooks"];
const bad = /[\x00-\x08\x0B\x0C\x0E-\x1F\u0300-\u036F\u2028\u2029\uFEFF]/;
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      readFileSync(path, "utf8").split("\n").forEach((line, i) => {
        const m = line.match(bad);
        if (m) problems.push(`${path}:${i + 1}  caractere U+${m[0].codePointAt(0).toString(16).padStart(4, "0").toUpperCase()}`);
      });
    }
  }
}
for (const r of roots) {
  try { walk(r); } catch { /* pasta ausente */ }
}
if (problems.length) {
  console.error("Caracteres invisíveis/de controle encontrados no código (escreva o escape com barra invertida, ex.: \\b, \\n, \\u0300):\n" + problems.join("\n"));
  process.exit(1);
}
console.log("check-source: OK");
