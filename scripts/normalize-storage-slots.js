#!/usr/bin/env node

/* eslint-disable no-param-reassign */

const fs = require("fs");
const path = require("path");

function normalize(input, types) {
  // For every object in the input, array, recursively remove the astId key
  if (Array.isArray[input]) {
    return input.map((x) => {
    for (const key of Object.keys(x)) { // eslint-disable-line
        if (key === "astId") {
          delete x[key];
        }
        if (["type", "key", "value", "base"].includes(key)) {
          if (Object.keys(types).includes(x[key])) {
            x[key] = types[x[key]];
          }
        }
        if (Array.isArray(x[key])) {
          x[key] = normalize(x[key], types);
        }
        if (typeof x[key] === "object") {
          x[key] = normalize(x[key], types);
        }
      }
      return x;
    });
  }
  if (typeof input === "object") {
    for (const key of Object.keys(input)) { // eslint-disable-line
      if (key === "astId") {
        delete input[key];
      }
      if (["type", "key", "value", "base"].includes(key)) {
        if (Object.keys(types).includes(input[key])) {
          input[key] = types[input[key]];
        }
      }
      if (Array.isArray(input[key])) {
        input[key] = normalize(input[key], types);
      }
      if (typeof input[key] === "object") {
        input[key] = normalize(input[key], types);
      }
    }
    return input;
  }
  throw new Error("Invalid input");
}

async function normalizeFile(filepath) {
  // Load the json
  const d = fs.readFileSync(filepath);

  const input = JSON.parse(d);
  while (JSON.stringify(input.storage) !== JSON.stringify(normalize(input.storage, input.types))) {
    input.storage = normalize(input.storage, input.types);
  }
  // only save storage key back to file
  delete input.types;
  const destination = filepath.replace(".storage-layouts", ".storage-layouts-normalized");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(input, null, 2));
}

async function main() {
  // get path to storage layouts from this directory

  const files = await fs.readdirSync(path.resolve(__dirname, "../.storage-layouts"), { recursive: true });
  for (const file of files) { // eslint-disable-line
    if (file.endsWith("json")) {
      console.log(`Normalising ${file}`);
      await normalizeFile(path.resolve(__dirname, "../.storage-layouts", file));
    }
  }
}

main();
