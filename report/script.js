
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

    // Защита от повторного нажатия
    if (submitBtn.disabled) {
        return;
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    let docRef = null;
    let firestoreSaved = false;
    let discordResponseAccepted = false;

    showStatus('Создание рапорта...');

    const formData = {
        reporting: form.reporting.value.trim(),
        issuedBy: form.issuedBy.value.trim(),
        soldierInfo: form.soldierInfo.value.trim(),
        oldRank: form.oldRank.value,
        newRank: form.newRank.value,
        steamId: form.steamId.value.trim(),
        reportDate: form.reportDate.value,

        // Сохраняем оба поля для совместимости
        reportType: "Новый рапорт",
        formType: "Новый рапорт"
    };

    // Срок действия рапорта — 3 дня
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    try {

        // ==================================
        // 1. СОХРАНЕНИЕ В FIRESTORE
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

        showStatus(
            'Рапорт сохранён. Отправка в Discord...'
        );


        // ==================================
        // 2. ПОДГОТОВКА DISCORD EMBED
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
        // 3. ОТПРАВКА В DISCORD
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


        // Проверяем HTTP-ответ
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


        // Проверяем ID сообщения
        if (!discordResult.id) {

            throw new Error(
                'Discord ответил успешно, но не вернул ID сообщения.'
            );
        }

        discordResponseAccepted = true;


        // ==================================
        // 4. ОБНОВЛЕНИЕ СТАТУСА FIRESTORE
        // ==================================

        await docRef.update({

            discordMessageId: discordResult.id,

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
            'Рапорт успешно сохранён и отправлен в Discord!',
            'success'
        );

        form.reset();


    } catch (error) {

        console.error('Ошибка отправки рапорта:', error);


        // ==================================
        // СОХРАНЕНИЕ ОШИБКИ
        // ==================================

        if (docRef) {

            try {

                await docRef.update({

                    discordSyncStatus: "failed",

                    discordSyncError:
                        String(error.message).slice(0, 1000),

                    discordSyncUpdatedAt:
                        firebase.firestore.FieldValue.serverTimestamp()

                });

            } catch (statusError) {

                console.error(
                    'Не удалось обновить статус рапорта:',
                    statusError
                );

            }

        }


        // ==================================
        // УВЕДОМЛЕНИЕ ПОЛЬЗОВАТЕЛЯ
        // ==================================

        if (firestoreSaved) {

            form.reset();

            if (discordResponseAccepted) {

                showStatus(
                    'Рапорт сохранён в базе, но не удалось сохранить подтверждение Discord в Firestore. Сообщение могло уже появиться в Discord. Не отправляйте этот рапорт повторно.',
                    'error'
                );

            } else {

                showStatus(
                    'Рапорт сохранён в Firestore, но отправка в Discord не подтверждена. Не отправляйте его повторно, чтобы не создать дубликат. Запишите ID рапорта: ' + docRef.id,
                    'error'
                );

            }

        } else {

            showStatus(
                'Не удалось сохранить рапорт в Firestore: ' +
                error.message,
                'error'
            );

        }

    } finally {

        // Разблокируем кнопку
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
