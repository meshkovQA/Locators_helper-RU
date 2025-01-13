chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");

    // Пункт для генерации локаторов
    chrome.contextMenus.create({
        id: "generateLocator",
        title: "Сгенерировать локаторы для данного элемента",
        contexts: ["all"]
    });

    // Пункт для добавления элемента в список для Page Object
    chrome.contextMenus.create({
        id: "addElementForPageObject",
        title: "Добавить элемент в список для Page Object",
        contexts: ["all"]
    });


    // Пункт для генерации Page Object
    chrome.contextMenus.create({
        id: "generatePageObject",
        title: "Сгенерировать Page Object класс",
        contexts: ["all"]
    });

});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "generateLocator") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: generateLocators,
        }, handleLocatorResult);
    }


    if (info.menuItemId === "addElementForPageObject") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: collectElementForPageObject,
        }, handleElementAdded);
    }


    if (info.menuItemId === "generatePageObject") {
        chrome.storage.local.get("elementsForPageObject", (data) => {
            const elements = data.elementsForPageObject || [];

            if (elements.length === 0) {
                alert("No elements added for Page Object generation!");
                return;
            }

            handlePageObjectGeneration(elements);
        });
    }
});

// Обработка добавления элемента
function handleElementAdded(results) {
    const element = results[0]?.result;

    if (!element) {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png", // Укажите путь к иконке расширения
            title: "Error",
            message: "No element selected!",
        });
        return;
    }

    chrome.storage.local.get("elementsForPageObject", (data) => {
        const elements = data.elementsForPageObject || [];
        elements.push(element);

        chrome.storage.local.set({ elementsForPageObject: elements }, () => {
            // Формируем список добавленных элементов
            const elementList = elements.map((el, index) => {
                const idInfo = el.id ? ` (ID: ${el.id})` : "";
                const textInfo = el.text ? ` (Text: "${el.text}")` : "";
                return `${index + 1}. ${el.tagName}${idInfo}${textInfo}`;
            }).join("\n");

            // Отправляем уведомление
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png", // Укажите путь к иконке расширения
                title: "Element Added",
                message: `Element added:\n${element.tagName} ${element.id || ""}\n\nList of elements:\n${elementList}`,
            });
        });
    });
}

// Обработка результата для локаторов
async function handleLocatorResult(results) {
    // Получаем информацию о локаторах
    const locators = results[0].result;

    if (!locators) {
        alert("No locators found!");
        return;
    }

    const { language, framework, apiKey } = await getSettings();


    if (!apiKey) {
        console.error("No API Key found. Please set it in the extension settings.");
        alert("No API Key found. Please set it in the extension settings.");
        return;
    }

    // Подготовка сообщения для OpenAI
    const messages = [
        { role: "system", content: "You are an assistant that generates UI locators for automated testing frameworks." },
        {
            role: "user",
            content: `
Optimize the following locators for use in ${framework} with ${language}:
Locators: ${JSON.stringify(locators)}
Provide the results as code, not JSON, for use in ${framework} with ${language} for each optimized locator type (you can provide several resuls for one type as well if you can).
You don't to provide explanations or text, only code.
All comments must be in russian.
                            `
        }
    ];
    sendToOpenAI(messages, apiKey, "locators");
}

// Обработка для Page Object
async function handlePageObjectGeneration(elements) {

    if (!elements || elements.length === 0) {
        alert("No elements selected!");
        return;
    }

    const { language, framework, apiKey } = await getSettings();

    if (!apiKey) {
        alert("No API Key found. Please set it in the extension settings.");
        return;
    }

    const prompt = `
Generate a Page Object class for the following elements using ${framework} and ${language}:
${JSON.stringify(elements, null, 2)}
Each element should have a locator (ID > Class > Text > Attribute).
Include methods for interacting with these elements (e.g., click, getText).
You don't to provide explanations or text, only code.
All comments must be in russian.
    `;

    const messages = [
        { role: "system", content: "You are an assistant that generates Page Object classes for test automation." },
        { role: "user", content: prompt }
    ];

    sendToOpenAI(messages, apiKey, "pageObject");
}

// Сбор настроек из chrome.storage
function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(["language", "framework", "apiKey"], (settings) => {
            resolve(settings);
        });
    });
}


// Отправка данных в OpenAI
async function sendToOpenAI(messages, apiKey, resultType) {
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages,
                max_tokens: 1000
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0]) {
            const generatedCode = data.choices[0].message.content;

            // Очистка предыдущих данных и сохранение новых
            chrome.storage.local.remove(["locators", "pageObject"], () => {
                chrome.storage.local.set({ [resultType]: generatedCode }, () => {
                    // Отправка сообщения popup.js об обновлении данных
                    chrome.runtime.sendMessage({ action: "updateResults", resultType, generatedCode });
                });
            });

        } else {
            console.error("No valid response from OpenAI.");
        }
    } catch (error) {
        console.error("Error communicating with OpenAI:", error);
    }
}

