var content = {};

$(function () {

    console.assert('50768' === getBookId());

    content = preparePageData([
        {
            mp3: 'test.mp3',
            title: 'test - Title'
        }
    ]);

    console.assert('Шекли Роберт - Абсолютное оружие' === content.title);

    var descriptionDesktop = 'Шекли Роберт - Абсолютное оружие\n' +
        '\n' +
        'На пустынном Марсе три человека нашли арсенал с оружием… Им бы задуматься — почему на Марсе\n' +
        '                            нет живых существ?\n' +
        '\n' +
        '\n' +
        'Автор: Шекли Роберт\n' +
        'Читает: Карлов\n' +
        '                                            Александр\n' +
        '2015 год\n' +
        '24 минуты';

    var descriptionMobile = "Шекли Роберт - Абсолютное оружие\n" +
        "\n" +
        "На пустынном Марсе три человека нашли арсенал с оружием… Им бы задуматься — почему на Марсе нет живых существ?\n" +
        "\n" +
        "\n" +
        "Автор: Шекли Роберт\n" +
        "Читает: Карлов Александр\n" +
        "24 минуты";

    if($('.layout--template-acl10-mobile').length > 0) {
        console.assert(descriptionMobile === content.desc);
    } else {
        console.assert(descriptionDesktop === content.desc);
    }

    console.assert('test - Title' === content.files['test.mp3'].title);
    console.assert('test.mp3' === content.files['test.mp3'].url);
    console.assert('https://audioknigi.club/uploads/media/topic/2019/06/28/11/preview/821258151e502731e8c6_400x.jpg' === content.image);
});
