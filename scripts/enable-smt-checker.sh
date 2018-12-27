#!/bin/bash

echo "Updating contracts with SMTChecker pragma"

for contract in contracts/*.sol
do 
  sed -i "\pragma experimental SMTChecker;" "$contract"
done