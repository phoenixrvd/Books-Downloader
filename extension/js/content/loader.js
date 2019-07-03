$(function () {

    loadBookData(function (content) {
        chrome.runtime.sendMessage(content);
    })

});
