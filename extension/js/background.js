var parsedContent = false;
var tabId = 0;
var queue = [];

function startDownloads() {
    var maxDownloadsItemsAtSameTime = 3;
    chrome.downloads.search({state: 'in_progress', paused: false}, function (results) {
        var freePalces = maxDownloadsItemsAtSameTime - results.length;
        while(queue.length > 0 && freePalces-- > 0){
            chrome.downloads.download(queue.shift());
        }
    });
}

function replacePathChars(path) {
    return path.replace(/[`~!@#$%^&*()_|+=?;:'",<>\{\}\[\]\\\/]/g, "_");
}

function getMp3FileExtension(filename) {
    return (/\.mp3/.exec(filename)) ? "" : ".mp3";
}

function pushQueuItem(path, filename, url) {
    var fileRelativePath = path + "/" + replacePathChars(filename);
    queue.push({url: url, filename: fileRelativePath, conflictAction: 'overwrite'});
}

function downloadContent() {
    var path = replacePathChars(parsedContent.titel);

    // Add cover-Image
    pushQueuItem(path, "cover.jpg", parsedContent.image);

    // Add book description
    var desc = 'data:text/plain;charset=utf-8,' + encodeURIComponent(parsedContent.desc);
    pushQueuItem(path, "desc.txt", desc);

    // Add all MP3 Tracks
    $.each(parsedContent.playlist, function () {
        var filename = this.titel + getMp3FileExtension(this.titel);
        pushQueuItem(path, filename, this.url);
    });

    // Whatch and download all queue Items. Clear timers if queue is empty
    var timer = setInterval(function () {
        startDownloads();
        chrome.browserAction.setBadgeText({text: '' + queue.length});

        if (queue.length === 0) {
            clearInterval(timer);
            chrome.browserAction.setBadgeText({text: ''});
        }
    }, 1000);
}

function loadParser(url) {
    var link = $('<a/>');
    link.attr('href', url);
    var parser = 'parsers/' + link[0].hostname + ".js";
    var parserUrl = chrome.extension.getURL(parser);
    return $.ajax(parserUrl);
}

function buttonEnable(content) {
    var title = chrome.i18n.getMessage('buttonTitle') + ": " + content.titel;
    parsedContent = content;
    chrome.browserAction.enable(tabId);
    chrome.browserAction.setTitle({title: title});
    chrome.browserAction.setIcon({path: "img/icon_24_24.png", tabId: tabId});
}

function buttonDisable() {
    parsedContent = false;
    chrome.browserAction.disable(tabId);
    chrome.browserAction.setIcon({path: "img/icon_24_24_gray.png", tabId: tabId});
}

function onLoad(tab) {
    var tabs = chrome.tabs;
    var tabUrl = tab.url;
    tabId = tab.id;

    buttonDisable();
    loadParser(tabUrl).success(function (content) {
        tabs.executeScript(tabId, {code: content}, function () {
            tabs.sendMessage(tabId, 'parse', function (response) {
                if(response){
                    buttonEnable(response);
                }
            });
        });
    })
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
        onLoad(tab);
    }
});

chrome.browserAction.onClicked.addListener(function (tab) {
    downloadContent();
});
