const typescriptEntries = [
  "static/scripts/app.ts",
  "static/scripts/audit.ts",
  "static/scripts/secret-compact.ts",
  "static/scripts/secret.ts",
  "static/scripts/keygen.ts",
];
const CSSEntries = ["static/styles/app.css", "static/styles/audit.css", "static/styles/sec.css"];
export const entries = [...typescriptEntries, ...CSSEntries];
