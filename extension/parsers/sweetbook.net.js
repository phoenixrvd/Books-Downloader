function getPlaylist(){
    var playList = {};
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
        playList[url] = {
            url: url,
            title: url.match(/,\/(.*)/g)[0].replace(',/', '')
        };
    });
    return playList;
}

function parse(){

    var playlist = getPlaylist();
    if(playlist.length == 0){
        return false;
    }

    var title = $('.topic-header h1').text().trim();
    function getDescriptionText(){
        var $textContent = $('.topic-content.text').clone();
        $textContent.find('.ya-share2').remove();
        var text = [
            title + "\n",
            $textContent.text().trim() + "\n\n"
        ];
        var $meta = $('.topic-content-begin div:first div').clone();
        $meta.find('.voting-total, .fa').remove();
        $meta.each(function(){
            var $this = $(this);
            text.push($this.text().trim().replace(/\s+/, ' '));
        });
        return text.join("\n");
    }

    return {
        title: title,
        desc: getDescriptionText(),
        image: $('.topic img:last').attr('src'),
        files: playlist
    };
}