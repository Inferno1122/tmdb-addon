// scripts/generateManifest.js
const fs = require("fs");
const path = require("path");
const { getManifest } = require("../addon/lib/getManifest");

async function main() {
  const manifest = await getManifest({});
  const out = path.join(__dirname, "../dist/manifest.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
  console.log("✔ Manifest written to dist/manifest.json");
}

main().catch((err) => {
  console.error("✖ Manifest generation failed:", err);
  process.exit(1);
});
