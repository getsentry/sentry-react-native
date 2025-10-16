const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const createSectionWarning = (title, content, icon = "🤖") => {
  return `### ${icon} ${title}\n\n${content}\n`;
};

function validatePath(dirPath) {
  const resolved = path.resolve(dirPath);
  const cwd = process.cwd();
  if (!resolved.startsWith(cwd)) {
    throw new Error(`Invalid path: ${dirPath} is outside working directory`);
  }
  return resolved;
}

function getFilesSha(dirPath, prefix = '') {
  const crypto = require('crypto');
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.join(prefix, entry.name);

    if (entry.isDirectory()) {
      results.push(...getFilesSha(fullPath, relativePath).split('\n').filter(Boolean));
    } else if (entry.isFile()) {
      const fileContent = fs.readFileSync(fullPath, 'utf8');
      const hash = crypto.createHash('sha256').update(fileContent).digest('hex');
      results.push(`${relativePath} : ${hash}`);
    }
  }
  return results.sort().join('\n');
}

function getStubDiffMessage(oldHashMap, newHashMap, oldSrc, newSrc) {
  let fileDiffs = [];

  // Check for added, removed, and modified files
  const allFiles = new Set([...oldHashMap.keys(), ...newHashMap.keys()]);

  for (const file of allFiles) {
    const oldHash = oldHashMap.get(file);
    const newHash = newHashMap.get(file);

    if (!oldHash && newHash) {
      // File added
      fileDiffs.push(`**Added:** \`${file}\``);
      const newFilePath = path.join(newSrc, file);
      if (fs.existsSync(newFilePath)) {
        const content = fs.readFileSync(newFilePath, 'utf8');
        fileDiffs.push('```java\n' + content + '\n```\n');
      }
    } else if (oldHash && !newHash) {
      // File removed
      fileDiffs.push(`**Removed:** \`${file}\``);
      const oldFilePath = path.join(oldSrc, file);
      if (fs.existsSync(oldFilePath)) {
        const content = fs.readFileSync(oldFilePath, 'utf8');
        fileDiffs.push('```java\n' + content + '\n```\n');
      }
    } else if (oldHash !== newHash) {
      // File modified - show diff
      fileDiffs.push(`**Modified:** \`${file}\``);
      const oldFilePath = path.join(oldSrc, file);
      const newFilePath = path.join(newSrc, file);

      // Create temp files for diff if originals don't exist
      const oldExists = fs.existsSync(oldFilePath);
      const newExists = fs.existsSync(newFilePath);

      if (oldExists && newExists) {
        try {
          const diff = execFileSync("diff", ["-u", oldFilePath, newFilePath], { encoding: 'utf8' });
          fileDiffs.push('```diff\n' + diff + '\n```\n');
        } catch (error) {
          // diff returns exit code 1 when files differ
          if (error.stdout) {
            fileDiffs.push('```diff\n' + error.stdout + '\n```\n');
          } else {
            fileDiffs.push('_(Could not generate diff)_\n');
          }
        }
      } else {
        fileDiffs.push(`_(File missing: old=${oldExists}, new=${newExists})_\n`);
      }
    }
  }

  return fileDiffs.join('\n');
}

