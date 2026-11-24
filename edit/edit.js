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

let currentProfileData = null;
const reportDataById = Object.create(null);


// ==========================================
// ПОЛУЧЕНИЕ И ПРОВЕРКА ПРОФИЛЯ
// ==========================================

async function getCurrentProfileData(user) {

    const profileSnapshot = await db
        .collection('users')
        .doc(user.uid)
        .get();

    if (!profileSnapshot.exists) {
        throw new Error('Профиль пользователя не найден.');
    }

    const profile = profileSnapshot.data();

    if (profile.status !== 'approved') {
        throw new Error('Ваш аккаунт ещё не одобрен администрацией.');
    }

    if (
        typeof profile.callsign !== 'string' ||
        profile.callsign.trim().length < 2 ||
        profile.callsign.trim().length > 30
    ) {

        throw new Error(
            'Для просмотра и редактирования рапортов необходимо заполнить позывной в профиле.'
        );

    }

    const soldierNumber =
        typeof profile.soldierNumber === 'string' &&
        profile.soldierNumber.trim()
            ? profile.soldierNumber.trim()
            : (user.email ? user.email.split('@')[0] : '');

    if (!soldierNumber) {
        throw new Error('Не удалось определить номер бойца.');
    }

    let authorRank = profile.rank;
    let accessLevel = profile.accessLevel;

    if (
        ['admin', 'superadmin'].includes(profile.role) &&
        (!authorRank || !Number.isInteger(accessLevel))
    ) {

        authorRank = 'Администрация';
        accessLevel = 7;

    }

    if (
        typeof authorRank !== 'string' ||
        !authorRank.trim() ||
        !Number.isInteger(accessLevel) ||
        accessLevel < 0 ||
        accessLevel > 7
    ) {

        throw new Error(
            'В профиле не назначено корректное звание или уровень доступа. Обратитесь к администрации.'
        );

    }

    return {
        soldierNumber,
        callsign: profile.callsign.trim(),
        authorRank: authorRank.trim(),
        accessLevel
    };

}


function getIdentityString(profile) {

    return `${profile.soldierNumber} | ${profile.callsign} | ${profile.authorRank}`;

}


function getStoredReporting(data) {

    if (
        typeof data.reporting === 'string' &&
        data.reporting.trim()
    ) {

        return data.reporting;

    }

    if (
        data.soldierNumber ||
        data.callsign ||
        data.authorRank
    ) {

        return [
            data.soldierNumber,
            data.callsign,
            data.authorRank
        ]
            .filter(value =>
                value !== undefined &&
                value !== null &&
                String(value).trim()
            )
            .join(' | ');

    }

    return '';

}


function getStoredSoldierInfo(data) {

    if (
        typeof data.soldierInfo === 'string' &&
        data.soldierInfo.trim()
    ) {

        return data.soldierInfo;

    }

    return [
        data.soldierNumber,
        data.callsign
    ]
        .filter(value =>
            value !== undefined &&
            value !== null &&
            String(value).trim()
        )
        .join(' | ');

}


// ==========================================
// ВЫБОР WEBHOOK ПО ТИПУ РАПОРТА
// ==========================================

