
const firebaseConfig = {
    apiKey: "AIzaSyAOOP79OWQn_RjiI5bFk28a_At6jJ9o6qU",
    authDomain: "raportovanie-41.firebaseapp.com",
    projectId: "raportovanie-41",
    storageBucket: "raportovanie-41.appspot.com",
    messagingSenderId: "1097924602121",
    appId: "1:1097924602121:web:90662309434c46ced9cbd8"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const DISCORD_WEBHOOK_URL =
    'https://erk-proxy.cotnow1000.workers.dev/report';

const PROMOTION_WEBHOOK_URL =
    'https://erk-proxy.cotnow1000.workers.dev/promotion';

const TRAINING_WEBHOOK_URL =
    'https://erk-proxy.cotnow1000.workers.dev/training';

const rankChangeList = document.getElementById('rankChangeList');
const promotionList = document.getElementById('promotionList');
const practicalList = document.getElementById('practicalList');
const theoryList = document.getElementById('theoryList');


// ==========================================
// ВЫБОР WEBHOOK ПО ТИПУ РАПОРТА
// ==========================================

function getWebhookUrl(formType) {

    if (formType === "Запрос на повышение") {
        return PROMOTION_WEBHOOK_URL;
    }

    if (
        formType === "Практическая тренировка" ||
        formType === "Теоретическая тренировка"
    ) {
        return TRAINING_WEBHOOK_URL;
    }

    return DISCORD_WEBHOOK_URL;
}


// ==========================================
// ПРОВЕРКА СРОКА ДЕЙСТВИЯ РАПОРТА
// ==========================================

function isReportActive(data) {

    if (
        !data.expires_at ||
        typeof data.expires_at.toDate !== 'function'
    ) {
        return false;
    }

    return data.expires_at.toDate().getTime() > Date.now();
}


// ==========================================
// СОЗДАНИЕ DISCORD EMBED
// ==========================================

function createDiscordPayload(data, formType) {

    let title = "";
    let fields = [];

    // ЗАПРОС НА ПОВЫШЕНИЕ
    if (formType === "Запрос на повышение") {

        title = "Запрос на повышение (ИЗМЕНЕНО)";

        fields = [
            {
                name: "Докладывает:",
                value: `\`${data.reporting || "Не указано"}\``,
                inline: false
            },
            {
                name: "Запрос:",
                value: data.requestedRank || "Не указано",
                inline: false
            }
        ];

    }

    // ПРАКТИЧЕСКАЯ ТРЕНИРОВКА
    else if (formType === "Практическая тренировка") {

        title = "Практическая тренировка (ИЗМЕНЕНО)";

        fields = [
            {
                name: "Докладывает:",
                value: `\`${data.reporting || "Не указано"}\``,
                inline: false
            },
            {
                name: "Тренировка:",
                value: `**${data.trainingName || "Не указано"}**`,
                inline: false
            },
            {
                name: "Место проведения:",
                value: data.location || "Не указано",
                inline: false
            },
            {
                name: "Состав:",
                value: `\`\`\`\n${data.participants || "Не указано"}\n\`\`\``,
                inline: false
            },
            {
                name: "Описание:",
                value: data.description || "Не указано",
                inline: false
            },
            {
                name: "Примечание:",
                value: data.notes || "Нет",
                inline: false
            },
            {
                name: "Дата:",
                value: data.reportDate || "Не указана",
                inline: false
            }
        ];

    }

    // ТЕОРЕТИЧЕСКАЯ ТРЕНИРОВКА
    else if (formType === "Теоретическая тренировка") {

        title = "Теоретическая тренировка (ИЗМЕНЕНО)";

        fields = [
            {
                name: "Докладывает:",
                value: `\`${data.reporting || "Не указано"}\``,
                inline: false
            },
            {
                name: "Название:",
                value: `**${data.trainingName || "Не указано"}**`,
                inline: false
            },
            {
                name: "Оценки состава:",
                value: `\`\`\`\n${data.participants || "Не указано"}\n\`\`\``,
                inline: false
            },
            {
                name: "Примечание:",
                value: data.notes || "Нет",
                inline: false
            },
            {
                name: "Дата:",
                value: data.reportDate || "Не указана",
                inline: false
            }
        ];

    }

    // РАПОРТ ОБ ИЗМЕНЕНИИ ЗВАНИЯ
    else {

        title = "📝 РАПОРТ (Отредактировано бойцом)";

        fields = [
            {
                name: "Докладывает:",
                value: `\`${data.reporting || "Не указано"}\``,
                inline: false
            },
            {
                name: "Кто выдал форму:",
                value: `\`${data.issuedBy || "Не указано"}\``,
                inline: false
            },
            {
                name: "Н | П бойца:",
                value: data.soldierInfo || "Не указано",
                inline: false
            },
            {
                name: "Изменение звания:",
                value: `~~${data.oldRank || "Не указано"}~~ ➔ **${data.newRank || "Не указано"}**`,
                inline: false
            },
            {
                name: "SteamID:",
                value: `\`${data.steamId || "Не указано"}\``,
                inline: false
            },
            {
                name: "Дата рапорта:",
                value: data.reportDate || "Не указана",
                inline: false
            }
        ];
    }

    return {
        embeds: [{
            title: title,
            color: 9109504,
            fields: fields
        }]
    };
}


// ==========================================
// ОТПРАВКА ОБНОВЛЕНИЯ В DISCORD
// ==========================================

async function updateDiscordMessage(data, formType) {

    if (!data.discordMessageId) {
        throw new Error(
            'У рапорта отсутствует ID сообщения Discord.'
        );
    }

    const webhookUrl = getWebhookUrl(formType);

    if (!webhookUrl) {
        throw new Error('Не найден адрес Discord Worker.');
    }

    const payload = createDiscordPayload(data, formType);

    const response = await fetch(
        `${webhookUrl}/messages/${encodeURIComponent(data.discordMessageId)}`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }
    );

    const responseText = await response.text();

    if (!response.ok) {

        let errorDetails = responseText;

        try {
            const result = JSON.parse(responseText);
            errorDetails = result.message || result.error || responseText;
        } catch (error) {
            // Ответ Discord может быть не в формате JSON
        }

        throw new Error(
            `HTTP ${response.status}: ${errorDetails || "Ошибка Discord"}`
        );
    }

}


