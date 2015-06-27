var parsedContent = false;

function download(path, filename, url){
    chrome.downloads.download({
        url: url,
        filename: path + "/" + filename
    });
}

function downloadBook(props){
    var path = props.titel;

    download(path, "cover.jpg", props.image);
    var desc = 'data:text/plain;charset=utf-8,' + encodeURIComponent(props.desc);
    download(path, "desc.txt", desc);

    $.each(props.playlist, function(){
        download(path, this.titel, this.url);
    });
}

function getParser(url){
    var link = document.createElement('a');
    link.setAttribute('href', url);
    var filename = link.hostname + ".js";
    return 'parsers/' + filename;
}

function setStatus(enabled){
    chrome.tabs.getSelected(null, function(tab) {
        var tabId = tab.id;
        var img = "img/icon_24_24_gray.png";
        chrome.browserAction.disable(tabId);

        if(enabled){
            img = "img/icon_24_24.png";
            chrome.browserAction.enable(tabId);
            chrome.browserAction.setTitle({
                title: chrome.i18n.getMessage('buttonTitle') + ": " + parsedContent.titel
            });
        }
        chrome.browserAction.setIcon({ path : img, tabId: tabId });
    });
}

function enable(){
    setStatus(true);
}

function disable(){
    setStatus(false);
}

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab){
    disable();
    if(changeInfo.status != "complete"){
        return;
    }

    var parser = getParser(tab.url);
    var parserUrl = chrome.extension.getURL(parser);
    $.ajax(parserUrl).success(function(){
        chrome.tabs.executeScript({ file: parser });
        enable();
    });
});

chrome.browserAction.onClicked.addListener(function(tab) {
    downloadBook(parsedContent);
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    sendResponse("OK");
    setStatus(request);
    parsedContent = request;
});