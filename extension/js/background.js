var parsedContent = {
    id: 0,
    author: '',
    title: '',
    description: '',
    metadata: [],
    image: '',
    source: '',
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
    return path.replace(/[~!@#$%^&*()_|+=?;:'",<>\{\}\[\]\\\/`]/g, "_");
}

function pushQueueItem(filename, url) {
    var path = (replacePathChars(parsedContent.author + ' - ' + parsedContent.title)).trim();
    var fileRelativePath = path + "/" + filename;
    queue.push({url: url, filename: fileRelativePath, conflictAction: 'overwrite'});
}

function downloadBlobText(filename, text) {
    var blob = new Blob([text], {
        encoding:'UTF-8',
        type:'text/plain;charset=UTF-8'
    });
    var content = URL.createObjectURL(blob);
    pushQueueItem(filename, content);
}

function downloadContent() {

    // Add cover-Image
    pushQueueItem("cover.jpg", parsedContent.image);

    // Add book description
    var description = [
        parsedContent.author + ' - ' + parsedContent.title,
        '\n',
        parsedContent.description,
        '\n',
        parsedContent.metadata.join('\n')
    ];
    downloadBlobText("desc.txt", description.join('\n'));
    downloadBlobText("desc.json", JSON.stringify(parsedContent, null, 2));

    // Add all MP3 Tracks
    for (const trackUrl of parsedContent.files) {
        var filename = replacePathChars(trackUrl.basename());
        pushQueueItem(filename, trackUrl);
    }

    // Watch and download all queue Items.
    watchQueuedItems();
}

// Returns the filename or directory portion of pathname.
// E.g. `"foo/bar.baz".basename() == "bar.baz"`, `"foobar".basename() == "foobar"`.
String.prototype.basename = function() {
    return this.substr(this.lastIndexOf('/') + 1);
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
        buttonDisable(tabId);
    }

    if (changeInfo.status === "complete") {
        buttonDisable(tabId);
        chrome.tabs.sendMessage(tabId, {});
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
