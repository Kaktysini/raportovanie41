
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

let currentUser = null;
let currentProfile = null;
let availableRanks = [];

let isSubmitting = false;


// ==========================================
// СПРАВОЧНИК ЗВАНИЙ
// Порядок учитывает последовательность повышения.
// КМД через эту форму недоступна.
// ==========================================

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
    group.ranks.map(rank => ({
        name: rank,
        level: group.level
    }))
);


// ==========================================
// ОТОБРАЖЕНИЕ СТАТУСА
// ==========================================

function showStatus(message, type = 'info') {

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


// ==========================================
// БЕЗОПАСНОЕ ЭКРАНИРОВАНИЕ HTML
// ==========================================

function escapeHtml(value) {

    return String(value ?? '').replace(/[&<>"']/g, char => {

        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };

        return entities[char];
    });
}


// ==========================================
// ПОЛУЧЕНИЕ ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ
// ==========================================

async function getCurrentProfile(user) {

    const snapshot = await db
        .collection('users')
        .doc(user.uid)
        .get();

    if (!snapshot.exists) {
        throw new Error('Профиль пользователя не найден.');
    }

    const profile = snapshot.data();

    if (profile.status !== 'approved') {
        throw new Error(
            'Ваш аккаунт ещё не одобрен администрацией.'
        );
    }

    // Запросы доступны обычным бойцам.
    if (profile.role !== 'user') {
        throw new Error(
            'Функция запроса нового звания доступна обычным бойцам.'
        );
    }

    if (
        typeof profile.rank !== 'string' ||
        !Number.isInteger(profile.accessLevel) ||
        profile.accessLevel < 0 ||
        profile.accessLevel > 6
    ) {
        throw new Error(
            'Ваше звание или уровень доступа не назначены корректно. Обратитесь к администрации.'
        );
    }

    return profile;
}


// ==========================================
// ПОСТРОЕНИЕ СПИСКА ДОСТУПНЫХ ЗВАНИЙ
// ==========================================

function renderRankOptions(profile) {

    const currentRankIndex = ALL_RANKS.findIndex(
        item => item.name === profile.rank
    );

    const currentLevel = profile.accessLevel;

    if (currentRankIndex === -1) {
        throw new Error(
            'Текущее звание отсутствует в справочнике.'
        );
    }

    const eligibleRanks = ALL_RANKS.slice(currentRankIndex + 1);

    availableRanks = eligibleRanks;

    const select = document.getElementById('requestedRank');

    if (eligibleRanks.length === 0) {

        select.innerHTML = `
            <option value="">Нет доступных званий для повышения</option>
        `;

        select.disabled = true;

        return false;
    }

    let html = `
        <option value="">Выберите новое звание</option>
    `;

    eligibleRanks.forEach(item => {

        html += `
            <option value="${escapeHtml(item.name)}">
                ${escapeHtml(item.name)} — уровень ${item.level}
            </option>
        `;

    });

    select.innerHTML = html;
    select.disabled = false;

    return true;
}


// ==========================================
// ОТОБРАЖЕНИЕ ТЕКУЩЕГО ЗВАНИЯ
// ==========================================

function renderCurrentRank(profile) {

    currentRankInfo.innerHTML = `
        <p style="margin: 0 0 8px;">
            <strong>Текущее звание:</strong>
            ${escapeHtml(profile.rank)}
        </p>

        <p style="margin: 0;">
            <strong>Ваш уровень доступа:</strong>
            ${escapeHtml(profile.accessLevel)}
        </p>
    `;
}


// ==========================================
// ПРОВЕРКА НАЛИЧИЯ АКТИВНОГО ЗАПРОСА
// ==========================================

