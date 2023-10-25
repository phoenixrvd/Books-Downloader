function loadBookData(onSuccess) {

    var bookId = getBookId();

    if (typeof bookId === 'undefined') {
        return;
    }

    requestBookData(bookId, content => {
        const pageData = preparePageData(content);
        onSuccess(pageData);
    });
}

// the encryption key is taken from the webpage's js file and seems to be static
const encryptionKey = 'EKxtcg46V';

// Makes an AJAX request to get information about the book with `bookId`.
// `onSuccess` is called if the request has succeeded, its parameter is parsed JSON response.
function requestBookData(bookId, onSuccess) {
    // note: `LIVESTREET_SECURITY_KEY` is set in the HTML page and it's correlated with the user's cookie
    // the request below works because the browser sends the user's cookie along with our data
    const securityKey = retrieveWindowVariables(['LIVESTREET_SECURITY_KEY']).LIVESTREET_SECURITY_KEY;
    const encryptedHash = CryptoJS.AES.encrypt(JSON.stringify(securityKey), encryptionKey, { format:JsonFormatter }).toString();

    $.post('https://akniga.org/ajax/b/' + bookId,
        { bid: bookId, hash: encryptedHash, security_ls_key: securityKey },
        response => {
            // the response is already parsed into a JSON object, however its
            // `items` property is still a string containing more JSON data, so
            // we parse it here
            var parsedResponse = response;
            parsedResponse.items = JSON.parse(response.items);
            onSuccess(parsedResponse);
        })
}

function getBookId() {
    return $('article').attr('data-bid');
}

function getBookCover() {
    return $('article .book--cover img').attr('src')
}

function getURLs(bookId, data) {
    // now (most?) books use this newer way of getting the URL
    // for example: https://akniga.org/azimov-ayzek-mesto-gde-mnogo-vody-3
    if (data.res) {
      // this is adapted from the website's javascript code
      const fileVersion = data.version > 1 ? `&v=${data.version}` : '';
      // `JSON.parse` is needed because the encrypted url is json-encoded
      // (wrapped in quotes and contains escaped slashes)
      const fileURL = JSON.parse(
          CryptoJS.AES.decrypt(data.res, encryptionKey, { format: JsonFormatter }).toString(CryptoJS.enc.Utf8)
      ) + fileVersion;
      return [fileURL];
    }

    const baseURL = `${data.srv}b/${bookId}/${data.key}/`;

    const newURLFormat = data.slug != null;

    return newURLFormat
        // this previous "new URL format" seems to be broken because there is no
        // `key` even if there is `slug`
        // (previous example: 58 hours — https://akniga.org/tolstoy-lev-voyna-i-mir-1
        // now uses the `res` value above)
        ? [`${baseURL}${data.slug}.mp3`]
        // but some longer books use the old, multi-file format,
        // for example: 92.5 hours — https://akniga.org/zolotoy-fond-radiospektakley-chast-1-sbornik-audiospektakley
        : data.items
            .map(item => item.file)
            .nub()
            .map(file => {
                // note: filenames have a two-digit one-based index
                const index = file.toString().padStart(2, '0');
                return `${baseURL}${index}. ${data.title}.mp3`
            })
}

// Removes sequentially-duplicated values leaving only the first from each group.
// E.g. `[1, 1, 1, 2, 2, 3, 1, 4, 4].nub() == [1, 2, 3, 1, 4]`.
Array.prototype.nub = function() {
    return this.reduce(function (acc, item) {
        if (acc.length == 0) {
            return [item]
        } else {
            const previousItem = acc[acc.length - 1];
            if (item == previousItem) {
                return acc
            } else {
                return acc.concat(item)
            }
        }
    }, [])
};

