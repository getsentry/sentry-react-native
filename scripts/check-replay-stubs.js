import { danger, warn } from "danger";
import { execSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";

// Create a unique comment ID for replay stub checks
const COMMENT_ID = "replay-stub-check";

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


// Cleanup handler for temporary files
function cleanup() {
  [jsDist, newSrc, oldSrc].forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

const jsDist = validatePath(path.join(process.cwd(), "js-dist"));
const newSrc = validatePath(path.join(process.cwd(), "replay-stubs-src"));
const oldSrc = validatePath(path.join(process.cwd(), "replay-stubs-old-src"));

[jsDist, newSrc, oldSrc].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});



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

console.log(`Downloading baseline jar from: ${baseJarUrl}`);
try {
  const baseJarUrl = `https://github.com/getsentry/sentry-react-native/raw/${baseRef}/packages/core/android/libs/replay-stubs.jar`;
  execSync(`curl -L -o "${baseJarPath}" "${baseJarUrl}"`);
} catch (error) {
  console.log('⚠️ Warning: Could not retrieve baseline replay-stubs.jar. Using empty file as fallback.');
  fs.writeFileSync(baseJarPath, '');
}

console.log(`Decompiling Stubs.`);
execFileSync("java", ["-jar", `${jsDist}/jd-cli.jar`, "-od", newSrc, newJarPath]);
execFileSync("java", ["-jar", `${jsDist}/jd-cli.jar`, "-od", oldSrc, baseJarPath]);

console.log(`Comparing Stubs.`);
const newListing = execFileSync("ls", ["-lR", newSrc]).toString();
const oldListing = execFileSync("ls", ["-lR", oldSrc]).toString();

if (newListing !== oldListing) {
  warn(`:robot: **Replay Stubs Check**\n\n⚠️ replay-stubs.jar changes detected. Directory listing diff:\n\`\`\`\n${oldListing}\n---\n${newListing}\n\`\`\``, COMMENT_ID);
} else {
  console.log("✅ replay-stubs.jar structure unchanged.");
  warn(`:robot: **Replay Stubs Check**\n\n✅ replay-stubs.jar structure unchanged.`, COMMENT_ID);
}
