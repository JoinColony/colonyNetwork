#!/usr/bin/env bash

pid=$(lsof -i:8545 -sTCP:LISTEN -t);

if [ -z "$pid" ]; then exit; else echo "Killing blockchain client process $pid on port 8545"; fi

kill -INT $pid
