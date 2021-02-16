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

    return preparePageData({
        title: "Абсолютное оружие",
        srv: 'test',
        key: 'test',
        items: [{
            duration: 1903,
            durationhms: "31:43",
            file: 1,
            time: 1903,
            time_finish: 1903,
            time_from_start: 0,
        }]
    });
}


it('content generic', function () {
    let content = wrapJQueryContext('desktop.html');

    assert.ok('50768' === content.id);
});

it('content desktop', function () {
    let content = wrapJQueryContext('desktop.html');

    assert.ok('https://akniga.org/uploads/media/topic/2019/06/28/11/preview/821258151e502731e8c6_400x.jpg' === content.image);
    assert.ok('На пустынном Марсе три человека нашли арсенал с оружием… Им бы задуматься — почему на Марсе нет живых существ?' === content.description);
    assert.ok('Автор: Шекли Роберт' === content.metadata[0]);
    assert.ok('Исполнитель: Карлов Александр' === content.metadata[1]);
    assert.ok('Год: 2015' === content.metadata[4]);
    assert.ok('Длительность: 24 минуты' === content.metadata[3]);
});

it('content mobile', function () {
    let content = wrapJQueryContext('mobile.html');

    assert.ok('https://akniga.org/uploads/media/topic/2019/06/28/11/preview/821258151e502731e8c6_400x.jpg' === content.image);
    assert.ok('На пустынном Марсе три человека нашли арсенал с оружием… Им бы задуматься — почему на Марсе нет живых существ?' === content.description);
    assert.ok('Автор: Шекли Роберт' === content.metadata[0]);
    assert.ok('Исполнитель: Карлов Александр' === content.metadata[1]);
    assert.ok('Длительность: 24 минуты' === content.metadata[3]);
});