//regionSelector.js
(function () {
    console.log("[regionSelector.js] Loaded.");

    let startX, startY;   // Координаты начала выделения
    let currentX, currentY;
    let isSelecting = false;

    // Создадим overlay (полупрозрачная подложка)
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.zIndex = "999999"; // очень высокое значение
    overlay.style.background = "rgba(0, 0, 0, 0.1)"; // чуть затемним, или сделать прозрачнее
    overlay.style.cursor = "crosshair";
    document.body.appendChild(overlay);

    // Рамка, которую мы будем «тянуть»
    const selectionBox = document.createElement("div");
    selectionBox.style.position = "absolute";
    selectionBox.style.border = "2px dashed red";
    selectionBox.style.pointerEvents = "none"; // чтобы мышь проходила «сквозь»
    overlay.appendChild(selectionBox);

    // Навешиваем слушатели на overlay
    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);

    function onMouseDown(e) {
        isSelecting = true;
        startX = e.pageX;
        startY = e.pageY;
        selectionBox.style.left = startX + "px";
        selectionBox.style.top = startY + "px";
        selectionBox.style.width = "0";
        selectionBox.style.height = "0";
    }

    function onMouseMove(e) {
        if (!isSelecting) return;
        currentX = e.pageX;
        currentY = e.pageY;

        // Вычислим размеры
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        selectionBox.style.left = left + "px";
        selectionBox.style.top = top + "px";
        selectionBox.style.width = width + "px";
        selectionBox.style.height = height + "px";
    }

    function onMouseUp(e) {
        isSelecting = false;
        // Получаем финальный прямоугольник
        const boxRect = selectionBox.getBoundingClientRect();

        // Соберём все элементы, которые пересекаются с этим прямоугольником
        const selectedElements = getElementsInsideRect(boxRect);

        console.log("[regionSelector.js] Elements in region:", selectedElements);

        // Генерируем локаторы для всех элементов
        const elementsWithLocators = selectedElements.map(el => generateLocatorsForElement(el));

        // Удаляем overlay (мы закончили)
        overlay.remove();

        // Посылаем в background.js
        chrome.runtime.sendMessage({
            action: "regionElementsCollected",
            data: elementsWithLocators
        }, (resp) => {
            console.log("[regionSelector.js] regionElementsCollected response:", resp);
        });
    }

    /**
     * Возвращаем список всех видимых элементов, которые целиком или частично
     * пересекаются с переданным прямоугольником.
     */
    function getElementsInsideRect(rect) {
        // Простой способ — пройтись по всем элементам документа (может быть медленно на очень больших страницах)
        // Или использовать document.querySelectorAll("body *"), и фильтровать.
        // Более оптимально: можно использовать intersection API, но для примера — простой вариант:

        const allElements = document.querySelectorAll("body *");
        const inRect = [];
        for (const el of allElements) {
            const elRect = el.getBoundingClientRect();
            // Проверяем пересечение:
            if (
                elRect.right >= rect.left &&
                elRect.left <= rect.right &&
                elRect.bottom >= rect.top &&
                elRect.top <= rect.bottom
            ) {
                inRect.push(el);
            }
        }
        return inRect;
    }

    /**
     * Упрощённая функция, генерирующая локаторы для одного элемента
     */
    function generateLocatorsForElement(element) {
        // Можно переиспользовать ваши buildCSSSelector и buildXPath
        // или писать в этом файле аналогичный код.

        const tagName = element.tagName.toLowerCase();
        const id = element.id || null;
        const classes = element.className ? element.className.split(/\s+/) : [];
        const text = element.innerText ? element.innerText.trim() : "";
        const attributes = Array.from(element.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
        }, {});

        const xPath = buildXPath(element);
        const cssSelector = buildCSSSelector(element);

        const byTextXPath =
            text && text.length < 100
                ? `//${tagName}[contains(normalize-space(.), "${text}")]`
                : null;

        return {
            tagName,
            id,
            classes,
            text,
            attributes,
            xPath,
            cssSelector,
            byTextXPath
        };
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

})();