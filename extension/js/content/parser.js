function loadBookData(onSuccess) {

    var bookId = getBookId();

    if (typeof bookId === 'undefined') {
        return;
    }

    $.ajax('//audioknigi.club/rest/bid/' + bookId, {
        success: function (content) {
            var pageData = preparePageData(JSON.parse(content));
            onSuccess(pageData);
        }
    });

}

function getBookId() {
    return $('[data-global-id]').attr('data-global-id');
}

function preparePageData(playList) {

    var title = $('.ls-topic-title').text().trim();

    var data = {
        title: title,
        desc: title + "\n\n" + getDescriptionText(),
        image: $('.picture-side img:last,.topic-image').attr('src'),
        files: {}
    };

    $.each(playList, function (key, value) {
        var url = value.mp3;
        data.files[url] = {
            url: url,
            title: value.title
        };
    });

    return data;
}

function getDescriptionText() {

    if($('.layout--template-acl10-mobile').length > 0) {
         return getDescriptionTextMobile();
    }

    return getDescriptionTextDesktop();
}

function getDescriptionTextMobile() {

    var description = $('.topic-content').clone();
    description.find('.topic-content-right').remove();

    var text = [
        description.text().trim() + "\n\n"
    ];

    var $meta = $('.book-info');
    $meta.find('.fa').remove();
    $meta.find('.item-info').each(function(){
        var $this = $(this);
        text.push($this.text().trim().replace(/\s+/, ' '));
    });

    return text.join("\n");
}

function getDescriptionTextDesktop() {

    var text = [
        $('.ls-topic-content').text().trim() + "\n\n"
    ];
    var $meta = $('.book-info .panel-item:not(.flab-rating)').clone();

    $meta.find('.voting-total, .fa').remove();
    $meta.each(function () {
        var $this = $(this);
        text.push($this.text().trim().replace(/\s+/, ' '));
    });

    return text.join("\n");
}