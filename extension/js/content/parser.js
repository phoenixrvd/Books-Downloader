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

    var document_title =  $('.ls-topic-title').text().trim();
    var title_parts = document_title.split(' - ');

    var data = {
        id: getBookId(),
        author: title_parts.shift(),
        title: title_parts.join(' - '),
        description: getDescriptionText(),
        metadata: getMetaData(),
        image: $('.picture-side img:last, .topic-image').attr('src'),
        source: $('[property="og:url"]').attr('content'),
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

function getDescriptionTextMobile() {

    var description = $('.topic-content').clone();
    description.find('.topic-content-right,.ya-share2').remove();
    return description.text().trim();
}

function getMetaDataMobile() {

    var data = [];
    var $meta = $('.book-info');

    $meta.find('.fa').remove();
    $meta.find('.item-info').each(function(){
        var $this = $(this);
        data.push($this.text().trim().replace(/\s+/, ' '));
    });

    return data;
}

function getDescriptionText() {
    return $('.ls-topic-content').text().trim();
}

function getMetaData() {
    var data = [];
    var $meta = $('.book-info .panel-item:not(.flab-rating)').clone();

    $meta.find('.voting-total, .fa').remove();
    $meta.each(function () {
        var $this = $(this);
        data.push($this.text().trim().replace(/\s+/, ' '));
    });

    return data;
}

if($('.layout--template-acl10-mobile').length > 0) {
    getDescriptionText = getDescriptionTextMobile;
    getMetaData = getMetaDataMobile;
}