// locators.js

(function () {

    console.log("[locators.js] Script loaded.");

    function getTargetElement() {
        console.log(`[getTargetElement] Getting target element.`);
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            // Пытаемся взять родителя выделенного текста
            const selRange = selection.getRangeAt(0);
            const selNode = selRange.startContainer;
            if (selNode.nodeType === Node.TEXT_NODE) {
                console.log(`[getTargetElement] Text node found. Parent:`, selNode.parentElement);
                return selNode.parentElement;
            }
        }
        // Если ничего не выделено или это не текст — fallback
        const activeElement = document.activeElement || document.querySelector(':hover');
        console.log(`[getTargetElement] Active or hovered element:`, activeElement);
        return activeElement;
    }

    // Мелкая функция, чтобы проверить "динамические" классы
    function isLikelyDynamicClass(className) {
        console.log(`[isLikelyDynamicClass] Checking class:`, className);
        return /(^ng-|-\d+|_|\bh-\w+)/.test(className);
    }

    // Улучшенное построение CSS-пути (рекурсивно).
    function buildCSSSelector(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

        // Если есть ID, и он выглядит "хорошо" (не динамический)
        if (element.id && !isLikelyDynamicClass(element.id)) {
            return `${element.tagName.toLowerCase()}#${element.id}`;
        }

        // Составляем список классов (исключая слишком динамические)
        let classPart = '';
        if (element.className) {
            const classes = element.className.trim().split(/\s+/).filter(c => !isLikelyDynamicClass(c));
            if (classes.length) {
                classPart = '.' + classes.join('.');
            }
        }

        // Проверяем, не является ли элементом типа <tr> или <td>.
        // Если это тр, получаем индекс в родителе (tbody/table).
        // Если это td, тоже считаем индекс.
        let nthPart = '';
        const parent = element.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter((el) => el.tagName === element.tagName);
            const index = siblings.indexOf(element) + 1; // 1-based
            if (element.tagName.toLowerCase() === 'tr' || element.tagName.toLowerCase() === 'td' || element.tagName.toLowerCase() === 'li') {
                nthPart = `:nth-of-type(${index})`;
            }
        }

        // Рекурсивный шаг: поднимаемся на уровень выше.
        // Если у родителя получился короткий локатор (например, #tableId), 
        // мы можем просто "дописать" > tr:nth-of-type(2)
        const parentSelector = buildCSSSelector(parent);
        return parentSelector ? `${parentSelector} > ${element.tagName.toLowerCase()}${classPart}${nthPart}` : element.tagName.toLowerCase() + classPart + nthPart;
    }

    // Пример расширенной логики XPath
    function buildXPath(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

        // Если есть ID
        if (element.id && !isLikelyDynamicClass(element.id)) {
            return `//*[@id="${element.id}"]`;
        }

        // Проверка data-атрибутов
        // Собираем подходящие data-*, aria-, или href атрибуты
        const uniqueAttrs = [];
        for (const attr of element.attributes) {
            if (
                attr.name.startsWith('data-') ||
                attr.name.startsWith('aria-') ||
                attr.name === 'href' ||
                attr.name === 'name'
            ) {
                // Можно дополнительно проверить, не выглядит ли значение динамическим
                uniqueAttrs.push(`@${attr.name}="${attr.value}"`);
            }
        }
        if (uniqueAttrs.length === 1) {
            return `//${element.tagName.toLowerCase()}[${uniqueAttrs[0]}]`;
        } else if (uniqueAttrs.length > 1) {
            // Если несколько подходящих атрибутов, объединяем их через and
            return `//${element.tagName.toLowerCase()}[${uniqueAttrs.join(' and ')}]`;
        }

        // Если нет ID/unique атрибутов, уходим «вглубь» с индексами
        // Находим индекс элемента среди его однотипных братьев
        let index = 1;
        let sibling = element.previousElementSibling;
        while (sibling) {
            if (sibling.tagName === element.tagName) {
                index++;
            }
            sibling = sibling.previousElementSibling;
        }

        const parentPart = buildXPath(element.parentElement);
        const selfPart = `${element.tagName.toLowerCase()}[${index}]`;
        return parentPart ? `${parentPart}/${selfPart}` : `//${selfPart}`;
    }

    // Итоговая функция генерации локаторов
    function generateLocators() {
        console.log(`[generateLocators] Generating locators.`);
        const element = getTargetElement();
        if (!element) {
            console.warn(`[generateLocators] No element found.`);
            alert('Element not found or text selection cannot be resolved!');
            return null;
        }

        const xPath = buildXPath(element);
        const cssSelector = buildCSSSelector(element);
        const textContent = element.innerText?.trim() || '';

        // Как вариант, можно собрать "byTextXPath", если текст не пустой и не слишком длинный
        const byTextXPath =
            textContent && textContent.length < 100
                ? `//${element.tagName.toLowerCase()}[contains(normalize-space(.), "${textContent}")]`
                : null;
        console.log(`[generateLocators] Locators generated:`, { xPath, cssSelector, byTextXPath }, element);
        // Собираем всю информацию
        return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || null,
            classes: element.className ? element.className.split(" ") : [],
            text: textContent,
            attributes: Array.from(element.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {}),

            // Наши новые усовершенствованные селекторы
            xPath,
            cssSelector,
            byTextXPath,
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log(`[onMessage] Received message:`, message);
        if (message.action === 'generateLocators') {
            const locators = generateLocators();
            console.log(`[onMessage] Sending locators back to background.js:`, locators);
            sendResponse({ success: !!locators, data: locators });
            return true;

        } else if (message.action === 'collectElement') {
            const element = generateLocators();
            console.log(`[onMessage] Sending collected element data:`, element);
            sendResponse({ success: !!element, data: element });
            return true;
        }

        // Indicates async response
    });

})();