#!/usr/bin/env bash

pid=$(lsof -i:8545 -sTCP:LISTEN -t); 

echo "Killing blockchain client process $pid on port 8545"
kill -TERM $pid || kill -KILL $pid
