const config = require('../scripts/config');

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const page_path = path.resolve(`${config.TEST_PATH_CACHE}`);
const extension_script_path = path.resolve(`${config.EXTENSION_PATH}/js/content/`);

function wrapJQueryContext(content_file) {
    let content = fs.readFileSync(`${page_path}/${content_file}`) + '';
    let $ = require("jquery")((new JSDOM(content)).window);
    eval(fs.readFileSync(`${extension_script_path}/parser.js`) + '');

    return preparePageData([{
        mp3: 'test.mp3',
        title: 'test - Title'
    }]);
}


it('content generic', function () {
    let content = wrapJQueryContext('desktop.html');

    assert.ok('50768' === content.id);
    assert.ok('Абсолютное оружие' === content.title);
    assert.ok('Шекли Роберт' === content.author);

    assert.ok('test - Title' === content.files['test.mp3'].title);
    assert.ok('test.mp3' === content.files['test.mp3'].url);
});

it('content desktop', function () {
    let content = wrapJQueryContext('desktop.html');

    assert.ok('https://audioknigi.club/uploads/media/topic/2019/06/28/11/preview/821258151e502731e8c6_400x.jpg' === content.image);
    assert.ok('На пустынном Марсе три человека нашли арсенал с оружием… Им бы задуматься — почему на Марсе нет живых существ?' === content.description);
    assert.ok('Автор: Шекли Роберт' === content.metadata[0]);
    assert.ok('Читает: Карлов Александр' === content.metadata[1]);
    assert.ok('2015 год' === content.metadata[2]);
    assert.ok('24 минуты' === content.metadata[3]);
});

it('content mobile', function () {
    let content = wrapJQueryContext('mobile.html');

    assert.ok('https://audioknigi.club/uploads/media/topic/2019/06/28/11/preview/821258151e502731e8c6_400x.jpg' === content.image);
    assert.ok('На пустынном Марсе три человека нашли арсенал с оружием… Им бы задуматься — почему на Марсе нет живых существ?' === content.description);
    assert.ok('Автор: Шекли Роберт' === content.metadata[0]);
    assert.ok('Читает: Карлов Александр' === content.metadata[1]);
    assert.ok('24 минуты' === content.metadata[2]);
});