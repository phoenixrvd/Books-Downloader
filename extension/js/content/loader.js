chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    loadBookData(function (content) {
        chrome.runtime.sendMessage(content);
    })
});
