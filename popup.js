document.addEventListener('DOMContentLoaded', () => {
    const outputDiv = document.getElementById('output');
    const instructionsDiv = document.getElementById('instructions');
    const noResultsMessage = document.getElementById('noResultsMessage');


    let selectedLanguage = 'javascript'; // Значение по умолчанию

    // Загружаем язык из настроек
    chrome.storage.sync.get(['language'], (data) => {
        if (data.language) {
            selectedLanguage = data.language.toLowerCase();
        }
    });

    // Переключение между вкладками
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.content');

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            // Сбрасываем активные классы
            tabs.forEach((t) => t.classList.remove('active'));
            contents.forEach((c) => c.classList.remove('active'));

            // Активируем выбранную вкладку и соответствующий контент
            tab.classList.add('active');
            document.getElementById(`${tab.id.replace('-tab', '')}`).classList.add('active');
        });
    });

    // Загрузка настроек (для отображения в UI)
    chrome.storage.sync.get(['apiKey', 'language', 'framework', 'useId', 'useClass', 'useCss', 'useXpath'], (data) => {
        document.getElementById('language').value = data.language || 'Java';
        if (data.apiKey) {
            document.getElementById('apiKey').value = data.apiKey;
        }
        document.getElementById('framework').value = data.framework || 'Selenide';
        document.getElementById('useId').checked = data.useId ?? true;
        document.getElementById('useClass').checked = data.useClass ?? true;
        document.getElementById('useCss').checked = data.useCss ?? true;
        document.getElementById('useXpath').checked = data.useXpath ?? true;
    });

    // Сохранение API-ключа
    document.getElementById('saveKey').addEventListener('click', () => {
        const apiKey = document.getElementById('apiKey').value;
        chrome.storage.sync.set({ apiKey }, () => {
            alert('API Key saved successfully!');
        });
    });

    // Сохранение настроек
    document.getElementById('save').addEventListener('click', () => {
        const settings = {
            language: document.getElementById('language').value,
            framework: document.getElementById('framework').value,
            useId: document.getElementById('useId').checked,
            useClass: document.getElementById('useClass').checked,
            useCss: document.getElementById('useCss').checked,
            useXpath: document.getElementById('useXpath').checked,
        };

        chrome.storage.sync.set(settings, () => {
            alert('Settings saved successfully!');
        });
    });

    // Загрузка результатов
    chrome.storage.local.get(["locators", "pageObject"], (data) => {
        const locators = data.locators;
        const pageObject = data.pageObject;


        let content = "";

        // Парсинг текста с поддержкой `###` и ``` в HTML
        if (locators) {
            // Парсинг текста с поддержкой `###` и ``` в HTML
            const formattedLocators = locators
                .replace(/### (.+)/g, '<h3>$1</h3>') // Заголовки ### -> h3
                .replace(/```([\s\S]*?)```/g, (match, codeBlock) => {
                    return `<pre><code class="language-${selectedLanguage}">${Prism.highlight(
                        codeBlock,
                        Prism.languages[selectedLanguage] || Prism.languages.plaintext,
                        selectedLanguage
                    )}</code></pre>`;
                })
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); // Текст со звёздочками -> жирный

            content += `<h3>Generated Locators</h3>${formattedLocators}`;
        }

        // Форматирование Page Object
        if (pageObject) {
            const formattedPageObject = pageObject
                .replace(/### (.+)/g, '<h3>$1</h3>') // Заголовки ### -> h3
                .replace(/```([\s\S]*?)```/g, (match, codeBlock) => {
                    return `<pre><code class="language-${selectedLanguage}">${Prism.highlight(
                        codeBlock,
                        Prism.languages[selectedLanguage] || Prism.languages.plaintext,
                        selectedLanguage
                    )}</code></pre>`;
                })
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); // Текст со звёздочками -> жирный

            content += `<h3>Generated Page Object</h3>${formattedPageObject}`;
        }

        // Установка содержимого и отображение секции
        if (content) {
            outputDiv.innerHTML = content;
            instructionsDiv.classList.remove('hidden');
            noResultsMessage.classList.add('hidden');
        } else {
            outputDiv.innerHTML = '';
            instructionsDiv.classList.add('hidden');
            noResultsMessage.classList.remove('hidden');
        }
    });

    // Копирование в буфер обмена
    document.getElementById('copy').addEventListener('click', () => {
        const outputDiv = document.getElementById('output');
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = outputDiv.innerText; // Копируем только текст
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        alert('Code copied to clipboard!');
    });

    // Очистка результатов
    document.getElementById('clear').addEventListener('click', () => {
        chrome.storage.local.clear(() => {
            const outputDiv = document.getElementById('output');
            outputDiv.innerHTML = ''; // Очищаем содержимое
            instructionsDiv.classList.add('hidden');
            noResultsMessage.classList.remove('hidden');
            alert('Results cleared!');
        });
    });

    // Уточнение результатов
    document.getElementById('refine').addEventListener('click', async () => {
        const customPrompt = document.getElementById('customPrompt').value.trim();

        const loadingMessage = document.createElement('div');
        loadingMessage.textContent = 'Обновляем данные, пожалуйста ожидайте...';

        loadingMessage.style.color = '#EC7B4D';
        loadingMessage.style.fontSize = '14px';
        loadingMessage.style.fontWeight = 'bold';
        loadingMessage.style.textAlign = 'center';
        loadingMessage.style.marginTop = '20px';

        outputDiv.appendChild(loadingMessage);

        if (!customPrompt) {
            alert('Please provide instructions for refinement.');
            return;
        }
        chrome.runtime.sendMessage(
            { action: 'refineResults', prompt: customPrompt },
            (response) => {
                outputDiv.removeChild(loadingMessage);

                if (!response) {
                    alert("No response from background script");
                    return;
                }

                if (!response.success) {
                    alert(response.error || "An error occurred while refining results.");
                    return;
                }

                // Теперь безопасно деструктурируем
                const { refinedResults, resultType } = response;

                // Форматируем и вставляем
                const header = resultType === "locators"
                    ? '<h3>Refined Locators</h3>'
                    : '<h3>Refined Page Object</h3>';

                const formattedRefined = refinedResults
                    .replace(/### (.+)/g, '<h3>$1</h3>')
                    .replace(/```([\s\S]*?)```/g, (match, codeBlock) => {
                        return `<pre><code class="language-${selectedLanguage}">${Prism.highlight(
                            codeBlock,
                            Prism.languages[selectedLanguage] || Prism.languages.plaintext,
                            selectedLanguage
                        )}</code></pre>`;
                    })
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

                outputDiv.innerHTML = `${header}${formattedRefined}`;
                instructionsDiv.classList.remove('hidden');
                noResultsMessage.classList.add('hidden');

            }
        );
    });

    // Обработка сообщений от background.js при обновлении результатов
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "updateResults") {
            const { resultType, generatedCode } = message;

            // Формируем заголовок
            const header = resultType === "locators"
                ? `<h3>Generated Locators</h3>`
                : `<h3>Generated Page Object</h3>`;

            // Форматируем
            const formattedCode = generatedCode
                .replace(/### (.+)/g, '<h3>$1</h3>')
                .replace(/```([\s\S]*?)```/g, (match, codeBlock) => {
                    return `<pre><code class="language-${selectedLanguage}">${Prism.highlight(
                        codeBlock,
                        Prism.languages[selectedLanguage] || Prism.languages.plaintext,
                        selectedLanguage
                    )}</code></pre>`;
                })
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

            // Обновляем интерфейс
            outputDiv.innerHTML = `${header}${formattedCode}`;
            instructionsDiv.classList.remove('hidden');
            noResultsMessage.classList.add('hidden');

            sendResponse({ success: true });
        }
    });
});