
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
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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
// ЭКРАНИРОВАНИЕ ТЕКСТА ОШИБКИ
// ==========================================

function escapeHtml(value) {

    return String(value || '').replace(/[&<>"']/g, character => {

        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };

        return entities[character];
    });
}


// ==========================================
// ФОРМИРОВАНИЕ DISCORD EMBED
// ==========================================

function createDiscordPayload(data, formType) {

    const COLOR = 3096367;

    let title = "";
    let description = "";
    let fields = [];

    const timestamp =
        data.createdAt &&
        typeof data.createdAt.toDate === 'function'
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();


    // РАПОРТ ОБ ИЗМЕНЕНИИ ЗВАНИЯ

    if (formType === "Новый рапорт") {

        title = "📝 Новый рапорт о изменении звания.";

        description = "📌 **Основные данные**";

        fields = [
            {
                name: "Докладывает:",
                value: `\`${data.reporting}\`,
                inline: false
            },
            {
                name: "Кто выдал форму:",
                value: `\`${data.issuedBy}\``,
                inline: false
            },
            {
                name: "Н | П бойца:",
                value: `${data.soldierInfo}`,
                inline: false
            },
            {
                name: "Изменение звания:",
                value: `~~${data.oldRank}~~ ➔ **${data.newRank}**`,
                inline: false
            },
            {
                name: "SteamID:",
                value: `\`${data.steamId}\``,
                inline: false
            },
            {
                name: "Дата рапорта:",
                value: `${data.reportDate}`,
                inline: false
            }
        ];

    }

    // ЗАПРОС НА ПОВЫШЕНИЕ

    else if (formType === "Запрос на повышение") {

        title = "Форма рапорта запроса на проверку готовности к повышению";

        fields = [
            {
                name: "Докладывает:",
                value: `\`${data.reporting}\``,
                inline: false
            },
            {
                name: "Запрашиваю проверку на повышение в звании",
                value: `**${data.requestedRank}**`,
                inline: false
            }
        ];

    }

    // ПРАКТИЧЕСКАЯ ТРЕНИРОВКА

    else if (formType === "Практическая тренировка") {

        title = "Форма рапорта о тренировках";

        fields = [
            {
                name: "Докладывает:",
                value: `\`${data.reporting}\``,
                inline: false
            },
            {
                name: "Тренировка:",
                value: `**${data.trainingName}** (${data.location})`,
                inline: false
            },
            {
                name: "Состав:",
                value: `\`\`\`\n${data.participants}\n\`\`\``,
                inline: false
            },
            {
                name: "Описание:",
                value: data.description,
                inline: false
            },
            {
                name: "Примечание:",
                value: data.notes || "Нет",
                inline: false
            },
            {
                name: "Дата:",
                value: data.reportDate,
                inline: false
            }
        ];

    }

    // ТЕОРЕТИЧЕСКАЯ ТРЕНИРОВКА

    else if (formType === "Теоретическая тренировка") {

        title = "Форма рапорта о Теоретической тренировке";

        fields = [
            {
                name: "Докладывает:",
                value: `\`${data.reporting}\``,
                inline: false
            },
            {
                name: "Название:",
                value: `**${data.trainingName}**`,
                inline: false
            },
            {
                name: "Оценки состава:",
                value: `\`\`\`\n${data.participants}\n\`\`\``,
                inline: false
            },
            {
                name: "Примечание:",
                value: data.notes || "Нет",
                inline: false
            },
            {
                name: "Дата:",
                value: data.reportDate,
                inline: false
            }
        ];

    }

    else {
        throw new Error("Неизвестный тип рапорта: " + formType);
    }


    const embed = {
        title: title,
        color: COLOR,
        fields: fields,
        timestamp: timestamp
    };

    if (description) {
        embed.description = description;
    }

    return {
        embeds: [embed]
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
            // Ответ может быть не в формате JSON
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
// ОТОБРАЖЕНИЕ СТАТУСА В КАРТОЧКЕ
// ==========================================

function getSyncStatusHTML(data, docId) {

    const hasMessageId = Boolean(data.discordMessageId);

    const status = data.discordSyncStatus ||
        (hasMessageId ? "synced" : "missing");

    const errorText = data.discordSyncError
        ? escapeHtml(data.discordSyncError)
        : '';

    // УСПЕШНАЯ СИНХРОНИЗАЦИЯ

    if (status === "synced" && hasMessageId) {

        return `
            <p style="color: #4caf50; font-size: 13px;">
                ● Discord синхронизирован
            </p>
        `;
    }

    // ОЖИДАНИЕ СИНХРОНИЗАЦИИ

    if (status === "pending") {

        return `
            <p style="color: #f59e0b; font-size: 13px;">
                ● Ожидается синхронизация Discord
            </p>

            ${errorText ? `
                <p style="color: #9ca3af; font-size: 12px;">
                    Причина: ${errorText}
                </p>
            ` : ''}

            ${hasMessageId ? `
                <button
                    class="btn-submit"
                    style="margin-top: 5px; padding: 8px 15px; font-size: 13px;"
                    onclick="retryDiscordSync('${docId}')">
                    ПОВТОРИТЬ СИНХРОНИЗАЦИЮ
                </button>
            ` : ''}
        `;
    }

    // ОШИБКА СИНХРОНИЗАЦИИ

    if (status === "failed") {

        return `
            <p style="color: #ef4444; font-size: 13px;">
                ● Ошибка синхронизации Discord
            </p>

            ${errorText ? `
                <p style="color: #ef4444; font-size: 12px; overflow-wrap: anywhere;">
                    Причина: ${errorText}
                </p>
            ` : ''}

            ${hasMessageId ? `
                <button
                    class="btn-submit"
                    style="margin-top: 5px; padding: 8px 15px; font-size: 13px;"
                    onclick="retryDiscordSync('${docId}')">
                    ПОВТОРИТЬ СИНХРОНИЗАЦИЮ
                </button>
            ` : `
                <p style="color: #f59e0b; font-size: 12px;">
                    ID сообщения Discord отсутствует. Автоматическое обновление сообщения невозможно.
                </p>
            `}
        `;
    }

    // ОТСУТСТВУЕТ ID СООБЩЕНИЯ

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

            // Просроченные рапорты не удаляем
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
// ЗАКРЫТИЕ ОКНА
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
            throw new Error('Срок редактирования рапорта истёк.');
        }

        if (!data.discordMessageId) {
            throw new Error(
                'У рапорта отсутствует ID сообщения Discord.'
            );
        }

        const formType = data.formType || "Новый рапорт";

        await setSyncStatus(docRef, "pending");

        try {

            await updateDiscordMessage(data, formType);

            await setSyncStatus(docRef, "synced");

            alert('Синхронизация с Discord успешно завершена!');

        } catch (syncError) {

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

        const currentDoc = await docRef.get();

        if (!currentDoc.exists) {
            throw new Error('Рапорт не найден.');
        }

        const currentData = currentDoc.data();

        if (currentData.userId !== user.uid) {
            throw new Error('Нет доступа к этому рапорту.');
        }

        const formType =
            currentData.formType ||
            requestedFormType ||
            "Новый рапорт";

        if (!isReportActive(currentData)) {

            closeModal();

            await loadReports(user);

            throw new Error(
                'Срок редактирования рапорта истёк. Прошло более 3 дней.'
            );
        }

        if (requestedFormType !== formType) {
            throw new Error(
                'Тип рапорта изменился. Закройте окно и откройте его заново.'
            );
        }

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

        else if (formType === "Новый рапорт") {

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

        } else {

            throw new Error('Неизвестный тип рапорта: ' + formType);

        }


        const mergedData = {
            ...currentData,
            ...updatedData
        };


        // Сохраняем изменения в Firestore

        await docRef.update({

            ...updatedData,

            discordSyncStatus: "pending",

            discordSyncError:
                firebase.firestore.FieldValue.delete(),

            discordSyncUpdatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });


        // Обновляем Discord

        try {

            await updateDiscordMessage(mergedData, formType);

            await setSyncStatus(docRef, "synced");

            alert(
                'Рапорт успешно обновлён в Firestore и Discord!'
            );

        } catch (syncError) {

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
                '\n\nВ личном кабинете будет показана причина ошибки и возможность повторной синхронизации, если ID сообщения известен.'
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
