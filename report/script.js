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

const reportForm = document.getElementById('reportForm');
const statusDiv = document.getElementById('formStatus');

let currentProfile = null;
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


    // Проверяем одобрение аккаунта.

    if (profile.status !== 'approved') {
        throw new Error(
            'Ваш аккаунт ещё не одобрен администрацией.'
        );
    }


    // Проверяем наличие позывного.

    if (
        typeof profile.callsign !== 'string' ||
        profile.callsign.trim().length < 2 ||
        profile.callsign.trim().length > 30
    ) {

        throw new Error(
            'Для отправки рапорта необходимо заполнить позывной в профиле.'
        );

    }


    // Получаем номер бойца.

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
        throw new Error(
            'Не удалось определить номер бойца.'
        );
    }


    // Получаем звание и уровень доступа.

    let authorRank = profile.rank;
    let accessLevel = profile.accessLevel;


    // Администратор без обычного звания получает
    // отдельную метку и седьмой уровень доступа.

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

        profile: profile,

        soldierNumber: soldierNumber,

        callsign: profile.callsign.trim(),

        authorRank: authorRank,

        accessLevel: accessLevel

    };

}


// ==========================================
// АВТОМАТИЧЕСКОЕ ЗАПОЛНЕНИЕ ПОЛЕЙ
// ==========================================

function fillIdentityFields(data) {

    const reporting =
        document.getElementById('reporting');

    const soldierInfo =
        document.getElementById('soldierInfo');

    const oldRank =
        document.getElementById('oldRank');


    // Докладывает:
    // Номер | Позывной | Звание

    if (reporting) {

        reporting.value =
            `${data.soldierNumber} | ${data.callsign} | ${data.authorRank}`;

        reporting.readOnly = true;

    }


    // Н | П бойца:
    // Номер | Позывной

    if (soldierInfo) {

        soldierInfo.value =
            `${data.soldierNumber} | ${data.callsign}`;

        soldierInfo.readOnly = true;

    }


    // Старое звание автоматически берётся из профиля.
    // Если такого значения нет в списке HTML,
    // добавляем его в список.

    if (
        oldRank &&
        data.profile.rank &&
        typeof data.profile.rank === 'string'
    ) {

        const rank = data.profile.rank;

        const hasOption = Array.from(oldRank.options).some(
            option => option.value === rank
        );

        if (!hasOption) {

            const option = document.createElement('option');

            option.value = rank;

            option.textContent = rank;

            oldRank.appendChild(option);

        }

        oldRank.value = rank;

    }

}


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

    if (!user) {

        window.location.href = '../login/login.html';

        return;

    }

    const submitBtn =
        reportForm.querySelector('.btn-submit');

    submitBtn.disabled = true;

    try {

        // Получаем профиль из Firestore.

        currentProfile = await getReportAccessData(user);


        // Заполняем автоматические поля.

        fillIdentityFields(currentProfile);


        // Разрешаем отправку после проверки профиля.

        submitBtn.disabled = false;

    } catch (error) {

        console.error(
            'Ошибка проверки профиля:',
            error
        );

        showStatus(error.message, 'error');

        submitBtn.disabled = true;

        // При отсутствии позывного возвращаем бойца
        // в главное меню для заполнения профиля.

        if (
            error.message.includes('позывной')
        ) {

            setTimeout(() => {

                window.location.href =
                    '../dashboard/index.html';

            }, 2500);

        }

    }

});


// ==========================================
// СОХРАНЕНИЕ АВТОМАТИЧЕСКИХ ПОЛЕЙ ПОСЛЕ СБРОСА
// ==========================================