// Слушатель onMessage
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "refineResults") {
        // Вызываем нашу асинхронную функцию
        refineResults(message.prompt, sendResponse);

        // Возвращаем true в слушателе, 
        // чтобы сообщить Chrome о том, что ответ придёт позже
        return true;
    }
});

// Асинхронная функция, которая выполняет логику
async function refineResults(prompt, sendResponse) {
    try {
        // Оборачиваем chrome.storage.local.get в промис:
        const data = await new Promise((resolve, reject) => {
            chrome.storage.local.get(["locators", "pageObject"], (result) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(result);
            });
        });

        const { locators, pageObject } = data;
        const baseContent = `
      ${locators ? `Locators:\n${locators}` : ""}
      ${pageObject ? `Page Object:\n${pageObject}` : ""}
    `;

        const messages = [
            { role: "system", content: "You are an assistant that generates and refines test automation." },
            {
                role: "user",
                content: `${baseContent}\n\nRefine the results based on the following instructions:\n${prompt}
                All comments must be in russian.`
            }
        ];

        // Считываем apiKey
        const { apiKey } = await getSettings();
        if (!apiKey) {
            sendResponse({ success: false, error: "No API Key found. Please set it in the settings." });
            return;
        }

        // Делаем запрос к OpenAI
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages,
                max_tokens: 1000
            })
        });

        const dataRefine = await response.json();
        const refinedResults = dataRefine.choices?.[0]?.message?.content;

        if (!refinedResults) {
            sendResponse({ success: false, error: "Failed to generate refined results." });
            return;
        }

        // Решаем, какой тип результатов уточняем
        let resultType = "locators";
        if (!locators && pageObject) {
            resultType = "pageObject";
        }

        // Перезаписываем значения в chrome.storage (тоже через промис)
        await new Promise((resolve, reject) => {
            chrome.storage.local.remove(["locators", "pageObject"], () => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                chrome.storage.local.set({ [resultType]: refinedResults }, () => {
                    if (chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    resolve();
                });
            });
        });

        // Наконец отсылаем успешный ответ
        sendResponse({ success: true, resultType, refinedResults });

    } catch (error) {
        console.error("Error in refineResults:", error);
        sendResponse({ success: false, error: error?.message || "Unknown error" });
    }
}

// Функция для выполнения на странице
function collectElementForPageObject() {
    const element = document.activeElement || document.querySelector(':hover');

    if (!element) {
        return null;
    }

    return {
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: element.className ? element.className.split(" ") : [],
        text: element.innerText.trim(),
        attributes: Array.from(element.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
        }, {})
    };
}

// Функция для выполнения на странице
function generateLocators() {
    // Находим активный элемент (тот, на который был совершен клик)
    const element = document.activeElement || document.querySelector(':hover');

    if (!element) {
        alert('Element not found!');
        return;
    }

    // Собираем основные данные элемента
    const elementDetails = {
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: element.className ? element.className.split(" ") : [],
        href: element.getAttribute("href") || null,
        text: element.innerText.trim() || null,
        attributes: Array.from(element.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
        }, {})
    };

    // Генерация XPath
    const generateXPath = (el) => {
        if (el.id) {
            return `//*[@id="${el.id}"]`;
        }

        // Проверка уникальных атрибутов (например, href, data-*)
        const uniqueAttrs = [];
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith("data-") || attr.name === "href") {
                uniqueAttrs.push(`@${attr.name}="${attr.value}"`);
            }
        });

        if (uniqueAttrs.length > 0) {
            return `//${el.tagName.toLowerCase()}[${uniqueAttrs.join(" and ")}]`;
        }

        // Построение пути через DOM
        let path = "";
        while (el && el.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = el.previousElementSibling;

            while (sibling) {
                if (sibling.tagName === el.tagName) {
                    index++;
                }
                sibling = sibling.previousElementSibling;
            }

            const tagName = el.tagName.toLowerCase();
            const part = index > 1 ? `${tagName}[${index}]` : tagName;
            path = `/${part}${path}`;
            el = el.parentElement;
        }
        return path;
    };

    // Генерация CSS-селектора
    const generateCSSSelector = (el) => {
        if (el.id) {
            return `${el.tagName.toLowerCase()}#${el.id}`;
        }

        const classes = el.className
            ? `.${el.className.trim().replace(/\s+/g, ".")}`
            : "";

        if (el.parentElement) {
            return `${generateCSSSelector(el.parentElement)} > ${el.tagName.toLowerCase()}${classes}`;
        }

        return `${el.tagName.toLowerCase()}${classes}`;
    };

    // XPath с текстом
    const byTextXPath = elementDetails.text
        ? `//${elementDetails.tagName}[contains(text(), "${elementDetails.text}")]`
        : null;

    const xPath = generateXPath(element);
    const cssSelector = generateCSSSelector(element);

    return {
        tagName: elementDetails.tagName,
        id: elementDetails.id,
        classes: elementDetails.classes,
        href: elementDetails.href,
        text: elementDetails.text,
        attributes: elementDetails.attributes,
        xPath,
        cssSelector,
        byTextXPath: elementDetails.text
            ? `//${elementDetails.tagName}[contains(text(), "${elementDetails.text}")]`
            : null
    };
}