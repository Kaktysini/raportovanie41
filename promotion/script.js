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

const PROMOTION_WEBHOOK_URL =
    'https://erk-proxy.cotnow1000.workers.dev/promotion';


const promotionForm = document.getElementById('promotionForm');
const statusDiv = document.getElementById('formStatus');
const currentRankInfo = document.getElementById('currentRankInfo');
const rankRequestState = document.getElementById('rankRequestState');
const reportingInput = document.getElementById('reporting');

let currentUser = null;
let currentProfile = null;
let isSubmitting = false;


// ======================================================
// СПРАВОЧНИК ЗВАНИЙ
// ======================================================

const RANK_GROUPS = [
    {
        level: 0,
        ranks: [
            "Рядовой-рекрут",
            "Рядовой",
            "Старший рядовой"
        ]
    },
    {
        level: 1,
        ranks: [
            "Специалист",
            "Капрал"
        ]
    },
    {
        level: 2,
        ranks: [
            "Сержант",
            "Штаб-сержант",
            "Сержант первого класса"
        ]
    },
    {
        level: 3,
        ranks: [
            "Первый сержант",
            "Мастер-сержант",
            "Сержант-майор"
        ]
    },
    {
        level: 4,
        ranks: [
            "Команд сержант-майор",
            "Сержант-майор сухопутных войск"
        ]
    },
    {
        level: 5,
        ranks: [
            "Младший лейтенант",
            "Лейтенант"
        ]
    },
    {
        level: 6,
        ranks: [
            "Капитан",
            "Майор",
            "Подполковник",
            "Полковник"
        ]
    }
];


const ALL_RANKS = RANK_GROUPS.flatMap(group =>
    group.ranks.map(name => ({
        name,
        level: group.level
    }))
);


// ======================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================================================

function showStatus(message, type = 'info') {

    if (!statusDiv) return;

    statusDiv.textContent = message;

    statusDiv.className = 'form-status';

    statusDiv.style.display = 'block';

    if (type === 'success') {
        statusDiv.classList.add('success');
    }

    if (type === 'error') {
        statusDiv.classList.add('error');
    }

}


function escapeHtml(value) {

    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);

}


function getSoldierNumber(profile, user) {

    if (
        typeof profile.soldierNumber === 'string' &&
        profile.soldierNumber.trim()
    ) {
        return profile.soldierNumber.trim();
    }

    if (user.email) {
        return user.email.split('@')[0];
    }

    throw new Error(
        'Не удалось определить номер бойца. Обратитесь к администрации.'
    );

}


// ======================================================
// ПОЛУЧЕНИЕ ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ
// ======================================================

async function getCurrentProfile(user) {

    const snapshot = await db
        .collection('users')
        .doc(user.uid)
        .get();

    if (!snapshot.exists) {
        throw new Error('Профиль пользователя не найден.');
    }

    const profile = snapshot.data();


    // Проверяем одобрение аккаунта.

    if (profile.status !== 'approved') {
        throw new Error(
            'Ваш аккаунт ещё не одобрен администрацией.'
        );
    }


    // Запрос на повышение доступен обычным бойцам.

    if (profile.role !== 'user') {
        throw new Error(
            'Запрос нового звания доступен обычным бойцам.'
        );
    }


    // Проверяем звание и уровень.

    if (
        typeof profile.rank !== 'string' ||
        !Number.isInteger(profile.accessLevel) ||
        profile.accessLevel < 0 ||
        profile.accessLevel > 6
    ) {

        throw new Error(
            'Звание или уровень доступа не назначены. Обратитесь к администрации.'
        );

    }


    // Проверяем наличие позывного.

    if (
        typeof profile.callsign !== 'string' ||
        profile.callsign.trim().length < 2 ||
        profile.callsign.trim().length > 30
    ) {

        throw new Error(
            'Для подачи рапорта необходимо заполнить позывной в профиле.'
        );

    }


    // Проверяем номер бойца.

    const soldierNumber = getSoldierNumber(profile, user);


    return {
        ...profile,

        soldierNumber: soldierNumber,

        callsign: profile.callsign.trim()

    };

}


// ======================================================
// ОТОБРАЖЕНИЕ ДАННЫХ БОЙЦА
// ======================================================

