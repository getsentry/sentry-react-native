async function safeRun(fnPath, { fail, warn, message, markdown, danger }) {
  const fn = require(fnPath);
  try {
    return await fn({ fail, warn, message, markdown, danger });
  } catch (error) {
    warn(`Failed to run ${fnPath}: ${error.message}`);
  }
}

module.exports = async function ({ fail, warn, message, markdown, danger }) {
  await safeRun('./check-github-label', { fail, warn, message, markdown, danger });
  await safeRun('./check-replay-stubs', { fail, warn, message, markdown, danger });
  await safeRun('./check-android-sdk-mismatch', { fail, warn, message, markdown, danger });
};
