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
    return path.replace(/[~!@#$%^&*()_|+=?;:'"<>\{\}\[\]\\\/`]/g, "_");
}

function pushQueueItem(filename, url) {
    const rawDirectory = parsedContent.author != ''
        ? parsedContent.author + ' - ' + parsedContent.title
        // firefox 108.0.1 doesn't want to download any file when the directory starts
        // with ` - ` in case `author` is empty, so we're using only the `title` in
        // such cases; for example, https://akniga.org/zolotoy-fond-radiospektakley-chast-1-sbornik-audiospektakley
        : parsedContent.title;
    var path = replacePathChars(rawDirectory);
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
        var filename = replacePathChars(new URL(trackUrl).basename());
        pushQueueItem(filename, trackUrl);
    }

    // Watch and download all queue Items.
    watchQueuedItems();
}

// Returns the filename portion (the string after the last `/`) of URL's pathname.
// E.g. `new URL('https://example.org/b/foo/bar.baz.mp3?param=yes').basename() == "bar.baz.mp3"`
URL.prototype.basename = function() {
    const path = this.pathname;
    return path.substr(path.lastIndexOf('/') + 1);
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
