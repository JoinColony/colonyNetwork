# Colony Network contracts
## Install

```
git clone https://github.com/JoinColony/colonyNetwork.git
yarn --pure-lockfile
```

## Contracts
CommonColony.sol
Colony.sol

## Libraries
ColonyLibrary.sol
SecurityLibrary.sol
TaskLibrary.sol
TokenLibrary.sol

## Testing
See available commands and description via `gulp help`

To run all tests:
```
gulp test:contracts
```
To run tests with code coverage using [solidity-coverage](https://github.com/sc-forks/solidity-coverage):
```
gulp test:contracts:coverage
```
To run gas costs tests:
```
gulp test:contracts:gasCosts
```
To lint contracts using [Solium](https://github.com/duaraghav8/Solium)
```
gulp lint:contracts
```
## Workflow
Current Colony Beta product is integrated in `master` branch, which is used in `colonyDapp` repo. 
The new release implementing the whitepaper is integrated in `develop` branch. 
Changes in `master` are not necessarity reverse integrated in `develop` as contract architecture will potentially differ significantly.

The rest of the workflow follows `git-flow` similarly to `colonyDapp`, namely:
Which branch should be used for bringing forth production releases? - [master]
Which branch should be used for integration of the "next release"? [develop]
How to name your supporting branch prefixes?
Feature branches? [feature/] 
Release branches? [release/] 
Hotfix branches? [hotfix/] 
Support branches? [support/] 
Version tag prefix? [] 
