#!/usr/bin/env bash

pid=$(lsof -i:8545 -sTCP:LISTEN -t);

if [ "$pid" ]; then
  echo "Killing blockchain client process $pid on port 8545";
  kill -INT $pid
fi

pid=$(lsof -i:8546 -sTCP:LISTEN -t);
if [ "$pid" ]; then
  echo "Killing blockchain client process $pid on port 8546";
  kill -INT $pid
fi
