function parse(){

    var playList = {};
    $.ajax('http://audioknigi.club/rest/bid/34088', {
        async: false,
        success: function(content){
            playList = content;
        }
    });

    var mp3 = {};
    $.each(playList, function(key, value){
        var url = value.mp3;
        mp3[url] = {
            url: url,
            titel: value.title
        };
    });

    return {
        titel: $('.topic-header h1').text().trim(),
        desc: $('.topic-content').text().trim(),
        image: $('.topic img:last').attr('src'),
        playlist: mp3
    };
}