// ==========================================
// СОХРАНЕНИЕ СТАТУСА СИНХРОНИЗАЦИИ
// ==========================================

async function setSyncStatus(docRef, status, errorMessage = null) {

    const update = {
        discordSyncStatus: status,
        discordSyncUpdatedAt:
            firebase.firestore.FieldValue.serverTimestamp()
    };

    if (status === "synced") {

        update.discordSyncedAt =
            firebase.firestore.FieldValue.serverTimestamp();

        update.discordSyncError =
            firebase.firestore.FieldValue.delete();

    } else if (errorMessage) {

        update.discordSyncError =
            String(errorMessage).slice(0, 1000);

    } else {

        update.discordSyncError =
            firebase.firestore.FieldValue.delete();
    }

    await docRef.update(update);
}


// ==========================================
// ИНФОРМАЦИЯ О СТАТУСЕ В КАРТОЧКЕ
// ==========================================

function getSyncStatusHTML(data, docId) {

    const hasMessageId = Boolean(data.discordMessageId);

    const status = data.discordSyncStatus ||
        (hasMessageId ? "synced" : "missing");

    if (status === "synced" && hasMessageId) {

        return `
            <p style="color: #4caf50; font-size: 13px;">
                ● Discord синхронизирован
            </p>
        `;
    }

    if (status === "pending" && hasMessageId) {

        return `
            <p style="color: #f59e0b; font-size: 13px;">
                ● Ожидается синхронизация Discord
            </p>
            <button
                class="btn-submit"
                style="margin-top: 5px; padding: 8px 15px; font-size: 13px;"
                onclick="retryDiscordSync('${docId}')">
                ПОВТОРИТЬ СИНХРОНИЗАЦИЮ
            </button>
        `;
    }

    if (status === "failed" && hasMessageId) {

        return `
            <p style="color: #ef4444; font-size: 13px;">
                ● Ошибка синхронизации Discord
            </p>
            <button
                class="btn-submit"
                style="margin-top: 5px; padding: 8px 15px; font-size: 13px;"
                onclick="retryDiscordSync('${docId}')">
                ПОВТОРИТЬ СИНХРОНИЗАЦИЮ
            </button>
        `;
    }

    if (!hasMessageId) {

        return `
            <p style="color: #f59e0b; font-size: 13px;">
                ● Отсутствует ID сообщения Discord
            </p>
        `;
    }

    return '';
}


// ==========================================
// АВТОРИЗАЦИЯ
// ==========================================

auth.onAuthStateChanged((user) => {

    if (user) {

        loadReports(user);

    } else {

        setTimeout(() => {

            if (!auth.currentUser) {
                window.location.href = '../login/login.html';
            }

        }, 1000);
    }
});


