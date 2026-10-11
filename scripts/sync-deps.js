const fs = require("fs");
const path = require("path");

// Content scripts cannot resolve node_modules at runtime, so ship the npm bundle.
fs.copyFileSync(
  require.resolve("crypto-js/crypto-js"),
  path.join(__dirname, "../extension/js/content/crypto-js.js"),
);
