import { danger, warn } from "danger";
import { execSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const replayJarChanged = danger.git.modified_files.includes(
  "packages/core/android/libs/replay-stubs.jar"
);

if (!replayJarChanged) {
  console.log("replay-stubs.jar not changed, skipping check.");
  process.exit(0);
}

function validatePath(dirPath) {
  const resolved = path.resolve(dirPath);
  const cwd = process.cwd();
  if (!resolved.startsWith(cwd)) {
    throw new Error(`Invalid path: ${dirPath} is outside working directory`);
  }
  return resolved;
}

const jsDist = validatePath(path.join(process.cwd(), "js-dist"));
const newSrc = validatePath(path.join(process.cwd(), "replay-stubs-src"));
const oldSrc = validatePath(path.join(process.cwd(), "replay-stubs-old-src"));

[jsDist, newSrc, oldSrc].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Cleanup handler for temporary files
function cleanup() {
  [jsDist, newSrc, oldSrc].forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Tool for decompiling JARs.
execSync(`curl -L -o ${jsDist}/jd-cli.zip https://github.com/intoolswetrust/jd-cli/releases/download/jd-cli-1.2.0/jd-cli-1.2.0-dist.zip`);
execFileSync("unzip", ["-o", `${jsDist}/jd-cli.zip`, "-d", jsDist]);

const newJarPath = path.join(jsDist, "replay-stubs.jar");
fs.copyFileSync("packages/core/android/libs/replay-stubs.jar", newJarPath);

const baseJarPath = path.join(jsDist, "replay-stubs-old.jar");

// Validate git ref to prevent command injection
const baseRef = danger.github.pr.base.ref;
if (!/^[a-zA-Z0-9/_-]+$/.test(baseRef)) {
  throw new Error(`Invalid git ref: ${baseRef}`);
}

const baseJarContent = execSync(`git show ${baseRef}:packages/core/android/libs/replay-stubs.jar`);
fs.writeFileSync(baseJarPath, baseJarContent);

// Decompile both JARs
execFileSync("java", ["-jar", `${jsDist}/jd-cli.jar`, "-od", newSrc, newJarPath]);
execFileSync("java", ["-jar", `${jsDist}/jd-cli.jar`, "-od", oldSrc, baseJarPath]);

// Compare directory listings
const newListing = execFileSync("ls", ["-lR", newSrc]).toString();
const oldListing = execFileSync("ls", ["-lR", oldSrc]).toString();

if (newListing !== oldListing) {
  warn(`⚠️ replay-stubs.jar changes detected. Directory listing diff:\n\`\`\`\n${oldListing}\n---\n${newListing}\n\`\`\``);
}