// ==========================================
// ЗАГРУЗКА РАПОРТОВ
// ==========================================

async function loadReports(user) {

    const lists = [
        rankChangeList,
        promotionList,
        practicalList,
        theoryList
    ];

    lists.forEach(list => {
        list.innerHTML = 'Поиск...';
    });

    try {

        const snapshot = await db.collection('reports')
            .where('userId', '==', user.uid)
            .get();

        lists.forEach(list => {
            list.innerHTML = '';
        });

        let hasRank = false;
        let hasPromo = false;
        let hasPract = false;
        let hasTheory = false;

        snapshot.forEach(doc => {

            const data = doc.data();

            // Просроченные записи просто скрываем.
            // Удалять их из Firestore запрещено.
            if (!isReportActive(data)) {
                return;
            }

            const card = document.createElement('div');

            card.style.cssText =
                'border: 1px solid #374151; padding: 15px; margin-bottom: 15px; background-color: #1a1e1b; border-radius: 4px;';

            const safeData = JSON.stringify(data)
                .replace(/'/g, "&#39;");

            const syncHTML = getSyncStatusHTML(data, doc.id);

            const editButton = `
                <button
                    class="btn-submit"
                    style="margin-top: 10px; padding: 8px 15px; font-size: 14px;"
                    onclick='openModal("${doc.id}", ${safeData})'>
                    Редактировать
                </button>
            `;

            if (data.formType === "Запрос на повышение") {

                hasPromo = true;

                card.innerHTML = `
                    <p><strong>Докладывает:</strong> ${data.reporting || ""}</p>
                    <p><strong>Запрос:</strong> ${data.requestedRank || ""}</p>
                    ${syncHTML}
                    ${editButton}
                `;

                promotionList.appendChild(card);

            } else if (data.formType === "Практическая тренировка") {

                hasPract = true;

                card.innerHTML = `
                    <p><strong>Тренировка:</strong> ${data.trainingName || ""}</p>
                    <p><strong>Докладывает:</strong> ${data.reporting || ""}</p>
                    <p><strong>Дата:</strong> ${data.reportDate || ""}</p>
                    ${syncHTML}
                    ${editButton}
                `;

                practicalList.appendChild(card);

            } else if (data.formType === "Теоретическая тренировка") {

                hasTheory = true;

                card.innerHTML = `
                    <p><strong>Тренировка:</strong> ${data.trainingName || ""}</p>
                    <p><strong>Докладывает:</strong> ${data.reporting || ""}</p>
                    <p><strong>Дата:</strong> ${data.reportDate || ""}</p>
                    ${syncHTML}
                    ${editButton}
                `;

                theoryList.appendChild(card);

            } else {

                hasRank = true;

                card.innerHTML = `
                    <p><strong>Боец:</strong> ${data.soldierInfo || ""}</p>
                    <p><strong>Звание:</strong> ${data.oldRank || ""} ➔ ${data.newRank || ""}</p>
                    <p><strong>Дата:</strong> ${data.reportDate || ""}</p>
                    ${syncHTML}
                    ${editButton}
                `;

                rankChangeList.appendChild(card);
            }

        });

        if (!hasRank) {
            rankChangeList.innerHTML =
                '<p>У вас нет активных рапортов этого типа.</p>';
        }

        if (!hasPromo) {
            promotionList.innerHTML =
                '<p>У вас нет активных рапортов этого типа.</p>';
        }

        if (!hasPract) {
            practicalList.innerHTML =
                '<p>У вас нет активных рапортов этого типа.</p>';
        }

        if (!hasTheory) {
            theoryList.innerHTML =
                '<p>У вас нет активных рапортов этого типа.</p>';
        }

    } catch (error) {

        console.error('Ошибка загрузки рапортов:', error);

        lists.forEach(list => {
            list.innerHTML =
                '<p style="color:#ef4444;">Не удалось загрузить рапорты. Обновите страницу.</p>';
        });
    }
}


// ==========================================
// ОТКРЫТИЕ ОКНА РЕДАКТИРОВАНИЯ
// ==========================================

window.openModal = function(docId, data) {

    const formType = data.formType || "Новый рапорт";

    document.getElementById('editDocId').value = docId;
    document.getElementById('editFormType').value = formType;
    document.getElementById('editReporting').value =
        data.reporting || '';

    const groupRank = document.getElementById('group-rank');
    const groupPromo = document.getElementById('group-promotion');
    const groupTraining = document.getElementById('group-training');

    const practicalFields =
        document.getElementById('group-practical-details');

    const groupDate =
        document.getElementById('group-date');

    const modalTitle = document.getElementById('modalTitle');

    groupRank.style.display = 'none';
    groupPromo.style.display = 'none';
    groupTraining.style.display = 'none';
    practicalFields.style.display = 'none';

    groupDate.style.display =
        formType === "Запрос на повышение" ? 'none' : 'block';

    document.getElementById('editReportDate').value =
        data.reportDate || '';

    if (formType === "Запрос на повышение") {

        modalTitle.textContent =
            "Редактирование запроса на повышение";

        groupPromo.style.display = 'block';

        document.getElementById('editRequestedRank').value =
            data.requestedRank || '';

    } else if (
        formType === "Практическая тренировка" ||
        formType === "Теоретическая тренировка"
    ) {

        modalTitle.textContent = "Редактирование тренировки";

        groupTraining.style.display = 'block';

        document.getElementById('editTrainingName').value =
            data.trainingName || '';

        document.getElementById('editParticipants').value =
            data.participants || '';

        document.getElementById('editNotes').value =
            data.notes || '';

        if (formType === "Практическая тренировка") {

            practicalFields.style.display = 'block';

            document.getElementById('editLocation').value =
                data.location || '';

            document.getElementById('editDescription').value =
                data.description || '';
        }

    } else {

        modalTitle.textContent = "Редактирование рапорта";

        groupRank.style.display = 'block';

        document.getElementById('editIssuedBy').value =
            data.issuedBy || '';

        document.getElementById('editSoldierInfo').value =
            data.soldierInfo || '';

        document.getElementById('editSteamId').value =
            data.steamId || '';

        document.getElementById('editOldRank').value =
            data.oldRank || '';

        document.getElementById('editNewRank').value =
            data.newRank || '';
    }

    document.getElementById('editModal').style.display = 'flex';
};


// ==========================================
// ЗАКРЫТИЕ ОКНА РЕДАКТИРОВАНИЯ
// ==========================================

window.closeModal = function() {

    document.getElementById('editModal').style.display = 'none';
};


// ==========================================
// ПОВТОРНАЯ СИНХРОНИЗАЦИЯ DISCORD
// ==========================================

window.retryDiscordSync = async function(docId) {

    const user = auth.currentUser;

    if (!user) {
        alert('Необходимо войти в систему.');
        return;
    }

    const docRef = db.collection('reports').doc(docId);

    try {

        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            throw new Error('Рапорт не найден.');
        }

        const data = docSnap.data();

        if (data.userId !== user.uid) {
            throw new Error('Нет доступа к этому рапорту.');
        }

        if (!isReportActive(data)) {
            throw new Error(
                'Срок редактирования рапорта истёк.'
            );
        }

        if (!data.discordMessageId) {
            throw new Error(
                'У рапорта отсутствует ID сообщения Discord.'
            );
        }

        const formType = data.formType || "Новый рапорт";

        // Ставим статус ожидания
        await setSyncStatus(docRef, "pending");

        try {

            // Отправляем актуальные данные в исходное сообщение
            await updateDiscordMessage(data, formType);

            // Discord успешно обновлён
            await setSyncStatus(docRef, "synced");

            alert('Синхронизация с Discord успешно завершена!');

        } catch (syncError) {

            // Сохраняем ошибку для последующей попытки
            try {

                await setSyncStatus(
                    docRef,
                    "failed",
                    syncError.message
                );

            } catch (statusError) {

                console.error(
                    'Не удалось сохранить статус ошибки:',
                    statusError
                );
            }

            alert(
                'Не удалось обновить Discord.\n\n' +
                syncError.message +
                '\n\nРапорт остался сохранён в Firestore. Попробуйте повторить синхронизацию позже.'
            );
        }

        await loadReports(user);

    } catch (error) {

        console.error('Ошибка повторной синхронизации:', error);

        alert('Ошибка: ' + error.message);
    }
};


