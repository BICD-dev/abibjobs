import fs from "fs";
const [file, pathKey] = process.argv.slice(2);
if (!file) {
  process.stdout.write("");
  process.exit(0);
}
let v;
try {
  v = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  v = fs.readFileSync(file, "utf8");
}
if (pathKey) {
  for (const k of pathKey.split(".")) {
    if (v == null) break;
    v = v[k];
  }
}
if (v === undefined || v === null) {
  process.stdout.write("");
} else if (typeof v === "object") {
  process.stdout.write(JSON.stringify(v));
} else {
  process.stdout.write(String(v));
}
process.exit(0);