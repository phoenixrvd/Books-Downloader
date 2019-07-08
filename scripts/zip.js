const config = require('./config');

const zip_folder = require('zip-folder');

zip_folder(config.EXTENSION_PATH, `audioknigi_donloader.zip`, function(err) {
    if(err) {
        console.error(err);
    }
});


