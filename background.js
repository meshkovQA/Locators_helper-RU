//background.js

chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");

    // Пункт для генерации локаторов
    chrome.contextMenus.create({
        id: "generateLocator",
        title: "Сгенерировать локаторы для элемента",
        contexts: ["all"]
    });

    // Пункт для добавления элемента в список для Page Object
    chrome.contextMenus.create({
        id: "addElementForPageObject",
        title: "Добавить элемент в Page Object",
        contexts: ["all"]
    });


    // Пункт для генерации Page Object
    chrome.contextMenus.create({
        id: "generatePageObject",
        title: "Сгенерировать Page Object",
        contexts: ["all"]
    });

    chrome.contextMenus.create({
        id: "selectRegionForPageObject",
        title: "Выбрать область для Page Object",
        contexts: ["all"]
    });
});

// Обработчик кликов по пунктам контекстного меню
chrome.contextMenus.onClicked.addListener((info, tab) => {
    console.log(`[ContextMenu Clicked] MenuItemId: ${info.menuItemId}, TabId: ${tab.id}`);

    if (info.menuItemId === "generateLocator") {
        console.log("[generateLocator] Executing locators.js...");
        // Выполнение locators.js для генерации локаторов
        chrome.scripting.executeScript(
            {
                target: { tabId: tab.id },
                files: ["locators.js"],
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("[generateLocator] Error executing script:", chrome.runtime.lastError.message);
                    return;
                }

                console.log("[generateLocator] locators.js injected. Now sending message to run generateLocators()...");
                chrome.tabs.sendMessage(tab.id, { action: 'generateLocators' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("[generateLocator] Error sending message:", chrome.runtime.lastError.message);
                        return;
                    }

                    // 3) Получаем ответ из locators.js
                    if (response && response.success && response.data) {
                        console.log("[generateLocator] Locators received:", response.data);
                        handleLocatorResult(response.data)
                    } else {
                        console.warn("[generateLocator] No locators generated or error occurred.", response);
                    }
                });
            }
        );
    }
    else if (info.menuItemId === "addElementForPageObject") {
        console.log("[addElementForPageObject] Injecting locators.js...");
        // Выполнение locators.js для добавления элемента
        chrome.scripting.executeScript(
            {
                target: { tabId: tab.id },
                files: ["locators.js"],
            },
            () => {
                // Если произошла ошибка при инъекции
                if (chrome.runtime.lastError) {
                    console.error("[addElementForPageObject] Error injecting script:", chrome.runtime.lastError.message);
                    return;
                }

                console.log("[addElementForPageObject] locators.js. Now sending message to collect element...");

                // 2) Отправляем сообщение «собрать элемент»
                chrome.tabs.sendMessage(tab.id, { action: 'collectElement' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("[addElementForPageObject] Error sending message:", chrome.runtime.lastError.message);
                        return;
                    }

                    // 3) Обрабатываем ответ
                    if (response && response.success && response.data) {
                        console.log("[addElementForPageObject] Element collected:", response.data);
                        // Вызов вашей функции, которая сохранит элемент и выведет уведомление
                        handleElementAdded(response.data);
                    } else {
                        console.error("[addElementForPageObject] No element collected or an error occurred:", response);
                    }
                });
            }
        );
    }

    else if (info.menuItemId === "generatePageObject") {
        // Генерация Page Object
        chrome.storage.local.get("elementsForPageObject", (data) => {
            const elements = data.elementsForPageObject || [];
            if (!elements.length) {
                console.warn("No elements added for Page Object generation!");
                return;
            }
            handlePageObjectGeneration(elements);
        });
    }

    else if (info.menuItemId === "selectRegionForPageObject") {
        console.log("[selectRegionForPageObject] Injecting regionSelector.js...");
        // Внедряем наш новый скрипт
        chrome.scripting.executeScript(
            {
                target: { tabId: tab.id },
                files: ["regionSelector.js"], // тот самый новый файл
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("[selectRegionForPageObject] Error injecting:", chrome.runtime.lastError.message);
                    return;
                }
                console.log("[selectRegionForPageObject] regionSelector.js injected.");
                // Дальше regionSelector.js сам порисует оверлей и по завершению
                // отправит обратно массив элементов с локаторами
            }
        );
    }
});

// Обработка добавления элемента
function handleElementAdded(element) {
    console.log(`[handleElementAdded] Results:`, element);

    if (!element) {
        console.error("[Error] No element found.");
        return;
    }

    console.log(`[handleElementAdded] Element received:`, element);

    chrome.storage.local.get("elementsForPageObject", (data) => {
        const elements = data.elementsForPageObject || [];
        elements.push(element);

        chrome.storage.local.set({ elementsForPageObject: elements }, () => {
            console.log(`[handleElementAdded] Element added to storage.`, elements);
            try {
                // Генерируем текст уведомления
                const elementList = elements
                    .map(
                        (el, index) =>
                            `${index + 1}. ${el.tagName} (ID: ${el.id || "N/A"}, Text: ${el.text || "N/A"})`
                    )
                    .join("\n");

                // Показываем уведомление
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon.png",
                    title: "Element Added",
                    message: `New element added:\n${element.tagName} (${element.id || "No ID"})\n\nAll elements:\n${elementList}`,
                });
            } catch (error) {
                console.error("Error generating notification:", error);
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon.png",
                    title: "Error",
                    message: "Failed to generate notification.",
                });
            }
        });
    });
}

// Обработка результата для локаторов
async function handleLocatorResult(locators) {
    console.log(`[handleLocatorResult] Results:`, locators);

    if (!locators) {
        console.error(`[Error] No locators found in results.`);
        alert("No locators found!");
        return;
    }

    console.log(`[handleLocatorResult] Locators received:`, locators);

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
You don't need to provide explanations or text, only code.
The answer has to be in Russian language.
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
Based on the provided element properties, generate the most appropriate locator for each element in the following priority:
1. Use the 'id' if it exists and is unique.
2. If 'id' is not available, use the 'name' attribute if it exists.
3. If 'name' is not available, use any unique attribute like 'placeholder' or 'type' or others if available.
4. If no unique attributes are available, use the element's text.
5. If none of the above options are available, generate a CSS selector based on div nesting (up to 3 levels).

Ensure that:
- Locators with dynamic values (e.g., containing numbers like 'data-v-1f99f73c') are excluded.
- The final result includes optimized locators and methods to interact with each element to use it for use in ${framework} with ${language}.

Properties:
${JSON.stringify(elements, null, 2)}
Provide the results as code (not JSON) for the specified test ${framework} with ${language}.
The answer has to be in Russian language.
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
                messages
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
                The answer has to be in Russian language.`
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


// Слушатель, который примет результат из regionSelector.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "regionElementsCollected") {
        console.log("[background] Got elements from region:", message.data);

        // Например, сохраняем в local storage
        chrome.storage.local.get("elementsForPageObject", (storageData) => {
            const existing = storageData.elementsForPageObject || [];
            // Склеиваем
            const newElements = [...existing, ...message.data];
            chrome.storage.local.set({ elementsForPageObject: newElements }, () => {
                console.log("[background] Region elements saved to local storage:", newElements);

                // Тут же, если хотите, можно вызвать handlePageObjectGeneration(newElements)
                // или показать уведомление
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon.png",
                    title: "Region Collected",
                    message: `${message.data.length} elements collected in region and saved.`,
                });
            });
        });
        sendResponse({ received: true });
    }
});