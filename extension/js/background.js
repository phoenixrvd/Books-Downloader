var parsedContent = {
    title: '',
    desc: '',
    image: '',
    playlist: []
};

var queue = [];

var browserAction = chrome.browserAction;

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
    var path = replacePathChars(parsedContent.title);

    // Add cover-Image
    pushQueuItem(path, "cover.jpg", parsedContent.image);

    // Add book description
    var desc = 'data:text/plain;charset=utf-8,' + encodeURIComponent(parsedContent.desc);
    pushQueuItem(path, "desc.txt", desc);

    // Add all MP3 Tracks
    for (var trackUrl in parsedContent.playlist) {
        var track = parsedContent.playlist[trackUrl];
        var filename = track.title + getMp3FileExtension(track.title);
        pushQueuItem(path, filename, track.url);
    }

    // Whatch and download all queue Items. Clear timers if queue is empty
    var timer = setInterval(function () {
        startDownloads();
        browserAction.setBadgeText({text: '' + queue.length});

        if (queue.length === 0) {
            clearInterval(timer);
            browserAction.setBadgeText({text: ''});
        }
    }, 1000);
}

function buttonDisable(tabId) {
    browserAction.disable(tabId);
    browserAction.setTitle({title: ''});
    browserAction.setIcon({path: "img/icon_24_24_gray.png", tabId: tabId});
}

browserAction.onClicked.addListener(function (tab) {
    downloadContent();
    buttonDisable(tab.id);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "loading") {
        buttonDisable(tab.id)
    }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    parsedContent = request;

    var title = chrome.i18n.getMessage('buttonTitle') + ": " + request.title;
    var tabId = sender.tab.id;

    browserAction.enable(tabId);
    browserAction.setTitle({title: title});
    browserAction.setIcon({path: "img/icon_24_24.png", tabId: tabId});
});