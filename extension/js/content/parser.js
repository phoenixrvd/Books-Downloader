function loadBookData(onSuccess) {

    var bookId = getBookId();

    if (typeof bookId === 'undefined') {
        return;
    }

    requestBookData(bookId, content => {
        console.log('content: ', content);
    });

    /*
    $.ajax('//akniga.org/rest/bid/' + bookId, {
        success: function (content) {
            var pageData = preparePageData(JSON.parse(content));
            onSuccess(pageData);
        }
    });
    */
}

// Makes an AJAX request to get information about the book with `bookId`.
function requestBookData(bookId, onSuccess) {
    // note: `LIVESTREET_SECURITY_KEY` is set in the HTML page and it's correlated with the user's cookie
    // the request below works because the browser sends the user's cookie along with our data
    const securityKey = retrieveWindowVariables(['LIVESTREET_SECURITY_KEY']).LIVESTREET_SECURITY_KEY;
    // the encryption key is taken from the webpage's js file and seems to be static
    const encryptedHash = CryptoJS.AES.encrypt(JSON.stringify(securityKey), 'EKxtcg46V', { format:JsonFormatter }).toString();

    $.post('https://akniga.org/ajax/b/' + bookId,
        { bid: bookId, hash: encryptedHash, security_ls_key: securityKey },
        onSuccess)
}

function getBookId() {
    return $('article').attr('data-bid');
}

function preparePageData(playList) {

    var document_title =  $('.ls-topic-title').text().trim();
    var title_parts = document_title.split(' - ');

    var data = {
        id: getBookId(),
        author: title_parts.shift(),
        title: title_parts.join(' - '),
        description: getDescriptionText(),
        metadata: getMetaData(),
        image: $('.picture-side img:last, .topic-image').attr('src'),
        source: $('[property="og:url"]').attr('content'),
        files: {}
    };

    $.each(playList, function (key, value) {
        var url = value.mp3;
        data.files[url] = {
            url: url,
            title: value.title
        };
    });

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
    return $('.ls-topic-content').text().trim();
}

function getMetaData() {
    var data = [];
    var $meta = $('.book-info .panel-item:not(.flab-rating)').clone();

    $meta.find('.voting-total, .fa').remove();
    $meta.each(function () {
        var $this = $(this);
        data.push($this.text().trim().replace(/\s+/, ' '));
    });

    return data;
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
