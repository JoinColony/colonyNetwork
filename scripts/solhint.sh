#!/bin/bash

for file in $(git diff --cached --name-only | grep -E '\.sol$')
do
  echo $file
  git show ":$file" > $file.staged && node_modules/.bin/solhint $file.staged # we only want to lint the staged changes, not any un-staged changes
  if [ $? -ne 0 ]; then
    echo "Solhint failed on staged file '$file'."
    rm $file.staged
    exit 1 # exit with failure status
  fi
  rm $file.staged
done