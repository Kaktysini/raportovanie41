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

const reportForm =
    document.getElementById('reportForm');

const statusDiv =
    document.getElementById('formStatus');

const reportingInput =
    document.getElementById('reporting');

const soldierInfoInput =
    document.getElementById('soldierInfo');

const oldRankSelect =
    document.getElementById('oldRank');

const steamIdInput =
    document.getElementById('steamId');

const steamIdGroup =
    document.getElementById('steamIdGroup');

const submitBtn =
    reportForm.querySelector('.btn-submit');

let currentProfileData = null;
let isSubmitting = false;


// ==========================================
// ПОЛУЧЕНИЕ И ПРОВЕРКА ПРОФИЛЯ
// ==========================================

async function getReportAccessData(user) {

    const profileSnapshot = await db
        .collection('users')
        .doc(user.uid)
        .get();

    if (!profileSnapshot.exists) {
        throw new Error('Профиль пользователя не найден.');
    }

    const profile = profileSnapshot.data();

    if (profile.status !== 'approved') {
        throw new Error(
            'Ваш аккаунт ещё не одобрен администрацией.'
        );
    }


    // Позывной обязателен.

    if (
        typeof profile.callsign !== 'string' ||
        profile.callsign.trim().length < 2 ||
        profile.callsign.trim().length > 30
    ) {

        throw new Error(
            'Для отправки рапорта необходимо заполнить позывной в профиле.'
        );

    }


    // Номер берётся из профиля.

    const soldierNumber =
        typeof profile.soldierNumber === 'string' &&
        profile.soldierNumber.trim()
            ? profile.soldierNumber.trim()
            : (
                user.email
                    ? user.email.split('@')[0]
                    : ''
            );

    if (!soldierNumber) {
        throw new Error('Не удалось определить номер бойца.');
    }


    // Звание и уровень доступа.

    let authorRank = profile.rank;
    let accessLevel = profile.accessLevel;


    // Администратор без обычного звания.

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

        soldierNumber: soldierNumber,

        callsign: profile.callsign.trim(),

        authorRank: authorRank,

        accessLevel: accessLevel

    };

}


// ==========================================
// АВТОМАТИЧЕСКОЕ ЗАПОЛНЕНИЕ ДОКЛАДЫВАЮЩЕГО
// ==========================================

function fillReportingField(profile) {

    if (!profile || !reportingInput) return;

    reportingInput.value =
        `${profile.soldierNumber} | ${profile.callsign} | ${profile.authorRank}`;

    reportingInput.readOnly = true;

}


// ==========================================
// УПРАВЛЕНИЕ ПОЛЕМ STEAM ID
// ==========================================

function updateSteamIdVisibility() {

    const isCadet =
        oldRankSelect.value === 'Кадет';

    steamIdGroup.style.display =
        isCadet ? 'block' : 'none';

    steamIdInput.required = isCadet;

    steamIdInput.disabled = !isCadet;

    if (!isCadet) {
        steamIdInput.value = '';
    }

}


// Показываем SteamID только для старого звания «Кадет».

oldRankSelect.addEventListener(
    'change',
    updateSteamIdVisibility
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

    } else if (type === 'error') {

        statusDiv.classList.add('error');

    }

}


// ==========================================
// ПРОВЕРКА АВТОРИЗАЦИИ И ЗАГРУЗКА ПРОФИЛЯ
// ==========================================

auth.onAuthStateChanged(async user => {

    submitBtn.disabled = true;

    if (!user) {

        window.location.href =
            '../login/login.html';

        return;

    }

    try {

        currentProfileData =
            await getReportAccessData(user);

        fillReportingField(currentProfileData);

        updateSteamIdVisibility();

        submitBtn.disabled = false;

    } catch (error) {

        console.error(
            'Ошибка проверки профиля:',
            error
        );

        showStatus(error.message, 'error');

        submitBtn.disabled = true;


        if (
            error.message.toLowerCase().includes('позывной')
        ) {

            setTimeout(() => {

                window.location.href =
                    '../dashboard/index.html';

            }, 2500);

        }

    }

});