async function checkPendingRequest(user) {

    const snapshot = await db
        .collection('rankRequests')
        .where('userId', '==', user.uid)
        .get();

    let pendingRequest = null;

    snapshot.forEach(doc => {

        const data = doc.data();

        if (data.status === 'pending') {
            pendingRequest = {
                id: doc.id,
                ...data
            };
        }

    });

    if (pendingRequest) {

        promotionForm.style.display = 'none';

        rankRequestState.style.display = 'block';

        rankRequestState.innerHTML = `
            <div style="
                background: #1e221f;
                border: 1px solid #d99b35;
                padding: 20px;
                border-radius: 5px;
            ">

                <h3 style="color: #f59e0b; margin-top: 0;">
                    ⏳ Запрос ожидает рассмотрения
                </h3>

                <p>
                    <strong>Текущее звание:</strong>
                    ${escapeHtml(pendingRequest.currentRank)}
                </p>

                <p>
                    <strong>Запрашиваемое звание:</strong>
                    ${escapeHtml(pendingRequest.requestedRank)}
                </p>

                <p>
                    <strong>Обоснование:</strong>
                    ${escapeHtml(pendingRequest.reason)}
                </p>

                <p style="color: #9ca3af; font-size: 13px;">
                    Вы получите уведомление, когда администрация примет решение.
                </p>

            </div>
        `;

        return true;
    }

    promotionForm.style.display = 'block';
    rankRequestState.style.display = 'none';

    return false;
}


// ==========================================
// ЗАГРУЗКА ПРОФИЛЯ
// ==========================================

auth.onAuthStateChanged(async user => {

    if (!user) {
        window.location.href = '../login/login.html';
        return;
    }

    currentUser = user;

    try {

        currentProfile = await getCurrentProfile(user);

        renderCurrentRank(currentProfile);

        const hasHigherRanks = renderRankOptions(currentProfile);

        const soldierNumber =
            currentProfile.soldierNumber ||
            user.email.split('@')[0];

        document.getElementById('reporting').value =
            `Боец № ${soldierNumber} | ${currentProfile.rank}`;

        const hasPending = await checkPendingRequest(user);

        if (!hasPending && hasHigherRanks) {
            promotionForm.style.display = 'block';
        }

        if (!hasHigherRanks) {
            promotionForm.style.display = 'none';

            showStatus(
                'В справочнике нет доступного звания выше вашего текущего.',
                'info'
            );
        }

    } catch (error) {

        console.error('Ошибка загрузки профиля:', error);

        promotionForm.style.display = 'none';

        showStatus(error.message, 'error');

    }
});


// ==========================================
// ОТПРАВКА ЗАПРОСА НА ПОВЫШЕНИЕ
// ==========================================

