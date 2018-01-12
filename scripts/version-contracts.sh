#!/usr/bin/env bash

version="$(grep 'function version() public pure returns (uint256) { return ' ./contracts/Colony.sol | sed 's/function version() public pure returns (uint256) { return //' | sed 's/; }//' | sed 's/ //g')"
echo "Current Colony contract version is $version"
mv ./build/contracts/Colony.json ./build/contracts/Colony_${version}.json