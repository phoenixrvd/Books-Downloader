var parsedContent = false;
var tabId = 0;
var runned_items = [];

// Jede Halbe Sekunde schauen, ob was noch in der Queue gibt und
// es keine 3 Downloads laufen.
// 3 Ist maximale anzehl von gleichzeitigen Downloads (von Server festgelegt).
setInterval(function () {
    if (runned_items.length > 0) {
        var maxDownloadItemsAtSameTime = 3;
        chrome.downloads.search({state: 'in_progress', paused: false}, function (results) {
            if (results.length < maxDownloadItemsAtSameTime){
                chrome.downloads.download(runned_items.shift());
            }
        });
        chrome.browserAction.setBadgeText({ text: '' + runned_items.length });
    } else {
        chrome.browserAction.setBadgeText({ text: '' });
    }
}, 500);

function replacePathChars(path){
    return path.replace(/[`~!@#$%^&*()_|+=?;:'",<>\{\}\[\]\\\/]/g, "_");
}

function getMp3FileExtension(filename){
    return (/\.mp3/.exec(filename)) ? "" : ".mp3";
}

function download(path, filename, url){
    path = replacePathChars(path);
    filename = replacePathChars(filename);
    runned_items.push({
        url: url,
        filename: path + "/" + filename
    });
}

function downloadMp3(path, filename, url){
    filename = filename + getMp3FileExtension(filename);
    download(path, filename, url);
}

function downloadContent(props){
    var path = props.titel;

    download(path, "cover.jpg", props.image);
    var desc = 'data:text/plain;charset=utf-8,' + encodeURIComponent(props.desc);
    download(path, "desc.txt", desc);

    $.each(props.playlist, function(){
        downloadMp3(path, this.titel, this.url);
    });
}

function loadParser(url){
    var link = $('<a/>');
    link.attr('href', url);
    var parser = 'parsers/' + link[0].hostname + ".js";
    var parserUrl = chrome.extension.getURL(parser);
    return $.ajax(parserUrl);
}

function updateStatus(){
    var img = "img/icon_24_24_gray.png";
    chrome.browserAction.disable(tabId);

    if(parsedContent){
        img = "img/icon_24_24.png";
        chrome.browserAction.enable(tabId);
        chrome.browserAction.setTitle({
            title: chrome.i18n.getMessage('buttonTitle') + ": " + parsedContent.titel
        });
    }
    chrome.browserAction.setIcon({ path : img, tabId: tabId });
}

function onLoad(tab){
    var tabs = chrome.tabs;
    var tabUrl = tab.url;

    parsedContent = false;
    tabId = tab.id;

    updateStatus();

    loadParser(tabUrl).success(function(content){
        tabs.executeScript(tabId, { code: content }, function(){
            tabs.sendMessage(tabId, 'parse', function(response) {
                parsedContent = response;
                updateStatus();
            });
        });
    })
}

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab){
    if(changeInfo.status == "complete"){
        onLoad(tab);
    }
});

chrome.browserAction.onClicked.addListener(function(tab) {
    downloadContent(parsedContent);
});