promotionForm.addEventListener('submit', async function(event) {

    event.preventDefault();

    if (isSubmitting) return;

    const user = auth.currentUser;

    if (!user) {
        showStatus('Необходимо войти в систему.', 'error');
        return;
    }

    const submitBtn = promotionForm.querySelector('.btn-submit');

    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    let reportRef = null;
    let requestRef = null;
    let firestoreSaved = false;
    let discordResponseAccepted = false;
    let createdMessageId = null;

    showStatus('Проверка данных и создание запроса...');

    try {

        // Получаем профиль повторно перед записью.
        const profile = await getCurrentProfile(user);

        const requestedRank =
            document.getElementById('requestedRank').value;

        const reason =
            document.getElementById('requestReason').value.trim();

        const reporting =
            document.getElementById('reporting').value.trim();

        const requestedRankData = ALL_RANKS.find(
            item => item.name === requestedRank
        );

        const currentRankIndex = ALL_RANKS.findIndex(
            item => item.name === profile.rank
        );

        const requestedRankIndex = ALL_RANKS.findIndex(
            item => item.name === requestedRank
        );

        if (
            !requestedRankData ||
            requestedRankIndex <= currentRankIndex
        ) {
            throw new Error(
                'Можно запрашивать только звание выше текущего.'
            );
        }

        if (!reason) {
            throw new Error('Укажите обоснование запроса.');
        }

        if (reason.length > 2000) {
            throw new Error('Обоснование слишком длинное.');
        }

        // Проверяем, что нет другого активного запроса.
        const requestSnapshot = await db
            .collection('rankRequests')
            .where('userId', '==', user.uid)
            .get();

        const alreadyPending = requestSnapshot.docs.some(
            doc => doc.data().status === 'pending'
        );

        if (alreadyPending) {
            throw new Error(
                'У вас уже есть запрос, ожидающий рассмотрения.'
            );
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3);

        // Создаём заранее ссылки на оба документа.
        reportRef = db.collection('reports').doc();
        requestRef = db.collection('rankRequests').doc();

        const formData = {

            reporting: reporting,

            requestedRank: requestedRank,

            formType: "Запрос на повышение",

            authorRank: profile.rank,

            accessLevel: profile.accessLevel,

            rankRequestId: requestRef.id

        };

        const reportData = {

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

        };

        const requestData = {

            userId: user.uid,

            soldierNumber: profile.soldierNumber ||
                user.email.split('@')[0],

            currentRank: profile.rank,

            currentAccessLevel: profile.accessLevel,

            requestedRank: requestedRank,

            requestedLevel: requestedRankData.level,

            reason: reason,

            reporting: reporting,

            reportId: reportRef.id,

            status: "pending",

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()

        };


        // ==================================
        // 1. СОХРАНЕНИЕ ОБОИХ ДОКУМЕНТОВ
        // ==================================

        const batch = db.batch();

        batch.set(reportRef, reportData);

        batch.set(requestRef, requestData);

        await batch.commit();

        firestoreSaved = true;

        showStatus(
            'Запрос сохранён. Отправка рапорта в Discord...'
        );


        // ==================================
        // 2. ФОРМИРОВАНИЕ DISCORD EMBED
        // ==================================

        const payload = {

            username: "Канцелярия 41-го ЭРК",

            embeds: [{

                title:
                    "Форма рапорта запроса на проверку готовности к повышению",

                color: 3096367,

                fields: [

                    {
                        name: "Докладывает:",
                        value: `\`${formData.reporting}\``,
                        inline: false
                    },

                    {
                        name: "Запрашиваю проверку на повышение в звании",
                        value: `**${formData.requestedRank}**`,
                        inline: false
                    }

                ],

                timestamp: new Date().toISOString()

            }]

        };


        // ==================================
        // 3. ОТПРАВКА В DISCORD
        // ==================================

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
        } catch (parseError) {
            discordResult = {};
        }

        if (!response.ok) {

            const errorMessage =
                discordResult.message ||
                discordResult.error ||
                responseText ||
                'Неизвестная ошибка Discord';

            throw new Error(
                `Discord вернул ошибку HTTP ${response.status}: ${errorMessage}`
            );
        }

        discordResponseAccepted = true;

        if (!discordResult.id) {
            throw new Error(
                'Discord ответил успешно, но не вернул ID сообщения.'
            );
        }

        createdMessageId = discordResult.id;


        // ==================================
        // 4. ОБНОВЛЕНИЕ СТАТУСА FIRESTORE
        // ==================================

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


        // ==================================
        // 5. УСПЕШНОЕ ЗАВЕРШЕНИЕ
        // ==================================

        showStatus(
            'Запрос на повышение отправлен администрации. Ожидайте решения.',
            'success'
        );

        promotionForm.reset();

        await checkPendingRequest(user);

    } catch (error) {

        console.error('Ошибка запроса на повышение:', error);

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
                    failedData.discordMessageId = createdMessageId;
                }

                await reportRef.update(failedData);

            } catch (statusError) {

                console.error(
                    'Не удалось обновить статус рапорта:',
                    statusError
                );

            }

        }

        if (firestoreSaved) {

            promotionForm.reset();

            await checkPendingRequest(user);

            if (createdMessageId) {

                showStatus(
                    'Заявка сохранена, сообщение создано, но подтверждение Discord не сохранилось. Не отправляйте запрос повторно. ID запроса: ' + requestRef.id,
                    'error'
                );

            } else if (discordResponseAccepted) {

                showStatus(
                    'Заявка сохранена, но Discord не вернул ID сообщения. Не отправляйте запрос повторно. ID запроса: ' + requestRef.id,
                    'error'
                );

            } else {

                showStatus(
                    'Заявка сохранена в базе, но отправка в Discord не подтверждена. Запрос администрации остаётся активным. Не отправляйте его повторно. ID запроса: ' + requestRef.id,
                    'error'
                );

            }

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


// ==========================================
// ВЫХОД ИЗ АККАУНТА
// ==========================================

const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {

    logoutBtn.addEventListener('click', async () => {

        await auth.signOut();

        window.location.href = '../login/login.html';

    });

}
