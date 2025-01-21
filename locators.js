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
        return /(^ng-|data-v-|-[0-9]+|_[0-9a-f]+|h-[a-z0-9]+)/.test(className);
    }

    // Проверка, что селектор уникален
    function isUniqueSelector(selector) {
        const elements = document.querySelectorAll(selector);
        return elements.length === 1;
    }

    function getUniqueElementData(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

        // Проверяем уникальность ID
        let id = element.id && !isLikelyDynamicClass(element.id) && isUniqueSelector(`#${element.id}`) ? element.id : null;

        // Составляем список классов, исключая динамические
        const classes = element.className
            ? element.className
                .trim()
                .split(/\s+/)
                .filter((cls) => !isLikelyDynamicClass(cls))
            : [];

        // Уникальные атрибуты
        const attributes = Array.from(element.attributes)
            .filter(
                (attr) =>
                    attr.name &&
                    !isLikelyDynamicClass(attr.value) &&
                    (attr.name === "name" || attr.name === "placeholder" || attr.name === "type")
            )
            .reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {});

        // Текстовое содержимое
        const textContent = element.innerText?.trim() || "";

        // Локатор по вложенности div (до 3 уровней)
        let nestedDivSelector = null;
        let currentElement = element;
        let levels = 0;

        while (currentElement && levels < 3) {
            const tag = currentElement.tagName.toLowerCase();
            const index = Array.from(currentElement.parentElement?.children || []).indexOf(
                currentElement
            );

            nestedDivSelector = nestedDivSelector
                ? `${tag}:nth-of-type(${index + 1}) > ${nestedDivSelector}`
                : `${tag}:nth-of-type(${index + 1})`;

            currentElement = currentElement.parentElement;
            levels++;
        }

        return {
            tagName: element.tagName.toLowerCase(),
            id,
            classes,
            text: textContent,
            attributes,
            nestedDivSelector,
        };
    }

    // Итоговая функция генерации локаторов
    function generateLocators() {
        console.log(`[generateElementData] Generating data for element.`);
        const element = getTargetElement();
        if (!element) {
            console.warn(`[generateElementData] No element found.`);
            alert('Element not found or text selection cannot be resolved!');
            return null;
        }

        const elementData = getUniqueElementData(element);
        console.log(`[generateElementData] Element data generated:`, elementData);
        return elementData;
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