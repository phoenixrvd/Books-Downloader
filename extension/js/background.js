var parsedContent = {
    title: '',
    desc: '',
    image: '',
    files: []
};

var queue = [];

var browserAction = chrome.browserAction;
var downloads = chrome.downloads;
var queueWatcherId = 0;

function watchQueuedItems() {

    downloads.search({state: 'in_progress', paused: false}, function (results) {

        var maxDownloadsAtSameTime  = 3;
        var watcherSleepTimeMilSec  = 300;

        clearInterval(queueWatcherId);

        if (queue.length === 0) {
            browserAction.setBadgeText({text: ''});
            return;
        }
        
        if (maxDownloadsAtSameTime <= results.length) {
            queueWatcherId = setInterval(watchQueuedItems, watcherSleepTimeMilSec);
            return;
        }

        downloads.download(queue.shift(), function(){
            queueWatcherId = setInterval(watchQueuedItems, watcherSleepTimeMilSec);
            browserAction.setBadgeText({text: '' + queue.length});
        });

    });

}

function replacePathChars(path) {
    return path.replace(/[`~!@#$%^&*()_|+=?;:'",<>\{\}\[\]\\\/]/g, "_");
}

function getMp3FileExtension(filename) {
    return (/\.mp3/.exec(filename)) ? "" : ".mp3";
}

function pushQueueItem(filename, url) {
    var path = replacePathChars(parsedContent.title);
    var fileRelativePath = path + "/" + filename;
    queue.push({url: url, filename: fileRelativePath, conflictAction: 'overwrite'});
}

function downloadContent() {

    // Add cover-Image
    pushQueueItem("cover.jpg", parsedContent.image);

    // Add book description
    var blob = new Blob([parsedContent.desc], {
        encoding:'UTF-8',
        type:'text/plain;charset=UTF-8'
    });
    var desc = URL.createObjectURL(blob);
    pushQueueItem("desc.txt", desc);

    // Add all MP3 Tracks
    for (var trackUrl in parsedContent.files) {
        var track = parsedContent.files[trackUrl];
        var filename = replacePathChars(track.title) + getMp3FileExtension(track.title);
        pushQueueItem(filename, track.url);
    }

    // Watch and download all queue Items.
    watchQueuedItems();
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

chrome.runtime.onMessage.addListener(function (request, sender) {
    parsedContent = request;

    var title = chrome.i18n.getMessage('buttonTitle') + ": " + request.title;
    var tabId = sender.tab.id;

    browserAction.enable(tabId);
    browserAction.setTitle({title: title});
    browserAction.setIcon({path: "img/icon_24_24.png", tabId: tabId});
});