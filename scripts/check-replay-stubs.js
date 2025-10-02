import { danger, warn } from "danger";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const replayJarChanged = danger.git.modified_files.includes(
  "packages/core/android/libs/replay-stubs.jar"
);

if (!replayJarChanged) {
  console.log("replay-stubs.jar not changed, skipping check.");
  return;
}


const jsDist = path.join(process.cwd(), "js-dist");
const newSrc = path.join(process.cwd(), "replay-stubs-src");
const oldSrc = path.join(process.cwd(), "replay-stubs-old-src");

[jsDist, newSrc, oldSrc].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Tool for decompiling JARs.
execSync(`curl -L -o ${jsDist}/jd-cli.zip https://github.com/intoolswetrust/jd-cli/releases/download/jd-cli-1.2.0/jd-cli-1.2.0-dist.zip`);
execSync(`unzip -o ${jsDist}/jd-cli.zip -d ${jsDist}`);

const newJarPath = path.join(jsDist, "replay-stubs.jar");
fs.copyFileSync("packages/core/android/libs/replay-stubs.jar", newJarPath);

const baseJarPath = path.join(jsDist, "replay-stubs-old.jar");
const baseJarContent = execSync(`git show ${danger.github.pr.base.ref}:packages/core/android/libs/replay-stubs.jar`);
fs.writeFileSync(baseJarPath, baseJarContent);

// Decompile both JARs
execSync(`java -jar ${jsDist}/jd-cli.jar -od ${newSrc} ${newJarPath}`);
execSync(`java -jar ${jsDist}/jd-cli.jar -od ${oldSrc} ${baseJarPath}`);

// Compare directory listings
const newListing = execSync(`ls -lR ${newSrc}`).toString();
const oldListing = execSync(`ls -lR ${oldSrc}`).toString();

if (newListing !== oldListing) {
  warn(`⚠️ replay-stubs.jar changes detected. Directory listing diff:\n\`\`\`\n${oldListing}\n---\n${newListing}\n\`\`\``);
}
