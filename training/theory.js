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

const WEBHOOK_URL =
    'https://erk-proxy.cotnow1000.workers.dev/training';

const theoryForm = document.getElementById('theoryForm');
const statusDiv = document.getElementById('formStatus');


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
// ОТПРАВКА ТЕОРЕТИЧЕСКОЙ ТРЕНИРОВКИ
// ==========================================

theoryForm.addEventListener('submit', async function(event) {

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
    let createdMessageId = null;

    showStatus('Создание рапорта...');

    // Получаем данные напрямую по ID элементов
    const formData = {
        reporting:
            document.getElementById('reporting').value.trim(),

        trainingName:
            document.getElementById('trainingName').value.trim(),

        participants:
            document.getElementById('participants').value,

        notes:
            document.getElementById('notes').value,

        reportDate:
            document.getElementById('reportDate').value,

        formType: "Теоретическая тренировка"
    };

    // Срок действия — 3 дня
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
        // 2. ФОРМИРОВАНИЕ DISCORD EMBED
        // ==================================

        const payload = {

            username: "Канцелярия 41-го ЭРК",

            embeds: [{

                title: "Форма рапорта о Теоретической тренировке",

                color: 3096367,

                fields: [

                    {
                        name: "Докладывает:",
                        value: `\`${formData.reporting}\``,
                        inline: false
                    },

                    {
                        name: "Название:",
                        value: `**${formData.trainingName}**`,
                        inline: false
                    },

                    {
                        name: "Оценки состава:",
                        value: `\`\`\`\n${formData.participants}\n\`\`\``,
                        inline: false
                    },

                    {
                        name: "Примечание:",
                        value: formData.notes || "Нет",
                        inline: false
                    },

                    {
                        name: "Дата:",
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
            `${WEBHOOK_URL}?wait=true`,
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

        discordResponseAccepted = true;


        // Проверяем ID сообщения
        if (!discordResult.id) {

            throw new Error(
                'Discord ответил успешно, но не вернул ID сообщения.'
            );
        }

        createdMessageId = discordResult.id;


        // ==================================
        // 4. ОБНОВЛЕНИЕ FIRESTORE
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
        // 5. УСПЕШНОЕ ЗАВЕРШЕНИЕ
        // ==================================

        showStatus(
            'Теоретическая тренировка успешно отправлена!',
            'success'
        );

        form.reset();


    } catch (error) {

        console.error(
            'Ошибка отправки теоретической тренировки:',
            error
        );


        // ==================================
        // СОХРАНЕНИЕ СТАТУСА ОШИБКИ
        // ==================================

        if (docRef) {

            try {

                const failedData = {

                    discordSyncStatus: "failed",

                    discordSyncError:
                        String(error.message).slice(0, 1000),

                    discordSyncUpdatedAt:
                        firebase.firestore.FieldValue.serverTimestamp()

                };

                // Сохраняем ID, если Discord уже создал сообщение
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


        // ==================================
        // УВЕДОМЛЕНИЕ ПОЛЬЗОВАТЕЛЯ
        // ==================================

        if (firestoreSaved) {

            form.reset();

            if (createdMessageId) {

                showStatus(
                    'Рапорт сохранён, сообщение создано, но подтверждение синхронизации не сохранено. Не отправляйте форму повторно. ID рапорта: ' + docRef.id,
                    'error'
                );

            } else if (discordResponseAccepted) {

                showStatus(
                    'Рапорт сохранён в Firestore, но Discord не вернул ID сообщения. Сообщение могло быть создано. Не отправляйте форму повторно. ID рапорта: ' + docRef.id,
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
