const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Helper function to create sectioned warnings
const createSectionWarning = (title, content, icon = "🤖") => {
  return `### ${icon} ${title}\n\n${content}\n`;
};

function aptInstall(package) {
  execSync(`sudo apt-get install -y ${package}`);
}

function whichExists(package) {
  try {
    execSync(`which ${package}`);
    warn(`${package} exists`);
    return true;
  } catch (error) {
    warn(error);
  }
  return false;
}

function aptInstallIfNotExists() {
  whichExists('vi');
  if (!whichExists('curl')) {
    aptInstall('curl');
  }
  if (!whichExists('unzip')) {
    aptInstall('unzip');
  }
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

module.exports = async function ({ _, warn, __, ___, danger }) {
  const replayJarChanged = danger.git.modified_files.includes(
    "packages/core/android/libs/replay-stubs.jar"
  );

  if (!replayJarChanged) {
    console.log("replay-stubs.jar not changed, skipping check.");
    return;
  }
  aptInstallIfNotExists();

  console.log("Running replay stubs check...");

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


  try {
    const baseJarUrl = `https://github.com/getsentry/sentry-react-native/raw/${baseRef}/packages/core/android/libs/replay-stubs.jar`;
    console.log(`Downloading baseline jar from: ${baseJarUrl}`);
    execSync(`curl -L -o "${baseJarPath}" "${baseJarUrl}"`);
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
  const newListing = execFileSync("ls", ["-lR", newSrc]).toString();
  const oldListing = execFileSync("ls", ["-lR", oldSrc]).toString();

  // Remove timestamps for structural comparison (keep only file types, names, sizes, permissions)
  const normalizeListing = (listing) => {
    return listing
      .split('\n')
      .map(line => {
        if (!line.trim()) return line;

        if (line.includes(':')) {
          return line;
        }

        return line.replace(/\s+\w{3}\s+\d{1,2}\s+\d{1,2}:\d{2}/, ' [TIMESTAMP]');
      })
      .join('\n');
  };

  const normalizedNew = normalizeListing(newListing);
  const normalizedOld = normalizeListing(oldListing);

  console.log('Normalized listings comparison...');

  if (normalizedNew !== normalizedOld) {
    // Structural changes detected
    const diff = execFileSync("diff", ["-u", "--", oldSrc, newSrc]).toString();
    warn(createSectionWarning("Replay Stubs Check", `🚨 **Structural changes detected** in replay-stubs.jar:\n\`\`\`diff\n${diff}\n\`\`\``));
  } else {
    // Only timestamps changed - check if it's just rebuild artifacts
    const originalNew = newListing;
    const originalOld = oldListing;

    if (originalNew !== originalOld) {
      console.log("✅ Structure unchanged, but timestamps differ.");
      warn(createSectionWarning("Replay Stubs Check", `📅 Only file timestamps were updated in replay-stubs.jar. This typically indicates a rebuild without structural changes.\n\n💡 **No action required** - this is likely just compilation artifacts.`));
    } else {
      console.log("✅ replay-stubs.jar completely unchanged.");
    }
  }
};

