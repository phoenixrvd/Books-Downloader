const config = require("./config");

const zip_folder = require("zip-folder");

zip_folder(config.EXTENSION_PATH, "audioknigi_donloader.zip", (error) => {
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
});
