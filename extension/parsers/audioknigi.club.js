function getPlaylist(){
    var playList = [];
    var $scripts = $('script');
    var mp3Urls = [];
    $scripts.each(function(){
        var script  = $(this).text();
        if(script.indexOf("new jPlayerPlaylist") > -1){
            mp3Urls = script.match(/(http.*\.mp3)/g);
        }
    });

    $.each(mp3Urls, function(){
        var url = this + "";
        var file = {
            url: url,
            titel: url.match(/\/online\/(.*)/g)[0].replace('/online/', '')
        };
        playList.push(file);
    });
    return playList;
}

function wrapContent(){

    var playlist = getPlaylist();
    if(playlist.length == 0){
        return false;
    }

    return {
        titel: $('.topic-header h1').text().trim(),
        desc: $('.topic-content').text().trim(),
        image: $('.topic img:last').attr('src'),
        playlist: playlist
    };
}

var content = wrapContent();
chrome.runtime.sendMessage(content, function(response) {
    if(response != "OK"){
        console.error(response);
        console.log(content);
    }
});