// ==========================================
// СБРОС ФОРМЫ
// ==========================================

reportForm.addEventListener('reset', () => {

    setTimeout(() => {

        if (currentProfileData) {
            fillReportingField(currentProfileData);
        }

        updateSteamIdVisibility();

    }, 0);

});


// ==========================================
// ОТПРАВКА РАПОРТА
// ==========================================

reportForm.addEventListener('submit', async function(event) {

    event.preventDefault();

    const user = auth.currentUser;

    if (!user) {

        showStatus(
            'Необходимо войти в систему.',
            'error'
        );

        return;

    }

    if (isSubmitting) return;

    isSubmitting = true;

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;


    let docRef = null;
    let firestoreSaved = false;
    let discordResponseAccepted = false;
    let createdMessageId = null;


    showStatus(
        'Проверка профиля и создание рапорта...'
    );


    try {

        // ==========================================
        // 1. ПОЛУЧАЕМ АКТУАЛЬНЫЙ ПРОФИЛЬ
        // ==========================================

        const reportAccess =
            await getReportAccessData(user);

        currentProfileData = reportAccess;

        fillReportingField(reportAccess);


        // ==========================================
        // 2. ПОЛУЧАЕМ ДАННЫЕ ФОРМЫ
        // ==========================================

        const reporting =
            `${reportAccess.soldierNumber} | ${reportAccess.callsign} | ${reportAccess.authorRank}`;

        // Номер и позывной другого бойца указываются вручную.

        const soldierInfo =
            soldierInfoInput.value.trim();

        const oldRank =
            oldRankSelect.value;

        const newRank =
            document.getElementById('newRank').value;

        const steamId =
            steamIdInput.value.trim();

        const reportDate =
            document.getElementById('reportDate').value;


        // ==========================================
        // 3. ПРОВЕРЯЕМ ДАННЫЕ
        // ==========================================

        if (!soldierInfo) {

            throw new Error(
                'Укажите номер и позывной бойца.'
            );

        }

        if (!oldRank) {

            throw new Error(
                'Выберите старое звание.'
            );

        }

        if (!newRank) {

            throw new Error(
                'Выберите новое звание.'
            );

        }

        if (!reportDate) {

            throw new Error(
                'Укажите дату рапорта.'
            );

        }


        // SteamID обязателен только для кадета.

        if (oldRank === 'Кадет' && !steamId) {

            throw new Error(
                'При повышении с кадета необходимо указать SteamID.'
            );

        }


        // ==========================================
        // 4. ФОРМИРУЕМ ДАННЫЕ РАПОРТА
        // ==========================================

        const formData = {

            // Автор рапорта одновременно выдаёт форму.

            reporting: reporting,

            // Данные бойца, которому меняют звание.

            soldierInfo: soldierInfo,

            // Личные данные автора в отдельных полях.

            soldierNumber: reportAccess.soldierNumber,

            callsign: reportAccess.callsign,

            // Изменение звания.

            oldRank: oldRank,

            newRank: newRank,

            reportDate: reportDate,

            reportType: 'Новый рапорт',

            formType: 'Новый рапорт',

            // Уровень доступа и звание автора.

            authorRank: reportAccess.authorRank,

            accessLevel: reportAccess.accessLevel

        };


        // SteamID сохраняется только для кадета.

        if (oldRank === 'Кадет') {

            formData.steamId = steamId;

        }


        // ==========================================
        // 5. СРОК ОТОБРАЖЕНИЯ РАПОРТА
        // ==========================================

        const expiresAt = new Date();

        expiresAt.setDate(
            expiresAt.getDate() + 3
        );


        // ==========================================
        // 6. СОХРАНЯЕМ РАПОРТ В FIRESTORE
        // ==========================================

        docRef = await db
            .collection('reports')
            .add({

                ...formData,

                userId: user.uid,

                createdAt:
                    firebase.firestore.FieldValue.serverTimestamp(),

                expires_at:
                    firebase.firestore.Timestamp.fromDate(expiresAt),

                discordSyncStatus: 'pending',

                discordSyncError: null,

                discordSyncUpdatedAt:
                    firebase.firestore.FieldValue.serverTimestamp()

            });


        firestoreSaved = true;

        showStatus(
            'Рапорт сохранён. Отправка в Discord...'
        );


        // ==========================================
        // 7. ФОРМИРУЕМ DISCORD EMBED
        // ==========================================

        const discordFields = [

            {
                name: 'Докладывает / выдал форму:',
                value: `\`${reporting}\``,
                inline: false
            },

            {
                name: 'Н | П бойца:',
                value: soldierInfo,
                inline: false
            },

            {
                name: 'Изменение звания:',
                value: `~~${oldRank}~~ ➔ **${newRank}**`,
                inline: false
            }

        ];


        // SteamID добавляется только при повышении с кадета.

        if (oldRank === 'Кадет') {

            discordFields.push({

                name: 'SteamID:',

                value: `\`${steamId}\``,

                inline: false

            });

        }


        discordFields.push({

            name: 'Дата рапорта:',

            value: reportDate,

            inline: false

        });


        const payload = {

            username: 'Канцелярия 41-го ЭРК',

            embeds: [

                {

                    title: '📝 Новый рапорт об изменении звания.',

                    color: 3096367,

                    description: '📌 **Основные данные**',

                    fields: discordFields,

                    timestamp: new Date().toISOString()

                }

            ]

        };


        // ==========================================
        // 8. ОТПРАВЛЯЕМ В DISCORD
        // ==========================================

        const response = await fetch(
            `${DISCORD_WEBHOOK_URL}?wait=true`,
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


        // ==========================================
        // 9. ОБНОВЛЯЕМ СТАТУС СИНХРОНИЗАЦИИ
        // ==========================================

        await docRef.update({

            discordMessageId: createdMessageId,

            discordSyncStatus: 'synced',

            discordSyncError:
                firebase.firestore.FieldValue.delete(),

            discordSyncedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            discordSyncUpdatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });


        showStatus(
            'Рапорт успешно сохранён и отправлен в Discord!',
            'success'
        );

        reportForm.reset();

        fillReportingField(reportAccess);


    } catch (error) {

        console.error(
            'Ошибка отправки рапорта:',
            error
        );


        // ==========================================
        // 10. СОХРАНЯЕМ ОШИБКУ DISCORD
        // ==========================================

        if (docRef && firestoreSaved) {

            try {

                const failedData = {

                    discordSyncStatus: 'failed',

                    discordSyncError:
                        String(error.message).slice(0, 1000),

                    discordSyncUpdatedAt:
                        firebase.firestore.FieldValue.serverTimestamp()

                };

                if (createdMessageId) {

                    failedData.discordMessageId =
                        createdMessageId;

                }

                await docRef.update(failedData);

            } catch (statusError) {

                console.error(
                    'Не удалось обновить статус рапорта:',
                    statusError
                );

            }

        }


        // ==========================================
        // 11. ОБРАБОТКА РЕЗУЛЬТАТА
        // ==========================================

        if (firestoreSaved) {

            reportForm.reset();

            if (currentProfileData) {
                fillReportingField(currentProfileData);
            }


            if (createdMessageId) {

                showStatus(
                    'Рапорт сохранён, сообщение создано, но подтверждение синхронизации не сохранено. Не отправляйте форму повторно. ID рапорта: ' + docRef.id,
                    'error'
                );

            } else if (discordResponseAccepted) {

                showStatus(
                    'Рапорт сохранён в Firestore, но Discord не вернул ID сообщения. Сообщение могло появиться в Discord. Не отправляйте форму повторно. ID рапорта: ' + docRef.id,
                    'error'
                );

            } else {

                showStatus(
                    'Рапорт сохранён в Firestore, но отправка в Discord не подтверждена. Не отправляйте его повторно, чтобы избежать дубликата. ID рапорта: ' + docRef.id,
                    'error'
                );

            }

        } else {

            showStatus(
                'Не удалось сохранить рапорт: ' + error.message,
                'error'
            );

        }

    } finally {

        isSubmitting = false;

        submitBtn.classList.remove('loading');

        submitBtn.disabled = !currentProfileData;

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