function preparePageData(response) {
    const bookId = getBookId();

    const data = {
        id: bookId,
        author: (response.author || "").trim(),
        title: (response.titleonly || "").trim(),
        description: getDescriptionText(),
        metadata: getMetaData().filter(v => v),
        image: getBookCover(),
        source: response.bookurl,
        files: getURLs(bookId, response)
    };

    return data;
}

function getDescriptionTextMobile() {

    var description = $('.topic-content').clone();
    description.find('.topic-content-right,.ya-share2').remove();
    return description.text().trim();
}

function getMetaDataMobile() {

    var data = [];
    var $meta = $('.book-info');

    $meta.find('.fa').remove();
    $meta.find('.item-info').each(function(){
        var $this = $(this);
        data.push($this.text().trim().replace(/\s+/, ' '));
    });

    return data;
}

function getDescriptionText() {
    const desc = $('article .description__article-main:first()').clone();
    desc.find('div').remove();
    return desc.text().trim();
}

function getMetaData() {
    // this should select the top metadata fields (Author, Performer, Rating, Duration, optional Year)
    // except for Alternative performances
    var $about = $('.caption__article--about-block:not(.caption__article--about-block-samebook)').clone();
    $about.find('.tooltip__main').remove();
    const metadata = $about.toArray().map(div =>
        $(div).text()
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join(': ')
    );

    const classifiers = [$('article .classifiers__article-main').text().trim().replace(/ +/g, ' ')];

    return metadata.concat(classifiers);
}

if($('.layout--template-acl10-mobile').length > 0) {
    getDescriptionText = getDescriptionTextMobile;
    getMetaData = getMetaDataMobile;
}

// --8<--
// External code

// Allows the extension script to retrieve variables defined on the webpage
// where the extension is embedded.
// Source: https://stackoverflow.com/questions/3955803/chrome-extension-get-page-variables-in-content-script/24344154#24344154
function retrieveWindowVariables(variables) {
    var ret = {};

    var scriptContent = "";
    for (var i = 0; i < variables.length; i++) {
        var currVariable = variables[i];
        scriptContent += "if (typeof " + currVariable + " !== 'undefined') $('body').attr('tmp_" + currVariable + "', " + currVariable + ");\n"
    }

    var script = document.createElement('script');
    script.id = 'tmpScript';
    script.appendChild(document.createTextNode(scriptContent));
    (document.body || document.head || document.documentElement).appendChild(script);

    for (var i = 0; i < variables.length; i++) {
        var currVariable = variables[i];
        ret[currVariable] = $("body").attr("tmp_" + currVariable);
        $("body").removeAttr("tmp_" + currVariable);
    }

    $("#tmpScript").remove();

    return ret;
}

// Formatter to store `CipherParams`'s properties (Base64-encoded `ciphertext`,
// `iv` and `salt`) as a JSON object.
// Note: the `parse` function is actually unused in the code because the script
// doesn't need to decrypt a response.
// Source: https://cryptojs.gitbook.io/docs/#the-cipher-output
var JsonFormatter = {
  stringify: function(cipherParams) {
    // create json object with ciphertext
    var jsonObj = { ct: cipherParams.ciphertext.toString(CryptoJS.enc.Base64) };

    // optionally add iv or salt
    if (cipherParams.iv) {
      jsonObj.iv = cipherParams.iv.toString();
    }

    if (cipherParams.salt) {
      jsonObj.s = cipherParams.salt.toString();
    }

    // stringify json object
    return JSON.stringify(jsonObj);
  },
  parse: function(jsonStr) {
    // parse json string
    var jsonObj = JSON.parse(jsonStr);

    // extract ciphertext from json object, and create cipher params object
    var cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(jsonObj.ct)
    });

    // optionally extract iv or salt

    if (jsonObj.iv) {
      cipherParams.iv = CryptoJS.enc.Hex.parse(jsonObj.iv);
    }

    if (jsonObj.s) {
      cipherParams.salt = CryptoJS.enc.Hex.parse(jsonObj.s);
    }

    return cipherParams;
  }
};