function renderCurrentProfile(profile) {

    if (!currentRankInfo) return;

    currentRankInfo.innerHTML = `

        <p>
            <strong>Номер:</strong>
            ${escapeHtml(profile.soldierNumber)}
        </p>

        <p>
            <strong>Позывной:</strong>
            ${escapeHtml(profile.callsign)}
        </p>

        <p>
            <strong>Текущее звание:</strong>
            ${escapeHtml(profile.rank)}
        </p>

        <p>
            <strong>Уровень доступа:</strong>
            ${profile.accessLevel}
        </p>

    `;


    // Поле "Докладывает" содержит только позывной.
    // Номер и звание будут указаны отдельно в рапорте.

    if (reportingInput) {

        reportingInput.value =
    `${profile.soldierNumber} | ${profile.callsign} | ${profile.rank}`;

reportingInput.readOnly = true;

        reportingInput.readOnly = true;

    }

}


// ======================================================
// ФОРМИРОВАНИЕ СПИСКА ДОСТУПНЫХ ЗВАНИЙ
// ======================================================

function renderRankOptions(profile) {

    const currentIndex = ALL_RANKS.findIndex(
        item => item.name === profile.rank
    );

    const select = document.getElementById('requestedRank');

    if (!select) {
        throw new Error(
            'Не найдено поле выбора запрашиваемого звания.'
        );
    }

    if (currentIndex === -1) {
        throw new Error(
            'Текущее звание отсутствует в справочнике.'
        );
    }

    const higherRanks = ALL_RANKS.slice(currentIndex + 1);

    if (!higherRanks.length) {

        select.innerHTML =
            '<option value="">Нет доступных званий выше текущего</option>';

        select.disabled = true;

        return false;

    }

    select.innerHTML =
        '<option value="">Выберите новое звание</option>' +

        higherRanks.map(item =>
            `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)} — уровень ${item.level}</option>`
        ).join('');

    select.disabled = false;

    return true;

}


// ======================================================
// ПРОВЕРКА СУЩЕСТВУЮЩЕГО ЗАПРОСА
// ======================================================

async function checkPendingRequest(user) {

    const snapshot = await db
        .collection('rankRequests')
        .where('userId', '==', user.uid)
        .get();

    const pending = snapshot.docs.find(
        doc => doc.data().status === 'pending'
    );

    if (!pending) {

        promotionForm.style.display = 'block';

        rankRequestState.style.display = 'none';

        return false;

    }

    const request = pending.data();

    promotionForm.style.display = 'none';

    rankRequestState.style.display = 'block';

    rankRequestState.innerHTML = `

        <div style="
            background:#1e221f;
            border:1px solid #d99b35;
            padding:20px;
            border-radius:5px;
        ">

            <h3 style="
                color:#f59e0b;
                margin-top:0;
            ">
                ⏳ Запрос ожидает рассмотрения
            </h3>

            <p>
                <strong>Текущее звание:</strong>
                ${escapeHtml(request.currentRank)}
            </p>

            <p>
                <strong>Запрашиваемое звание:</strong>
                ${escapeHtml(request.requestedRank)}
            </p>

            <p>
                <strong>Обоснование:</strong>
                ${escapeHtml(request.reason)}
            </p>

            <p style="
                color:#9ca3af;
                font-size:13px;
            ">
                Вы получите уведомление после решения администрации.
            </p>

        </div>

    `;

    return true;

}


// ======================================================
// ПРОВЕРКА АВТОРИЗАЦИИ И ЗАГРУЗКА ПРОФИЛЯ
// ======================================================

auth.onAuthStateChanged(async user => {

    if (!user) {

        window.location.href = '../login/login.html';

        return;

    }

    currentUser = user;

    promotionForm.style.display = 'none';

    try {

        // Загружаем актуальный профиль из Firestore.

        const profile = await getCurrentProfile(user);

        currentProfile = profile;


        // Отображаем номер, позывной и звание.

        renderCurrentProfile(profile);


        // Формируем список доступных званий.

        const hasHigherRanks = renderRankOptions(profile);


        // Проверяем существующие заявки.

        const hasPending = await checkPendingRequest(user);


        if (!hasHigherRanks) {

            promotionForm.style.display = 'none';

            showStatus(
                'Нет доступного звания выше текущего.',
                'info'
            );

        } else if (!hasPending) {

            promotionForm.style.display = 'block';

        }

    } catch (error) {

        promotionForm.style.display = 'none';

        rankRequestState.style.display = 'none';

        showStatus(error.message, 'error');

    }

});


// ======================================================
// ОТПРАВКА ЗАПРОСА НА ПОВЫШЕНИЕ
// ======================================================

