const nthline = require("nthline");
const findInFiles = require("find-in-files");
const path = require("path");

// This file doesn't exist unless we've run the truffle security package of tests, so we don't expect
// it to exist while running eslint in CI
const results = require("../truffle-security-output.json"); // eslint-disable-line import/no-unresolved

let fail = false;

async function main() {
  for (let i = 0; i < results.length; i += 1) {
    const file = results[i];
    // Only process internal contracts (skip everything we import in /lib)
    if (file.filePath.indexOf("/lib/") === -1) {
      for (let j = 0; j < file.messages.length; j += 1) {
        const message = file.messages[j];
        if (message.ruleId === "N/A") {
          // It's the upgrade message, not a real error, so continue to next message
        } else {
          // Load file, looking for global disables
          const globals = await findInFiles.findSync(
            `//.*ignore-file-${message.ruleId.toLowerCase()}`,
            path.dirname(file.filePath),
            path.basename(file.filePath),
          );
          if (Object.keys(globals).length === 0) {
            // No global ignores. So let's check the specific line.
            // load relevant line from file, looking for local disables
            try {
              const line = await nthline(message.line - 1, file.filePath);
              if (line.toLowerCase().search(new RegExp(`//.*ignore-${message.ruleId.toLowerCase()}`, "g")) === -1) {
                fail = true;
                console.log("Failing file: ", file.filePath);
                console.log(message);
              }
            } catch (err) {
              console.log("ERROR:", err);
            }
          }
        }
      }
    }
  }
  process.exit(fail);
}

main();
