# Contributing

The focus currently is implementing the [Colony White Paper](https://colony.io/whitepaper.pdf) which was split down in distinct chunks into the [GitHub issues tracker](https://github.com/JoinColony/colonyNetwork/issues).

Specifically we need help with the [Colony Contribute Backlog](https://github.com/JoinColony/colonyNetwork/projects/2). Items suitable for external contributors are labelled "good for collaborators".

When making a larger change, please consult with the team on [Colony Network Gitter channel](http://gitter.im/JoinColony/colonyNetwork).

## How to report issues

To report an issue, use the [GitHub issues tracker](https://github.com/JoinColony/colonyNetwork/issues).

## Workflow for Pull Requests

In order to contribute, please fork off of the `develop` branch and make your changes there. Keep your branch up to date with develop using `rebase` instead of `merge`.

We use PR-specific labels to indicate PR current status, that is: `in-progress` / `ready-for-review` / `under-review`

### Branch naming

Use the following naming schema for your PR branch: \[feature/fix/maintenance/...]/\[issue-#]-\[a-meaningful-description-in-kebab-case] e.g. `feature/84-voting-on-disputes`

### Commit messages

* The 50/72 rule. The first line should be capitalized and can go up to 50 chars, following lines should preferably be wrapped at 72
* Bullet points are good, please use indentation though. For the bullet, you can choose between asterisks or hyphens For the first line, try to be specific. e.g: "Ensure colony keys are unique" instead of "Fix a bug with contract setup" If you're adding or changing existing tests, they should go on the same commit.

### Documentation-only contributions

If changes only affect files in the `docs/` directory, skip CI builds by adding `[skip ci]` or `[ci skip]` to your commit message.

### Test coverage

When writing a new feature please ensure you write appropriate `truffle` test cases under test/. We strive for 100% test coverage for our contracts and CI works with close to 100% thresholds.

## Code of Conduct

Please note we have a [code of conduct](CODE\_OF\_CONDUCT.md), please follow it in all your interactions with the project.