function getWebhookUrl(formType) {

    if (formType === 'Запрос на повышение') {
        return PROMOTION_WEBHOOK_URL;
    }

    if (
        formType === 'Практическая тренировка' ||
        formType === 'Теоретическая тренировка'
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
// ЭКРАНИРОВАНИЕ ТЕКСТА
// ==========================================

function escapeHtml(value) {

    return String(value ?? '').replace(/[&<>"']/g, character => {

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

    let title = '';
    let description = '';
    let fields = [];

    const timestamp =
        data.createdAt &&
        typeof data.createdAt.toDate === 'function'
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();


    // РАПОРТ ОБ ИЗМЕНЕНИИ ЗВАНИЯ

    if (formType === 'Новый рапорт') {

        title = '📝 Новый рапорт о изменении звания.';

        description = '📌 **Основные данные**';

        fields = [

            {
                name: 'Докладывает:',
                value: `\`${data.reporting || ''}\``,
                inline: false
            },

            {
                name: 'Кто выдал форму:',
                value: `\`${data.issuedBy || ''}\``,
                inline: false
            },

            {
                name: 'Н | П бойца:',
                value: data.soldierInfo || '',
                inline: false
            },

            {
                name: 'Изменение звания:',
                value: `~~${data.oldRank || ''}~~ ➔ **${data.newRank || ''}**`,
                inline: false
            },

            {
                name: 'SteamID:',
                value: `\`${data.steamId || ''}\``,
                inline: false
            },

            {
                name: 'Дата рапорта:',
                value: data.reportDate || '',
                inline: false
            }

        ];

    }


    // ЗАПРОС НА ПОВЫШЕНИЕ

    else if (formType === 'Запрос на повышение') {

        title = 'Форма рапорта запроса на проверку готовности к повышению';

        fields = [

            {
                name: 'Докладывает:',
                value: `\`${data.reporting || ''}\``,
                inline: false
            },

            {
                name: 'Запрашиваю проверку на повышение в звании',
                value: `**${data.requestedRank || ''}**`,
                inline: false
            }

        ];

    }


    // ПРАКТИЧЕСКАЯ ТРЕНИРОВКА

    else if (formType === 'Практическая тренировка') {

        title = 'Форма рапорта о тренировках';

        fields = [

            {
                name: 'Докладывает:',
                value: `\`${data.reporting || ''}\``,
                inline: false
            },

            {
                name: 'Тренировка:',
                value: `**${data.trainingName || ''}** (${data.location || ''})`,
                inline: false
            },

            {
                name: 'Состав:',
                value: `\`\`\`\n${data.participants || ''}\n\`\`\``,
                inline: false
            },

            {
                name: 'Описание:',
                value: data.description || '',
                inline: false
            },

            {
                name: 'Примечание:',
                value: data.notes || 'Нет',
                inline: false
            },

            {
                name: 'Дата:',
                value: data.reportDate || '',
                inline: false
            }

        ];

    }


    // ТЕОРЕТИЧЕСКАЯ ТРЕНИРОВКА

    else if (formType === 'Теоретическая тренировка') {

        title = 'Форма рапорта о Теоретической тренировке';

        fields = [

            {
                name: 'Докладывает:',
                value: `\`${data.reporting || ''}\``,
                inline: false
            },

            {
                name: 'Название:',
                value: `**${data.trainingName || ''}**`,
                inline: false
            },

            {
                name: 'Оценки состава:',
                value: `\`\`\`\n${data.participants || ''}\n\`\`\``,
                inline: false
            },

            {
                name: 'Примечание:',
                value: data.notes || 'Нет',
                inline: false
            },

            {
                name: 'Дата:',
                value: data.reportDate || '',
                inline: false
            }

        ];

    } else {

        throw new Error(
            'Неизвестный тип рапорта: ' + formType
        );

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
// ОБНОВЛЕНИЕ СООБЩЕНИЯ DISCORD
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

            errorDetails =
                result.message ||
                result.error ||
                responseText;

        } catch (error) {

            // Ответ может быть не в формате JSON.

        }

        throw new Error(
            `HTTP ${response.status}: ${errorDetails || 'Ошибка Discord'}`
        );

    }

}


// ==========================================
// СОХРАНЕНИЕ СТАТУСА СИНХРОНИЗАЦИИ
// ==========================================

async function setSyncStatus(
    docRef,
    status,
    errorMessage = null
) {

    const update = {

        discordSyncStatus: status,

        discordSyncUpdatedAt:
            firebase.firestore.FieldValue.serverTimestamp()

    };

    if (status === 'synced') {

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
// ОТОБРАЖЕНИЕ СТАТУСА СИНХРОНИЗАЦИИ
// ==========================================

function getSyncStatusHTML(data, docId) {

    const hasMessageId = Boolean(data.discordMessageId);

    const status = data.discordSyncStatus ||
        (hasMessageId ? 'synced' : 'missing');

    const safeDocId = escapeHtml(docId);

    const errorText = data.discordSyncError
        ? escapeHtml(data.discordSyncError)
        : '';


    if (status === 'synced' && hasMessageId) {

        return `
            <p style="color: #4caf50; font-size: 13px;">
                ● Discord синхронизирован
            </p>
        `;

    }


    if (status === 'pending') {

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
                    type="button"
                    class="btn-submit"
                    style="margin-top: 5px; padding: 8px 15px; font-size: 13px;"
                    data-retry-sync="${safeDocId}"
                >
                    ПОВТОРИТЬ СИНХРОНИЗАЦИЮ
                </button>

            ` : ''}

        `;

    }


    if (status === 'failed') {

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
                    type="button"
                    class="btn-submit"
                    style="margin-top: 5px; padding: 8px 15px; font-size: 13px;"
                    data-retry-sync="${safeDocId}"
                >
                    ПОВТОРИТЬ СИНХРОНИЗАЦИЮ
                </button>

            ` : `

                <p style="color: #f59e0b; font-size: 12px;">
                    ID сообщения Discord отсутствует. Повторная синхронизация пока невозможна.
                </p>

            `}

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

auth.onAuthStateChanged(async user => {

    if (!user) {

        currentProfileData = null;

        setTimeout(() => {

            if (!auth.currentUser) {

                window.location.href =
                    '../login/login.html';

            }

        }, 1000);

        return;

    }

    try {

        currentProfileData =
            await getCurrentProfileData(user);

        await loadReports(user);

    } catch (error) {

        console.error(
            'Ошибка проверки профиля:',
            error
        );

        const lists = [
            rankChangeList,
            promotionList,
            practicalList,
            theoryList
        ];

        lists.forEach(list => {

            if (list) {

                list.innerHTML = `
                    <p style="color:#ef4444;">
                        ${escapeHtml(error.message)}
                    </p>
                `;

            }

        });

        if (
            error.message.toLowerCase().includes('позывной')
        ) {

            alert(
                error.message +
                '\n\nСейчас вы будете перенаправлены в профиль.'
            );

            window.location.href =
                '../dashboard/index.html';

        }

    }

});


// ==========================================
// ЗАГРУЗКА АКТИВНЫХ РАПОРТОВ
// ==========================================

async function loadReports(user, showLoading = true) {

    const lists = [
        rankChangeList,
        promotionList,
        practicalList,
        theoryList
    ].filter(Boolean);


    // Показываем загрузку при первоначальном открытии.

    if (showLoading) {

        lists.forEach(list => {
            list.innerHTML = 'Поиск...';
        });

    }


    try {

        // Загружаем только собственные активные рапорты.
        // Истёкшие документы остаются в Firestore.

        const snapshot = await db
            .collection('reports')
            .where('userId', '==', user.uid)
            .where(
                'expires_at',
                '>',
                firebase.firestore.Timestamp.now()
            )
            .get();


        // Очищаем списки.

        lists.forEach(list => {
            list.innerHTML = '';
        });


        // Очищаем кэш предыдущей загрузки.

        Object.keys(reportDataById).forEach(id => {
            delete reportDataById[id];
        });


        let hasRank = false;
        let hasPromo = false;
        let hasPract = false;
        let hasTheory = false;


        snapshot.forEach(doc => {

            const data = doc.data();

            // Дополнительная проверка срока.

            if (!isReportActive(data)) {
                return;
            }

            reportDataById[doc.id] = data;

            const card = document.createElement('div');

            card.style.cssText =
                'border: 1px solid #374151; padding: 15px; margin-bottom: 15px; background-color: #1a1e1b; border-radius: 4px;';


            const safeId = escapeHtml(doc.id);

            const syncHTML =
                getSyncStatusHTML(data, doc.id);


            const editButton = `

                <button
                    type="button"
                    class="btn-submit"
                    style="margin-top: 10px; padding: 8px 15px; font-size: 14px;"
                    data-edit-report="${safeId}"
                >
                    Редактировать
                </button>

            `;


            // ЗАПРОС НА ПОВЫШЕНИЕ

            if (data.formType === 'Запрос на повышение') {

                hasPromo = true;

                card.innerHTML = `

                    <p>
                        <strong>Докладывает:</strong>
                        ${escapeHtml(getStoredReporting(data))}
                    </p>

                    <p>
                        <strong>Запрос:</strong>
                        ${escapeHtml(data.requestedRank || '')}
                    </p>

                    ${syncHTML}

                    ${editButton}

                `;

                if (promotionList) {
                    promotionList.appendChild(card);
                }

            }


            // ПРАКТИЧЕСКАЯ ТРЕНИРОВКА

            else if (data.formType === 'Практическая тренировка') {

                hasPract = true;

                card.innerHTML = `

                    <p>
                        <strong>Тренировка:</strong>
                        ${escapeHtml(data.trainingName || '')}
                    </p>

                    <p>
                        <strong>Докладывает:</strong>
                        ${escapeHtml(getStoredReporting(data))}
                    </p>

                    <p>
                        <strong>Дата:</strong>
                        ${escapeHtml(data.reportDate || '')}
                    </p>

                    ${syncHTML}

                    ${editButton}

                `;

                if (practicalList) {
                    practicalList.appendChild(card);
                }

            }


            // ТЕОРЕТИЧЕСКАЯ ТРЕНИРОВКА

            else if (data.formType === 'Теоретическая тренировка') {

                hasTheory = true;

                card.innerHTML = `

                    <p>
                        <strong>Тренировка:</strong>
                        ${escapeHtml(data.trainingName || '')}
                    </p>

                    <p>
                        <strong>Докладывает:</strong>
                        ${escapeHtml(getStoredReporting(data))}
                    </p>

                    <p>
                        <strong>Дата:</strong>
                        ${escapeHtml(data.reportDate || '')}
                    </p>

                    ${syncHTML}

                    ${editButton}

                `;

                if (theoryList) {
                    theoryList.appendChild(card);
                }

            }


            // ИЗМЕНЕНИЕ ЗВАНИЯ

            else {

                hasRank = true;

                card.innerHTML = `

                    <p>
                        <strong>Номер | Позывной:</strong>
                        ${escapeHtml(getStoredSoldierInfo(data))}
                    </p>

                    <p>
                        <strong>Звание:</strong>
                        ${escapeHtml(data.oldRank || '')}
                        ➔
                        ${escapeHtml(data.newRank || '')}
                    </p>

                    <p>
                        <strong>Дата:</strong>
                        ${escapeHtml(data.reportDate || '')}
                    </p>

                    ${syncHTML}

                    ${editButton}

                `;

                if (rankChangeList) {
                    rankChangeList.appendChild(card);
                }

            }

        });


        // Если список пуст.

        if (!hasRank && rankChangeList) {

            rankChangeList.innerHTML =
                '<p>У вас нет активных рапортов этого типа.</p>';

        }

        if (!hasPromo && promotionList) {

            promotionList.innerHTML =
                '<p>У вас нет активных рапортов этого типа.</p>';

        }

        if (!hasPract && practicalList) {

            practicalList.innerHTML =
                '<p>У вас нет активных рапортов этого типа.</p>';

        }

        if (!hasTheory && theoryList) {

            theoryList.innerHTML =
                '<p>У вас нет активных рапортов этого типа.</p>';

        }


    } catch (error) {

        console.error(
            'Ошибка загрузки рапортов:',
            error
        );

        lists.forEach(list => {

            list.innerHTML =
                '<p style="color:#ef4444;">Не удалось загрузить рапорты. Проверьте подключение к базе данных.</p>';

        });

    }

}


// ==========================================
// ОТКРЫТИЕ ОКНА РЕДАКТИРОВАНИЯ
// ==========================================

window.openModal = function(docId, data) {

    const formType = data.formType || 'Новый рапорт';


    document.getElementById('editDocId').value = docId;

    document.getElementById('editFormType').value = formType;


    // Личные данные автора нельзя менять.

    const editReporting =
        document.getElementById('editReporting');

    editReporting.value =
        getStoredReporting(data);

    editReporting.readOnly = true;

    editReporting.setAttribute('readonly', 'readonly');


    const groupRank =
        document.getElementById('group-rank');

    const groupPromo =
        document.getElementById('group-promotion');

    const groupTraining =
        document.getElementById('group-training');

    const practicalFields =
        document.getElementById('group-practical-details');

    const groupDate =
        document.getElementById('group-date');

    const modalTitle =
        document.getElementById('modalTitle');


    groupRank.style.display = 'none';

    groupPromo.style.display = 'none';

    groupTraining.style.display = 'none';

    practicalFields.style.display = 'none';


    groupDate.style.display =
        formType === 'Запрос на повышение'
            ? 'none'
            : 'block';


    document.getElementById('editReportDate').value =
        data.reportDate || '';


    // ЗАПРОС НА ПОВЫШЕНИЕ

    if (formType === 'Запрос на повышение') {

        modalTitle.textContent =
            'Редактирование запроса на повышение';

        groupPromo.style.display = 'block';

        document.getElementById('editRequestedRank').value =
            data.requestedRank || '';

    }


    // ТРЕНИРОВКИ

    else if (

        formType === 'Практическая тренировка' ||

        formType === 'Теоретическая тренировка'

    ) {

        modalTitle.textContent =
            'Редактирование тренировки';

        groupTraining.style.display = 'block';


        document.getElementById('editTrainingName').value =
            data.trainingName || '';

        document.getElementById('editParticipants').value =
            data.participants || '';

        document.getElementById('editNotes').value =
            data.notes || '';


        if (formType === 'Практическая тренировка') {

            practicalFields.style.display = 'block';

            document.getElementById('editLocation').value =
                data.location || '';

            document.getElementById('editDescription').value =
                data.description || '';

        }

    }


    // ИЗМЕНЕНИЕ ЗВАНИЯ

    else if (formType === 'Новый рапорт') {

        modalTitle.textContent =
            'Редактирование рапорта';

        groupRank.style.display = 'block';


        document.getElementById('editIssuedBy').value =
            data.issuedBy || '';


        // Номер и позывной бойца также нельзя редактировать.

        const editSoldierInfo =
            document.getElementById('editSoldierInfo');

        editSoldierInfo.value =
            getStoredSoldierInfo(data);

        editSoldierInfo.readOnly = true;

        editSoldierInfo.setAttribute('readonly', 'readonly');


        document.getElementById('editSteamId').value =
            data.steamId || '';

        document.getElementById('editOldRank').value =
            data.oldRank || '';

        document.getElementById('editNewRank').value =
            data.newRank || '';

    } else {

        throw new Error(
            'Неизвестный тип рапорта: ' + formType
        );

    }


    document.getElementById('editModal').style.display = 'flex';

};


// ==========================================
// ОБРАБОТКА КНОПОК КАРТОЧЕК
// ==========================================

document.addEventListener('click', async event => {

    const editButton =
        event.target.closest('[data-edit-report]');


    if (editButton) {

        const docId =
            editButton.dataset.editReport;

        const data =
            reportDataById[docId];

        if (!data) {

            alert(
                'Не удалось найти данные рапорта. Обновите страницу.'
            );

            return;

        }

        window.openModal(docId, data);

        return;

    }


    const retryButton =
        event.target.closest('[data-retry-sync]');


    if (retryButton) {

        await window.retryDiscordSync(
            retryButton.dataset.retrySync
        );

    }

});


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

        const formType =
            data.formType || 'Новый рапорт';


        await setSyncStatus(docRef, 'pending');


        try {

            await updateDiscordMessage(data, formType);

            await setSyncStatus(docRef, 'synced');

            alert(
                'Синхронизация с Discord успешно завершена!'
            );

        } catch (syncError) {

            try {

                await setSyncStatus(
                    docRef,
                    'failed',
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


        // Обновляем списки без надписи «Поиск...».

        await loadReports(user, false);


    } catch (error) {

        console.error(
            'Ошибка повторной синхронизации:',
            error
        );

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

            // Повторно проверяем профиль и обязательный позывной.

            currentProfileData =
                await getCurrentProfileData(user);


            const docRef =
                db.collection('reports').doc(docId);

            const currentDoc =
                await docRef.get();


            if (!currentDoc.exists) {
                throw new Error('Рапорт не найден.');
            }

            const currentData =
                currentDoc.data();


            if (currentData.userId !== user.uid) {
                throw new Error('Нет доступа к этому рапорту.');
            }


            const formType =
                currentData.formType ||
                requestedFormType ||
                'Новый рапорт';


            // Проверка срока действия.

            if (!isReportActive(currentData)) {

                closeModal();

                await loadReports(user, false);

                throw new Error(
                    'Срок редактирования рапорта истёк. Прошло более 3 дней.'
                );

            }


            // Проверка типа формы.

            if (requestedFormType !== formType) {

                throw new Error(
                    'Тип рапорта изменился. Закройте окно и откройте его заново.'
                );

            }


            // ======================================
            // ПОДГОТОВКА ИЗМЕНЯЕМЫХ ДАННЫХ
            // ======================================

            // ВАЖНО:
            // reporting, soldierNumber, callsign,
            // authorRank, accessLevel и userId
            // не включаются в updatedData.
            //
            // Эти данные остаются неизменными при редактировании.

            const updatedData = {};


            // ======================================
            // ЗАПРОС НА ПОВЫШЕНИЕ
            // ======================================

            if (formType === 'Запрос на повышение') {

                updatedData.requestedRank =
                    document.getElementById('editRequestedRank')
                        .value.trim();


                if (!updatedData.requestedRank) {

                    throw new Error(
                        'Выберите запрашиваемое звание.'
                    );

                }

            }


            // ======================================
            // ТРЕНИРОВКИ
            // ======================================

            else if (

                formType === 'Практическая тренировка' ||

                formType === 'Теоретическая тренировка'

            ) {

                updatedData.trainingName =
                    document.getElementById('editTrainingName')
                        .value.trim();

                updatedData.participants =
                    document.getElementById('editParticipants').value;

                updatedData.notes =
                    document.getElementById('editNotes').value;

                updatedData.reportDate =
                    document.getElementById('editReportDate').value;


                if (!updatedData.trainingName) {

                    throw new Error(
                        'Укажите название тренировки.'
                    );

                }

                if (!updatedData.participants.trim()) {

                    throw new Error(
                        'Укажите состав участников.'
                    );

                }

                if (!updatedData.reportDate) {

                    throw new Error(
                        'Укажите дату тренировки.'
                    );

                }


                if (formType === 'Практическая тренировка') {

                    updatedData.location =
                        document.getElementById('editLocation')
                            .value.trim();

                    updatedData.description =
                        document.getElementById('editDescription').value;


                    if (
                        !updatedData.location ||
                        !updatedData.description.trim()
                    ) {

                        throw new Error(
                            'Укажите место проведения и описание тренировки.'
                        );

                    }

                }

            }


            // ======================================
            // ИЗМЕНЕНИЕ ЗВАНИЯ
            // ======================================

            else if (formType === 'Новый рапорт') {

                updatedData.issuedBy =
                    document.getElementById('editIssuedBy')
                        .value.trim();


                // soldierInfo намеренно не обновляется.
                // Номер и позывной зафиксированы при создании рапорта.


                updatedData.steamId =
                    document.getElementById('editSteamId')
                        .value.trim();

                updatedData.oldRank =
                    document.getElementById('editOldRank').value;

                updatedData.newRank =
                    document.getElementById('editNewRank').value;

                updatedData.reportDate =
                    document.getElementById('editReportDate').value;


                if (!updatedData.issuedBy) {

                    throw new Error(
                        'Укажите, кто выдал форму.'
                    );

                }

                if (!updatedData.steamId) {

                    throw new Error(
                        'Укажите SteamID.'
                    );

                }

                if (
                    !updatedData.oldRank ||
                    !updatedData.newRank
                ) {

                    throw new Error(
                        'Выберите старое и новое звание.'
                    );

                }

                if (!updatedData.reportDate) {

                    throw new Error(
                        'Укажите дату рапорта.'
                    );

                }

            } else {

                throw new Error(
                    'Неизвестный тип рапорта: ' + formType
                );

            }


            // ======================================
            // ОБЪЕДИНЕНИЕ ДАННЫХ
            // ======================================

            // Неизменяемые личные данные автора
            // сохраняются из исходного документа.

            const mergedData = {

                ...currentData,

                ...updatedData

            };


            // ======================================
            // СОХРАНЕНИЕ В FIRESTORE
            // ======================================

            await docRef.update({

                ...updatedData,

                discordSyncStatus: 'pending',

                discordSyncError:
                    firebase.firestore.FieldValue.delete(),

                discordSyncUpdatedAt:
                    firebase.firestore.FieldValue.serverTimestamp()

            });


            // ======================================
            // ОБНОВЛЕНИЕ DISCORD
            // ======================================

            try {

                await updateDiscordMessage(
                    mergedData,
                    formType
                );

                await setSyncStatus(
                    docRef,
                    'synced'
                );

                alert(
                    'Рапорт успешно обновлён в Firestore и Discord!'
                );

            } catch (syncError) {

                try {

                    await setSyncStatus(
                        docRef,
                        'failed',
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

            await loadReports(user, false);


        } catch (error) {

            console.error(
                'Ошибка редактирования рапорта:',
                error
            );

            alert('Ошибка: ' + error.message);

        } finally {

            submitBtn.disabled = false;

        }

    });


// ==========================================
// ВЫХОД ИЗ АККАУНТА
// ==========================================

const logoutBtn =
    document.getElementById('logoutBtn');

if (logoutBtn) {

    logoutBtn.addEventListener('click', async () => {

        try {

            await auth.signOut();

            window.location.href =
                '../login/login.html';

        } catch (error) {

            console.error(
                'Ошибка выхода:',
                error
            );

            alert('Не удалось выйти из аккаунта.');

        }

    });

}