promotionForm.addEventListener('submit', async event => {

    event.preventDefault();

    if (isSubmitting) return;


    const user = auth.currentUser;

    if (!user) {

        showStatus(
            'Необходимо войти в систему.',
            'error'
        );

        return;

    }


    const submitBtn =
        promotionForm.querySelector('.btn-submit');

    isSubmitting = true;

    submitBtn.disabled = true;

    submitBtn.classList.add('loading');


    let reportRef = null;

    let requestRef = null;

    let firestoreSaved = false;

    let discordResponseAccepted = false;

    let createdMessageId = null;


    showStatus(
        'Проверка данных и создание запроса...'
    );


    try {

        // --------------------------------------------------
        // ПОЛУЧАЕМ АКТУАЛЬНЫЕ ДАННЫЕ ПРОФИЛЯ
        // --------------------------------------------------

        const profile = await getCurrentProfile(user);

        currentProfile = profile;

        renderCurrentProfile(profile);


        const requestedRank =
            document.getElementById('requestedRank').value;

        const reason =
            document.getElementById('requestReason').value.trim();


        // --------------------------------------------------
        // ОПРЕДЕЛЯЕМ ЗАПРАШИВАЕМОЕ ЗВАНИЕ
        // --------------------------------------------------

        const requested = ALL_RANKS.find(
            item => item.name === requestedRank
        );

        const currentIndex = ALL_RANKS.findIndex(
            item => item.name === profile.rank
        );

        const requestedIndex = ALL_RANKS.findIndex(
            item => item.name === requestedRank
        );


        if (
            !requested ||
            requestedIndex <= currentIndex
        ) {

            throw new Error(
                'Можно запрашивать только звание выше текущего.'
            );

        }


        if (!reason) {

            throw new Error(
                'Укажите обоснование запроса.'
            );

        }


        if (reason.length > 2000) {

            throw new Error(
                'Обоснование слишком длинное.'
            );

        }


        // --------------------------------------------------
        // ПРОВЕРЯЕМ НАЛИЧИЕ ДРУГОЙ ОЖИДАЮЩЕЙ ЗАЯВКИ
        // --------------------------------------------------

        const existing = await db
            .collection('rankRequests')
            .where('userId', '==', user.uid)
            .get();


        if (
            existing.docs.some(
                doc => doc.data().status === 'pending'
            )
        ) {

            throw new Error(
                'У вас уже есть запрос, ожидающий рассмотрения.'
            );

        }


        // --------------------------------------------------
        // ПОДГОТАВЛИВАЕМ ДАННЫЕ БОЙЦА
        // --------------------------------------------------

        const soldierNumber = profile.soldierNumber;

        const callsign = profile.callsign;

        const currentRank = profile.rank;

        const currentAccessLevel = profile.accessLevel;


        // В поле reporting сохраняем только позывной.
        // Никакого текста "Боец №" здесь нет.

        const reporting =
    `${soldierNumber} | ${callsign} | ${currentRank}`;


        // --------------------------------------------------
        // ПОДГОТОВКА ДОКУМЕНТОВ
        // --------------------------------------------------

        const expiresAt = new Date();

        expiresAt.setDate(
            expiresAt.getDate() + 3
        );


        reportRef = db
            .collection('reports')
            .doc();

        requestRef = db
            .collection('rankRequests')
            .doc();


        // --------------------------------------------------
        // ДАННЫЕ РАПОРТА
        // --------------------------------------------------

        const formData = {

            // Номер, позывной и звание хранятся отдельно.

            soldierNumber: soldierNumber,

            callsign: callsign,

            reporting: reporting,

            authorRank: currentRank,

            accessLevel: currentAccessLevel,


            // Информация о запросе.

            requestedRank: requestedRank,

            formType: "Запрос на повышение",

            rankRequestId: requestRef.id

        };


        // --------------------------------------------------
        // СОХРАНЕНИЕ В FIRESTORE
        // --------------------------------------------------

        const batch = db.batch();


        // Документ рапорта.

        batch.set(reportRef, {

            ...formData,

            userId: user.uid,

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            expires_at:
                firebase.firestore.Timestamp.fromDate(expiresAt),

            discordSyncStatus: "pending",

            discordSyncError: null,

            discordSyncUpdatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });


        // Документ запроса на повышение.

        // Поля rankRequests соответствуют текущим
        // разрешениям firestore.rules.

        batch.set(requestRef, {

            userId: user.uid,

            soldierNumber: soldierNumber,

            currentRank: currentRank,

            currentAccessLevel: currentAccessLevel,

            requestedRank: requestedRank,

            requestedLevel: requested.level,

            reason: reason,

            reporting: reporting,

            reportId: reportRef.id,

            status: "pending",

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });


        await batch.commit();

        firestoreSaved = true;


        showStatus(
            'Запрос сохранён. Отправка рапорта в Discord...'
        );


        // --------------------------------------------------
        // ФОРМИРОВАНИЕ DISCORD EMBED
        // --------------------------------------------------

        const payload = {

            username: "Канцелярия 41-го ЭРК",

            embeds: [

                {

                    title: "Форма рапорта запроса на проверку готовности к повышению",

                    color: 3096367,

                    fields: [

                        {
                            name: "Докладывает:",
                            value: `\`${callsign}\``,
                            inline: false
                        },

                        {
                            name: "Номер:",
                            value: `\`${soldierNumber}\``,
                            inline: true
                        },

                        {
                            name: "Текущее звание:",
                            value: `\`${currentRank}\``,
                            inline: true
                        },

                        {
                            name: "Запрашиваю проверку на повышение в звании:",
                            value: `**${requestedRank}**`,
                            inline: false
                        }

                    ],

                    timestamp: new Date().toISOString()

                }

            ]

        };


        // --------------------------------------------------
        // ОТПРАВКА В DISCORD
        // --------------------------------------------------

        const response = await fetch(
            `${PROMOTION_WEBHOOK_URL}?wait=true`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify(payload)
            }
        );


        const responseText = await response.text();

        let discordResult = {};

        try {

            discordResult = responseText
                ? JSON.parse(responseText)
                : {};

        } catch (_) {}


        if (!response.ok) {

            throw new Error(
                `Discord HTTP ${response.status}: ${
                    discordResult.message ||
                    discordResult.error ||
                    responseText ||
                    'Ошибка Discord'
                }`
            );

        }


        discordResponseAccepted = true;


        if (!discordResult.id) {

            throw new Error(
                'Discord не вернул ID сообщения.'
            );

        }


        createdMessageId = discordResult.id;


        // --------------------------------------------------
        // ОБНОВЛЕНИЕ СТАТУСА СИНХРОНИЗАЦИИ
        // --------------------------------------------------

        await reportRef.update({

            discordMessageId: createdMessageId,

            discordSyncStatus: "synced",

            discordSyncError:
                firebase.firestore.FieldValue.delete(),

            discordSyncedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            discordSyncUpdatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });


        // --------------------------------------------------
        // ЗАВЕРШЕНИЕ
        // --------------------------------------------------

        showStatus(
            'Запрос отправлен администрации. Ожидайте решения.',
            'success'
        );


        promotionForm.reset();


        await checkPendingRequest(user);


    } catch (error) {

        console.error(
            'Ошибка запроса на повышение:',
            error
        );


        // --------------------------------------------------
        // СОХРАНЕНИЕ ОШИБКИ СИНХРОНИЗАЦИИ DISCORD
        // --------------------------------------------------

        if (reportRef && firestoreSaved) {

            try {

                const failedData = {

                    discordSyncStatus: "failed",

                    discordSyncError:
                        String(error.message).slice(0, 1000),

                    discordSyncUpdatedAt:
                        firebase.firestore.FieldValue.serverTimestamp()

                };


                if (createdMessageId) {

                    failedData.discordMessageId =
                        createdMessageId;

                }


                await reportRef.update(failedData);


            } catch (statusError) {

                console.error(
                    'Не удалось обновить статус рапорта:',
                    statusError
                );

            }

        }


        // --------------------------------------------------
        // ЕСЛИ FIRESTORE УЖЕ СОХРАНИЛ ЗАПРОС
        // --------------------------------------------------

        if (firestoreSaved) {

            promotionForm.reset();

            await checkPendingRequest(user);


            const warning =
                createdMessageId || discordResponseAccepted

                    ? 'Discord мог уже создать сообщение. Не отправляйте запрос повторно.'

                    : 'Заявка сохранена в базе, но отправка в Discord не подтверждена. Не отправляйте запрос повторно.';


            showStatus(
                `${warning} ID запроса: ${requestRef.id}`,
                'error'
            );

        } else {

            showStatus(
                'Не удалось создать запрос: ' + error.message,
                'error'
            );

        }

    } finally {

        isSubmitting = false;

        submitBtn.disabled = false;

        submitBtn.classList.remove('loading');

    }

});


// ======================================================
// ВЫХОД ИЗ АККАУНТА
// ======================================================

document.getElementById('logoutBtn').addEventListener(
    'click',
    async () => {

        await auth.signOut();

        window.location.href = '../login/login.html';

    }
);
