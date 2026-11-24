
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


// ==========================================
// ПОЛУЧЕНИЕ И ПРОВЕРКА УРОВНЯ ПОЛЬЗОВАТЕЛЯ
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

    let authorRank = profile.rank;
    let accessLevel = profile.accessLevel;

    // Главный администратор может не иметь обычного звания.
    // Для его собственных рапортов используется отдельная отметка.
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
        authorRank: authorRank,
        accessLevel: accessLevel
    };
}


// ==========================================
// ОТОБРАЖЕНИЕ СТАТУСА
// ==========================================

function showStatus(message, type = 'info') {

    statusDiv.textContent = message;
    statusDiv.className = 'form-status';

    if (type === 'success') {
        statusDiv.classList.add('success');
    } else if (type === 'error') {
        statusDiv.classList.add('error');
    }

    statusDiv.style.display = 'block';
}


// ==========================================
// ПРОВЕРКА АВТОРИЗАЦИИ
// ==========================================

auth.onAuthStateChanged((user) => {

    if (!user) {

        setTimeout(() => {
            if (!auth.currentUser) {
                window.location.href = '../login/login.html';
            }
        }, 1000);

    }
});


// ==========================================
// ОТПРАВКА РАПОРТА
// ==========================================

reportForm.addEventListener('submit', async function(event) {

    event.preventDefault();

    const user = auth.currentUser;

    if (!user) {
        showStatus('Необходимо войти в систему.', 'error');
        return;
    }

    const form = event.target;
    const submitBtn = form.querySelector('.btn-submit');

    if (submitBtn.disabled) {
        return;
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    let docRef = null;
    let firestoreSaved = false;
    let discordResponseAccepted = false;
    let createdMessageId = null;

    showStatus('Проверка профиля и создание рапорта...');

    try {

        // ==================================
        // 1. ПОЛУЧЕНИЕ УРОВНЯ ДОСТУПА
        // ==================================

        const reportAccess = await getReportAccessData(user);

        const formData = {

            reporting: form.reporting.value.trim(),
            issuedBy: form.issuedBy.value.trim(),
            soldierInfo: form.soldierInfo.value.trim(),
            oldRank: form.oldRank.value,
            newRank: form.newRank.value,
            steamId: form.steamId.value.trim(),
            reportDate: form.reportDate.value,

            reportType: "Новый рапорт",
            formType: "Новый рапорт",

            // Снимок звания и уровня на момент подачи.
            authorRank: reportAccess.authorRank,
            accessLevel: reportAccess.accessLevel
        };

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3);


        // ==================================
        // 2. СОХРАНЕНИЕ В FIRESTORE
        // ==================================

        docRef = await db.collection('reports').add({

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

        showStatus('Рапорт сохранён. Отправка в Discord...');


        // ==================================
        // 3. ПОДГОТОВКА DISCORD EMBED
        // ==================================

        const payload = {

            username: "Канцелярия 41-го ЭРК",

            embeds: [{

                title: "📝 Новый рапорт об изменении звания.",

                color: 3096367,

                description: "📌 **Основные данные**",

                fields: [

                    {
                        name: "Докладывает:",
                        value: `\`${formData.reporting}\``,
                        inline: false
                    },

                    {
                        name: "Кто выдал форму:",
                        value: `\`${formData.issuedBy}\``,
                        inline: false
                    },

                    {
                        name: "Н | П бойца:",
                        value: formData.soldierInfo,
                        inline: false
                    },

                    {
                        name: "Изменение звания:",
                        value: `~~${formData.oldRank}~~ ➔ **${formData.newRank}**`,
                        inline: false
                    },

                    {
                        name: "SteamID:",
                        value: `\`${formData.steamId}\``,
                        inline: false
                    },

                    {
                        name: "Дата рапорта:",
                        value: formData.reportDate,
                        inline: false
                    }

                ],

                timestamp: new Date().toISOString()

            }]

        };


        // ==================================
        // 4. ОТПРАВКА В DISCORD
        // ==================================

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


        // ==================================
        // 5. ОБНОВЛЕНИЕ СТАТУСА FIRESTORE
        // ==================================

        await docRef.update({

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
        // 6. УСПЕШНОЕ ЗАВЕРШЕНИЕ
        // ==================================

        showStatus(
            'Рапорт успешно сохранён и отправлен в Discord!',
            'success'
        );

        form.reset();


    } catch (error) {

        console.error('Ошибка отправки рапорта:', error);

        if (docRef) {

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

                await docRef.update(failedData);

            } catch (statusError) {

                console.error(
                    'Не удалось обновить статус рапорта:',
                    statusError
                );

            }

        }

        if (firestoreSaved) {

            form.reset();

            if (createdMessageId) {

                showStatus(
                    'Рапорт сохранён, сообщение создано, но не удалось сохранить подтверждение Discord в Firestore. Не отправляйте рапорт повторно. ID рапорта: ' + docRef.id,
                    'error'
                );

            } else if (discordResponseAccepted) {

                showStatus(
                    'Рапорт сохранён в Firestore, но Discord не вернул ID сообщения. Сообщение могло появиться в Discord. Не отправляйте форму повторно. ID рапорта: ' + docRef.id,
                    'error'
                );

            } else {

                showStatus(
                    'Рапорт сохранён в Firestore, но отправка в Discord не подтверждена. Не отправляйте его повторно, чтобы не создать дубликат. ID рапорта: ' + docRef.id,
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

        submitBtn.classList.remove('loading');
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
