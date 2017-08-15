function parse(){

    var playList = {};
    var playerInit = /audioPlayer\((\d+),\d+/.exec($('script').text());
    if(!playerInit || !playerInit[1]){
        return false;
    }

    $.ajax('//audioknigi.club/rest/bid/' + playerInit[1], {
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

    var titel = $('.topic-header h1').text().trim();
    function getDescriptionText(){
        var text = [
            titel + "\n",
            $('.topic-content').text().trim() + "\n\n"
        ];
        var $meta = $('.book-info .panel-item:not(.flab-rating)').clone();
        $meta.find('.voting-total, .fa').remove();
        $meta.each(function(){
            var $this = $(this);
            text.push($this.text().trim().replace(/\s+/, ' '));
        });
        return text.join("\n");
    }

    return {
        titel: titel,
        desc: getDescriptionText(),
        image: $('.topic img:last').attr('src'),
        playlist: mp3
    };
}