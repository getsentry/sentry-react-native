const PR_NUMBER = danger.github.pr.number;
const PR_URL = danger.github.pr.html_url;
const PR_LINK = `[#${PR_NUMBER}](${PR_URL})`;

function getCleanTitle() {
  const title = danger.github.pr.title;
  return title.split(": ").slice(-1)[0].trim().replace(/\.+$/, "");
}

function getChangelogDetails() {
  return `
<details>
<summary><b>Instructions and example for changelog</b></summary>

Please add an entry to \`CHANGELOG.md\` to the "Unreleased" section under the following heading:
 1. **Feat**: For new user-visible functionality.
 2. **Fix**: For user-visible bug fixes.
 3. **Ref**: For features, refactory and bug fixes in internal operation.

To the changelog entry, please add a link to this PR (consider a more descriptive message):

\`\`\`md
- ${getCleanTitle()}. (${PR_LINK})
\`\`\`

If none of the above apply, you can opt out by adding _#skip-changelog_ to the PR description.

</details>
`;
}

async function containsChangelog(path) {
  const contents = await danger.github.utils.fileContents(path);
  return contents.includes(PR_LINK);
}

async function checkChangelog() {
  const skipChangelog =
    danger.github && (danger.github.pr.body + "").includes("#skip-changelog");

  if (skipChangelog) {
    return;
  }

  const hasChangelog = await containsChangelog("CHANGELOG.md");

  if (!hasChangelog) {
    fail("Please consider adding a changelog entry for the next release.");
    markdown(getChangelogDetails());
  }
}


async function checkAll() {
  // See: https://spectrum.chat/danger/javascript/support-for-github-draft-prs~82948576-ce84-40e7-a043-7675e5bf5690
  const isDraft = danger.github.pr.mergeable_state === "draft";

  if (isDraft) {
    return;
  }

  await checkChangelog();
}

schedule(checkAll);