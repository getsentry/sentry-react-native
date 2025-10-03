const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Helper function to create sectioned warnings
const createSectionWarning = (title, content, icon = "🤖") => {
  return `### ${icon} ${title}\n\n${content}\n`;
};

// Detect and use appropriate package manager
function detectPackageManager() {
  try {
    execSync('which apk', { stdio: 'ignore' });
    return 'apk';
  } catch {
    try {
      execSync('which apt-get', { stdio: 'ignore' });
      return 'apt-get';
    } catch {
      try {
        execSync('which yum', { stdio: 'ignore' });
        return 'yum';
      } catch {
        return null;
      }
    }
  }
}

function installPackage(package) {
  const pm = detectPackageManager();
  if (!pm) {
    throw new Error(`No package manager found, skipping ${package} installation`);
  }

  try {
    let cmd;
    switch (pm) {
      case 'apk':
        cmd = `apk add --no-cache ${package}`;
        break;
      case 'apt-get':
        // Handle Debian Buster EOL repositories
        cmd = `apt-get update -o Acquire::Check-Valid-Until=false -o Acquire::Check-Date=false && apt-get install -y ${package}`;
        break;
      case 'yum':
        cmd = `yum install -y ${package}`;
        break;
    }
    execSync(cmd);
    console.log(`Installed ${package} using ${pm}`);
  } catch (error) {
    console.log(`Failed to install ${package} using ${pm}:`, error.message);
    // Try alternative approach for Debian Buster
    if (pm === 'apt-get') {
      try {
        console.log(`Trying alternative installation for ${package}...`);
        execSync(`apt-get install -y --allow-unauthenticated ${package}`);
        console.log(`Installed ${package} using fallback method`);
      } catch (fallbackError) {
        console.log(`Fallback installation also failed for ${package}:`, fallbackError.message);
        throw fallbackError;
      }
    } else {
      throw error;
    }
  }
}

function whichExists(package) {
  try {
    execSync(`which ${package}`, { stdio: 'ignore' });
    console.log(`${package} exists`);
    return true;
  } catch (error) {
    return false;
  }
}

function ensurePackages() {
  console.log(`Checking required packages...`);

  // Check if all required packages are already available
  const requiredPackages = ['curl', 'unzip', 'java'];
  const missingPackages = requiredPackages.filter(pkg => !whichExists(pkg));

  if (missingPackages.length === 0) {
    console.log('All required packages are already available');
    return;
  }

  console.log(`Missing packages: ${missingPackages.join(', ')}`);

  // Try to detect OS and use appropriate package names
  let javaPackage = 'openjdk11-jre';
  try {
    const osRelease = execSync('cat /etc/os-release', { encoding: 'utf8' });
    if (osRelease.includes('Alpine')) {
      javaPackage = 'openjdk11-jre';
    } else if (osRelease.includes('Ubuntu') || osRelease.includes('Debian')) {
      javaPackage = 'openjdk-11-jre-headless';
    } else {
      javaPackage = 'java-11-openjdk';
    }
  } catch {
    // Fallback to default
  }

  // Install missing packages
  if (missingPackages.includes('curl')) {
    try {
      installPackage('curl');
    } catch (error) {
      console.log('curl installation failed, continuing without it');
    }
  }

  if (missingPackages.includes('unzip')) {
    try {
      installPackage('unzip');
    } catch (error) {
      console.log('unzip installation failed, continuing without it');
    }
  }

  if (missingPackages.includes('java')) {
    try {
      installPackage(javaPackage);
    } catch (error) {
      console.log('java installation failed, continuing without it');
    }
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

  // Debug: Check what's available in the container
  try {
    console.log('=== Container Debug Info ===');
    console.log('OS Release:', execSync('cat /etc/os-release', { encoding: 'utf8' }));
    console.log('Available package managers:');
    ['apk', 'apt-get', 'yum', 'dnf', 'pacman'].forEach(pm => {
      try {
        execSync(`which ${pm}`, { stdio: 'ignore' });
        console.log(`✓ ${pm} found`);
      } catch {
        console.log(`✗ ${pm} not found`);
      }
    });
    console.log('===========================');
  } catch (error) {
    console.log('Debug info failed:', error.message);
  }

  // Ensure required packages are available in Docker container
  ensurePackages();

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

