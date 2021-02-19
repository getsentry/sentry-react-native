const PR_NUMBER = danger.github.pr.number;
const PR_URL = danger.github.pr.html_url;

function getCleanTitle() {
  const title = danger.github.pr.title;
  return title.split(": ").slice(-1)[0].trim().replace(/\.+$/, "");
}

function getChangelogDetails() {
  return `
<details>
<summary><b>Instructions and example for changelog</b></summary>

Please add an entry to \`CHANGELOG.md\` to the "Unreleased" section under the following heading:
 1. **feat**: For new user-visible functionality.
 2. **fix**: For user-visible bug fixes.
 3. **ref**: For features, refactors and bug fixes in internal operations.

To the changelog entry, please add a link to this PR (consider a more descriptive message):

\`\`\`md
- ${getCleanTitle()}. (${PR_NUMBER})
\`\`\`

If none of the above apply, you can opt out by adding _#skip-changelog_ to the PR description.

</details>
`;
}

async function containsChangelog(path) {
  const contents = await danger.github.utils.fileContents(path);
  return contents.includes(PR_NUMBER);
}

async function checkChangelog() {
  const skipChangelog =
    danger.github && (danger.github.pr.body + "").includes("#skip-changelog");
  const isBot = danger.github && danger.github.pr.user.type === "Bot";

  if (skipChangelog || isBot) {
    return;
  }

  const hasChangelog = await containsChangelog("CHANGELOG.md");

  if (!hasChangelog) {
    fail("Please consider adding a changelog entry for the next release.");
    markdown(getChangelogDetails());
  }
}

async function checkIfFeature() {
  const title = danger.github.pr.title;
  if(title.startsWith('feat:')){
    message('Do not forget to update <a href="https://github.com/getsentry/sentry-docs">Sentry-docs</a> with your feature once the pull request gets approved.');
  }
  
}

async function checkAll() {
  // See: https://spectrum.chat/danger/javascript/support-for-github-draft-prs~82948576-ce84-40e7-a043-7675e5bf5690
  const isDraft = danger.github.pr.mergeable_state === "draft";

  if (isDraft) {
    return;
  }

  await checkIfFeature();
  await checkChangelog();
}

schedule(checkAll);