module.exports = async function ({ fail, warn, __, ___, danger }) {
  const replayJarChanged = danger.git.modified_files.includes(
    "packages/core/android/libs/replay-stubs.jar"
  );

  if (!replayJarChanged) {
    console.log("replay-stubs.jar not changed, skipping check.");
    return;
  }

  console.log("Running replay stubs check...");

  const jsDist = validatePath(path.join(process.cwd(), "js-dist"));
  const newSrc = validatePath(path.join(process.cwd(), "replay-stubs-src"));
  const oldSrc = validatePath(path.join(process.cwd(), "replay-stubs-old-src"));

  [jsDist, newSrc, oldSrc].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  // Cleanup handler for temporary files (defined inside so it has access to the variables)
  const cleanup = () => {
    [jsDist, newSrc, oldSrc].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Tool for decompiling JARs.
  execFileSync("curl", ["-L", "-o", `${jsDist}/jd-cli.zip`, "https://github.com/intoolswetrust/jd-cli/releases/download/jd-cli-1.2.0/jd-cli-1.2.0-dist.zip"]);
  execFileSync("unzip", ["-o", `${jsDist}/jd-cli.zip`, "-d", jsDist]);

  const newJarPath = path.join(jsDist, "replay-stubs.jar");
  fs.copyFileSync("packages/core/android/libs/replay-stubs.jar", newJarPath);

  const baseJarPath = path.join(jsDist, "replay-stubs-old.jar");

  // Validate git ref to prevent command injection
  const baseRef = danger.github.pr.base.ref;
  if (!/^[a-zA-Z0-9/_-]+$/.test(baseRef)) {
    throw new Error(`Invalid git ref: ${baseRef}`);
  }

  try {
    const baseJarUrl = `https://github.com/getsentry/sentry-react-native/raw/${baseRef}/packages/core/android/libs/replay-stubs.jar`;
    console.log(`Downloading baseline jar from: ${baseJarUrl}`);
    execFileSync("curl", ["-L", "-o", baseJarPath, baseJarUrl]);
  } catch (error) {
    console.log('⚠️ Warning: Could not retrieve baseline replay-stubs.jar. Using empty file as fallback.');
    fs.writeFileSync(baseJarPath, '');
  }

  const newJarSize = fs.statSync(newJarPath).size;
  const baseJarSize = fs.existsSync(baseJarPath) ? fs.statSync(baseJarPath).size : 0;

  console.log(`File sizes - New: ${newJarSize} bytes, Baseline: ${baseJarSize} bytes`);

  if (baseJarSize === 0) {
    console.log('⚠️ Baseline jar is empty, skipping decompilation comparison.');
    warn(createSectionWarning("Replay Stubs Check", "⚠️ Could not retrieve baseline replay-stubs.jar for comparison. This may be the first time this file is being added."));
    return;
  }

  console.log(`Decompiling Stubs.`);
  try {
    execFileSync("java", ["-jar", `${jsDist}/jd-cli.jar`, "-od", newSrc, newJarPath]);
    execFileSync("java", ["-jar", `${jsDist}/jd-cli.jar`, "-od", oldSrc, baseJarPath]);
  } catch (error) {
    console.log('Error during decompilation:', error.message);
    warn(createSectionWarning("Replay Stubs Check", `❌ Error during JAR decompilation: ${error.message}`));
    return;
  }

  console.log(`Comparing Stubs.`);

  // Get complete directory listings with all details
  const newListing = getFilesSha(newSrc);
  const oldListing = getFilesSha(oldSrc);

  if (oldListing !== newListing) {
    // Structural changes detected - show actual file diffs
    console.log("🚨 Structural changes detected in replay-stubs.jar");

    const oldHashes = oldListing.split('\n').filter(Boolean);
    const newHashes = newListing.split('\n').filter(Boolean);

    // Parse hash listings into maps
    const oldHashMap = new Map(oldHashes.map(line => {
      const [file, hash] = line.split(' : ');
      return [file, hash];
    }));

    const newHashMap = new Map(newHashes.map(line => {
      const [file, hash] = line.split(' : ');
      return [file, hash];
    }));

    let diffMessage = '🚨 **Structural changes detected** in replay-stubs.jar:\n\n'
      + getStubDiffMessage(oldHashMap, newHashMap, oldSrc, newSrc);

    warn(createSectionWarning("Replay Stubs Check", diffMessage));
  } else {
    console.log("✅ replay-stubs.jar content is identical (same SHA-256 hashes)");
    warn(createSectionWarning("Replay Stubs Check", `✅ **No changes detected** in replay-stubs.jar\n\nAll file contents are identical (verified by SHA-256 hash comparison).`));
  }
};

