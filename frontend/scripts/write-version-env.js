#!/usr/bin/env node
// Regenerates the NEXT_PUBLIC_APP_VERSION / NEXT_PUBLIC_APP_RELEASE_DATE lines
// in .env.local from the committed VERSION/RELEASE_DATE files, so the
// sidebar's version footer ((app)/layout.tsx) always reflects whatever was
// actually last bumped — never a hand-edited string that can go stale.
// Run before every dev/build (see package.json's pre* scripts) so a fresh
// Hostinger/EC2 deploy (which never has a pre-existing .env.local) still
// picks up the right values; VERSION/RELEASE_DATE are the only files
// bump-and-build.sh needs to keep committed for this to stay correct.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const releaseDate = fs.readFileSync(path.join(root, "RELEASE_DATE"), "utf8").trim();

const envPath = path.join(root, ".env.local");
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const keep = existing
  .split("\n")
  .filter(line => line && !line.startsWith("NEXT_PUBLIC_APP_VERSION=") && !line.startsWith("NEXT_PUBLIC_APP_RELEASE_DATE="));

const updated = [
  ...keep,
  `NEXT_PUBLIC_APP_VERSION=${version}`,
  `NEXT_PUBLIC_APP_RELEASE_DATE=${releaseDate}`
].join("\n") + "\n";

fs.writeFileSync(envPath, updated);
console.log(`== App version env written: v${version} (released ${releaseDate}) ==`);
