const AUTH_TOKEN_PATTERN = /\b(SENTRY_AUTH_TOKEN|auth[._]token)\b|[Aa]uth[Tt]oken/;

const EXCLUDED_PATHS = [
  /^\.github\//,
  /^CHANGELOG\.md$/,
];

module.exports = async function ({ fail, warn, __, ___, danger }) {
  const allChangedFiles = [
    ...danger.git.modified_files,
    ...danger.git.created_files,
  ].filter(file => !EXCLUDED_PATHS.some(pattern => pattern.test(file)));

  const flaggedFiles = [];

  for (const file of allChangedFiles) {
    try {
      const diff = await danger.git.structuredDiffForFile(file);
      if (!diff) {
        continue;
      }

      const hasAuthTokenChange = diff.chunks.some(chunk =>
        chunk.changes.some(change =>
          change.add && AUTH_TOKEN_PATTERN.test(change.content)
        )
      );

      if (hasAuthTokenChange) {
        flaggedFiles.push(file);
      }
    } catch (_error) {
      // Skip files where diff fails (e.g. binary files)
    }
  }

  if (flaggedFiles.length > 0) {
    const fileList = flaggedFiles.map(file => `- \`${file}\``).join("\n");
    warn(
      `### ⚠️ Auth token handling changes detected\n\n` +
      `This PR modifies code related to Sentry auth token handling. ` +
      `Please ensure no auth tokens are accidentally exposed or mishandled. ` +
      `See [GHSA-68c2-4mpx-qh95](https://github.com/getsentry/sentry-react-native/security/advisories/GHSA-68c2-4mpx-qh95) for context.\n\n` +
      `Files with auth token changes:\n${fileList}`
    );
  }
};
