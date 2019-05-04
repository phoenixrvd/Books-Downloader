function parse(){

    var playList = {};
    const bidHolder = document.querySelector('.js-topic-player')
    if (!bidHolder) {
      return false
    }

    const bid = (bidHolder.dataset || {}).globalId;
    if (!bid) {
      return false
    }

    $.ajax('//audioknigi.club/rest/bid/' + bid, {
        async: false,
        success: function(content){
            playList = JSON.parse(content);
        }
    });

    var mp3 = {};
    $.each(playList, function(key, value){
        var url = value.mp3;
        mp3[url] = {
            url: url,
            title: value.title
        };
    });

    var title = $('.ls-topic-title').text().trim();
    function getDescriptionText(){
        var text = [
            title + "\n",
            $('.ls-topic-content').text().trim() + "\n\n"
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
        title: title,
        desc: getDescriptionText(),
        image: $('.picture-side img:last').attr('src'),
        files: mp3
    };
}
