function parse(){

    var playList = {};
    var playerInit = /audioPlayer\((\d+),\d+/.exec($('script').text());
    if(!playerInit || !playerInit[1]){
        return;
    }

    $.ajax('http://audioknigi.club/rest/bid/' + playerInit[1], {
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

    function getDescriptionText(){
        var text = [
            $('.topic-header h1').text().trim() + "\n",
            $('.topic-content').text().trim() + "\n"
        ];
        var $meta = $('.info_layout td > div > div');
        $meta.each(function(){
            var $this = $(this);
            text.push($this.text().trim().replace(/\s+/, ' '));
        });
        return text.join("\n");
    };

    return {
        titel: $('.topic-header h1').text().trim(),
        desc: getDescriptionText(),
        image: $('.topic img:last').attr('src'),
        playlist: mp3
    };
}