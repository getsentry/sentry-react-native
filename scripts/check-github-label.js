module.exports = async function ({ fail, warn, __, ___, danger }) {
  console.log(JSON.stringify(danger));
  const isReadyForReview = danger.github.event.pull_request?.draft === false;
  const isReeadyForMerge = danger.github.issue.labels.some(label => label.name === 'ready-for-merge');
  if (isReadyForReview && !isReeadyForMerge) {
    fail('Pull request is not ready for merge, please add the "ready-for-merge" label to the pull request');
  }
  else if (!isReadyForReview) {
    warn('Pull request is a draft, please add the "ready-for-merge" label to the pull request when it is ready for review');
  }
};
