#!/bin/bash

for file in $(git diff --cached --name-only | grep -E '\.sol$')
do
  echo $file
  git show ":$file" > $file.staged.sol && npx prettier --plugin=prettier-plugin-solidity $file.staged.sol -c # we only want to lint the staged changes, not any un-staged changes
  if [ $? -ne 0 ]; then
    echo "Prettier failed on staged file '$file'."
    rm $file.staged.sol
    exit 1 # exit with failure status
  fi
  rm $file.staged.sol
done
