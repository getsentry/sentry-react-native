# CI inner working

## `ready-to-merge` label

CI checks are great, but macOS runners are limited on every provider, because of this, we need to be smarter on how we run jobs.
To avoid running many jobs on every PR's commit, we have decided to only run a subset of tests regularily and run the full suite only when the PR has the label `ready-to-merge`.

### How to use the gate

Add this job at the start the workflow and then add `need: ready-to-merge-gate` to jobs that you want to be skipped.

```
ready-to-merge-gate:
  name: Ready-to-merge gate
  uses: ./.github/workflows/ready-to-merge-workflow.yml
  with:
    is-pr: ${{ github.event_name == 'pull_request' }}
    labels: ${{ toJson(github.event.pull_request.labels) }}
```

This job will:

- Pass if the event is not a PR
- Fail if the event is a PR and is missing the `ready-to-merge` label
- Pass if the event is a PR and is has the `ready-to-merge` label
