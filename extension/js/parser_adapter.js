/**
 * Die funktion wird von jeweiligen Parser überladen.
 * @see parsers/audioknigi.club.js
 * @returns {*}
 */
function parse(){
    return false;
}

chrome.extension.onMessage.addListener(function(msg, sender, sendResponse) {
    var content = parse();
    sendResponse(content);
});