// ==========================================
// СОХРАНЕНИЕ И РЕДАКТИРОВАНИЕ РАПОРТА
// ==========================================

document.getElementById('editForm')
    .addEventListener('submit', async function(event) {

    event.preventDefault();

    const submitBtn = event.target.querySelector(
        'button[type="submit"]'
    );

    if (submitBtn.disabled) {
        return;
    }

    submitBtn.disabled = true;

    const docId =
        document.getElementById('editDocId').value;

    const requestedFormType =
        document.getElementById('editFormType').value;

    const user = auth.currentUser;

    if (!user) {
        submitBtn.disabled = false;
        alert('Необходимо войти в систему.');
        return;
    }

    try {

        const docRef = db.collection('reports').doc(docId);

        // Получаем актуальный документ
        const currentDoc = await docRef.get();

        if (!currentDoc.exists) {
            throw new Error('Рапорт не найден.');
        }

        const currentData = currentDoc.data();

        // Проверяем владельца рапорта
        if (currentData.userId !== user.uid) {
            throw new Error('Нет доступа к этому рапорту.');
        }

        // Определяем действительный тип формы
        const formType =
            currentData.formType || requestedFormType || "Новый рапорт";

        // Проверяем срок действия
        if (!isReportActive(currentData)) {

            closeModal();

            await loadReports(user);

            throw new Error(
                'Срок редактирования рапорта истёк. Прошло более 3 дней.'
            );
        }

        // Проверяем, что тип формы не изменился
        if (requestedFormType !== formType) {
            throw new Error(
                'Тип рапорта изменился. Закройте окно и откройте его заново.'
            );
        }

        // Подготавливаем изменённые данные
        const updatedData = {
            reporting:
                document.getElementById('editReporting').value.trim()
        };

        // ЗАПРОС НА ПОВЫШЕНИЕ
        if (formType === "Запрос на повышение") {

            updatedData.requestedRank =
                document.getElementById('editRequestedRank').value.trim();

        }

        // ТРЕНИРОВКИ
        else if (
            formType === "Практическая тренировка" ||
            formType === "Теоретическая тренировка"
        ) {

            updatedData.trainingName =
                document.getElementById('editTrainingName').value.trim();

            updatedData.participants =
                document.getElementById('editParticipants').value;

            updatedData.notes =
                document.getElementById('editNotes').value;

            updatedData.reportDate =
                document.getElementById('editReportDate').value;

            if (formType === "Практическая тренировка") {

                updatedData.location =
                    document.getElementById('editLocation').value.trim();

                updatedData.description =
                    document.getElementById('editDescription').value;
            }

        }

        // ИЗМЕНЕНИЕ ЗВАНИЯ
        else {

            updatedData.issuedBy =
                document.getElementById('editIssuedBy').value.trim();

            updatedData.soldierInfo =
                document.getElementById('editSoldierInfo').value.trim();

            updatedData.steamId =
                document.getElementById('editSteamId').value.trim();

            updatedData.oldRank =
                document.getElementById('editOldRank').value;

            updatedData.newRank =
                document.getElementById('editNewRank').value;

            updatedData.reportDate =
                document.getElementById('editReportDate').value;
        }

        // Объединяем сохранённые и новые данные
        const mergedData = {
            ...currentData,
            ...updatedData
        };

        // Сначала фиксируем изменения в Firestore
        // и ставим статус ожидания синхронизации
        await docRef.update({
            ...updatedData,
            discordSyncStatus: "pending",
            discordSyncError:
                firebase.firestore.FieldValue.delete(),
            discordSyncUpdatedAt:
                firebase.firestore.FieldValue.serverTimestamp()
        });

        try {

            // Отправляем изменения в Discord
            await updateDiscordMessage(mergedData, formType);

            // Отмечаем успешную синхронизацию
            await setSyncStatus(docRef, "synced");

            alert(
                'Рапорт успешно обновлён в Firestore и Discord!'
            );

        } catch (syncError) {

            // Сохраняем статус ошибки
            try {

                await setSyncStatus(
                    docRef,
                    "failed",
                    syncError.message
                );

            } catch (statusError) {

                console.error(
                    'Не удалось сохранить статус синхронизации:',
                    statusError
                );
            }

            alert(
                'Изменения сохранены в Firestore, но Discord не обновился.\n\n' +
                syncError.message +
                '\n\nВ личном кабинете появилась кнопка повторной синхронизации.'
            );
        }

        closeModal();

        await loadReports(user);

    } catch (error) {

        console.error('Ошибка редактирования рапорта:', error);

        alert('Ошибка: ' + error.message);

    } finally {

        submitBtn.disabled = false;
    }

});


// ==========================================
// ВЫХОД ИЗ АККАУНТА
// ==========================================

const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {

    logoutBtn.addEventListener('click', () => {

        auth.signOut().then(() => {
            window.location.href = '../login/login.html';
        });

    });
}
