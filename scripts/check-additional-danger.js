module.exports = async function ({ fail, warn, message, markdown, danger}) {
  const checkGitHubLabel = require('./check-github-label');
  const checkReplayStubs = require('./check-replay-stubs');
  await checkGitHubLabel({ fail, warn, __: message, ___: markdown, danger }),
  await checkReplayStubs({ fail, warn, __: message, ___: markdown, danger })
};
