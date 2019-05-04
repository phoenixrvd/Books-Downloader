$(function () {

    if (typeof parse !== 'function') {
        return;
    }

    var content = parse();

    if (content) {
        chrome.runtime.sendMessage(content);
    }

});
