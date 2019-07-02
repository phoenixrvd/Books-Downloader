$(function () {

    var content = parse();

    if (content) {
        chrome.runtime.sendMessage(content);
    }

});