reportForm.addEventListener('reset', () => {

    setTimeout(() => {

        if (currentProfile) {

            fillIdentityFields(currentProfile);

        }

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


    // Защита от повторной отправки.

    if (isSubmitting) return;

    const form = event.target;

    const submitBtn =
        form.querySelector('.btn-submit');

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

        currentProfile = reportAccess;

        fillIdentityFields(reportAccess);


        // ==========================================
        // 2. ФОРМИРУЕМ ДАННЫЕ РАПОРТА
        // ==========================================

        const reporting =
            `${reportAccess.soldierNumber} | ${reportAccess.callsign} | ${reportAccess.authorRank}`;

        const soldierInfo =
            `${reportAccess.soldierNumber} | ${reportAccess.callsign}`;

        const issuedBy =
            document.getElementById('issuedBy').value.trim();

        const oldRank =
            document.getElementById('oldRank').value;

        const newRank =
            document.getElementById('newRank').value;

        const steamId =
            document.getElementById('steamId').value.trim();

        const reportDate =
            document.getElementById('reportDate').value;


        if (!issuedBy) {

            throw new Error(
                'Укажите, кто выдал форму.'
            );

        }

        if (!oldRank || !newRank) {

            throw new Error(
                'Выберите старое и новое звание.'
            );

        }

        if (!steamId) {

            throw new Error(
                'Укажите SteamID.'
            );

        }

        if (!reportDate) {

            throw new Error(
                'Укажите дату рапорта.'
            );

        }


        // Срок действия рапорта — три дня.

        const expiresAt = new Date();

        expiresAt.setDate(
            expiresAt.getDate() + 3
        );


        // ==========================================
        // 3. ПОДГОТАВЛИВАЕМ ДАННЫЕ FIRESTORE
        // ==========================================

        const formData = {

            // Сведения о докладывающем.

            reporting: reporting,

            issuedBy: issuedBy,

            soldierInfo: soldierInfo,


            // Отдельные поля профиля.

            soldierNumber:
                reportAccess.soldierNumber,

            callsign:
                reportAccess.callsign,


            // Данные изменения звания.

            oldRank: oldRank,

            newRank: newRank,

            steamId: steamId,

            reportDate: reportDate,


            // Тип рапорта.

            reportType: "Новый рапорт",

            formType: "Новый рапорт",


            // Уровень доступа и звание автора.

            authorRank:
                reportAccess.authorRank,

            accessLevel:
                reportAccess.accessLevel

        };


        // ==========================================
        // 4. СОХРАНЯЕМ РАПОРТ В FIRESTORE
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

                discordSyncStatus: "pending",

                discordSyncError: null,

                discordSyncUpdatedAt:
                    firebase.firestore.FieldValue.serverTimestamp()

            });


        firestoreSaved = true;


        showStatus(
            'Рапорт сохранён. Отправка в Discord...'
        );


        // ==========================================
        // 5. ФОРМИРУЕМ DISCORD EMBED
        // ==========================================

        const payload = {

            username: "Канцелярия 41-го ЭРК",

            embeds: [

                {

                    title: "📝 Новый рапорт об изменении звания.",

                    color: 3096367,

                    description: "📌 **Основные данные**",

                    fields: [

                        {
                            name: "Докладывает:",
                            value: `\`${reporting}\``,
                            inline: false
                        },

                        {
                            name: "Кто выдал форму:",
                            value: `\`${issuedBy}\``,
                            inline: false
                        },

                        {
                            name: "Н | П бойца:",
                            value: soldierInfo,
                            inline: false
                        },

                        {
                            name: "Изменение звания:",
                            value: `~~${oldRank}~~ ➔ **${newRank}**`,
                            inline: false
                        },

                        {
                            name: "SteamID:",
                            value: `\`${steamId}\``,
                            inline: false
                        },

                        {
                            name: "Дата рапорта:",
                            value: reportDate,
                            inline: false
                        }

                    ],

                    timestamp: new Date().toISOString()

                }

            ]

        };


        // ==========================================
        // 6. ОТПРАВЛЯЕМ РАПОРТ В DISCORD
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


        const responseText =
            await response.text();

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
        // 7. ОБНОВЛЯЕМ СТАТУС СИНХРОНИЗАЦИИ
        // ==========================================

        await docRef.update({

            discordMessageId:
                createdMessageId,

            discordSyncStatus:
                "synced",

            discordSyncError:
                firebase.firestore.FieldValue.delete(),

            discordSyncedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            discordSyncUpdatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });


        // ==========================================
        // 8. ЗАВЕРШЕНИЕ
        // ==========================================

        showStatus(
            'Рапорт успешно сохранён и отправлен в Discord!',
            'success'
        );


        form.reset();

        // Возвращаем данные бойца после сброса формы.

        fillIdentityFields(reportAccess);


    } catch (error) {

        console.error(
            'Ошибка отправки рапорта:',
            error
        );


        // ==========================================
        // СОХРАНЯЕМ ОШИБКУ DISCORD СИНХРОНИЗАЦИИ
        // ==========================================

        if (docRef && firestoreSaved) {

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


                await docRef.update(failedData);

            } catch (statusError) {

                console.error(
                    'Не удалось обновить статус рапорта:',
                    statusError
                );

            }

        }


        // ==========================================
        // ЕСЛИ FIRESTORE УЖЕ СОХРАНИЛ РАПОРТ
        // ==========================================

        if (firestoreSaved) {

            form.reset();

            if (currentProfile) {
                fillIdentityFields(currentProfile);
            }


            if (createdMessageId) {

                showStatus(

                    'Рапорт сохранён, сообщение создано, но не удалось сохранить подтверждение Discord в Firestore. Не отправляйте рапорт повторно. ID рапорта: ' +
                    docRef.id,

                    'error'

                );

            } else if (discordResponseAccepted) {

                showStatus(

                    'Рапорт сохранён в Firestore, но Discord не вернул ID сообщения. Сообщение могло появиться в Discord. Не отправляйте форму повторно. ID рапорта: ' +
                    docRef.id,

                    'error'

                );

            } else {

                showStatus(

                    'Рапорт сохранён в Firestore, но отправка в Discord не подтверждена. Не отправляйте его повторно, чтобы не создать дубликат. ID рапорта: ' +
                    docRef.id,

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
