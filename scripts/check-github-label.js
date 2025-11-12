module.exports = async function ({ fail, warn, __, ___, danger }) {
  const isReeadyForMerge = danger.github.issue.labels.some(label => label.name === 'ready-for-merge');
  if (!isReeadyForMerge) {
    // Ideally we could check for `isDraft` but this information is not easily available.
    fail('Pull request is not ready for merge, please add the "ready-for-merge" label to the pull request');
  }
};
