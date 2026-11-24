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

const practicalForm =
    document.getElementById('practicalForm');

const statusDiv =
    document.getElementById('formStatus');

const reportingInput =
    document.getElementById('reporting');

const submitBtn =
    practicalForm.querySelector('.btn-submit');

let currentProfileData = null;
let isSubmitting = false;


// ==========================================
// ПОЛУЧЕНИЕ И ПРОВЕРКА ПРОФИЛЯ БОЙЦА
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


    // Проверяем обязательный позывной.

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
        throw new Error('Не удалось определить номер бойца.');
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

        soldierNumber: soldierNumber,

        callsign: profile.callsign.trim(),

        authorRank: authorRank,

        accessLevel: accessLevel,

        role: profile.role

    };

}


// ==========================================
// АВТОМАТИЧЕСКОЕ ЗАПОЛНЕНИЕ ПОЛЯ «ДОКЛАДЫВАЕТ»
// ==========================================

function fillReportingField(profile) {

    if (!reportingInput || !profile) return;

    reportingInput.value =
        `${profile.soldierNumber} | ${profile.callsign} | ${profile.authorRank}`;

    reportingInput.readOnly = true;

}


// ==========================================
// ОТОБРАЖЕНИЕ СТАТУСА
// ==========================================

function showStatus(message, type = 'info') {

    if (!statusDiv) return;

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
// ПРОВЕРКА АВТОРИЗАЦИИ И ПРОФИЛЯ
// ==========================================

auth.onAuthStateChanged(async user => {

    submitBtn.disabled = true;

    if (!user) {

        window.location.href = '../login/login.html';

        return;

    }

    try {

        currentProfileData =
            await getReportAccessData(user);

        fillReportingField(currentProfileData);

        submitBtn.disabled = false;

    } catch (error) {

        console.error(
            'Ошибка проверки профиля:',
            error
        );

        showStatus(error.message, 'error');


        // Без позывного возвращаем пользователя
        // в профиль для заполнения необходимых данных.

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
// ВОССТАНОВЛЕНИЕ АВТОМАТИЧЕСКИХ ДАННЫХ ПОСЛЕ СБРОСА
// ==========================================

practicalForm.addEventListener('reset', () => {

    setTimeout(() => {

        if (currentProfileData) {

            fillReportingField(currentProfileData);

        }

    }, 0);

});


// ==========================================
// ОТПРАВКА ПРАКТИЧЕСКОЙ ТРЕНИРОВКИ
// ==========================================

practicalForm.addEventListener('submit', async function(event) {

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
        // 1. ПОВТОРНО ПОЛУЧАЕМ АКТУАЛЬНЫЙ ПРОФИЛЬ
        // ==========================================

        const reportAccess =
            await getReportAccessData(user);

        currentProfileData = reportAccess;

        fillReportingField(reportAccess);


        // ==========================================
        // 2. ПОЛУЧАЕМ ДАННЫЕ ФОРМЫ
        // ==========================================

        const formData = {

            // Автоматические данные автора.

            reporting:
                `${reportAccess.soldierNumber} | ${reportAccess.callsign} | ${reportAccess.authorRank}`,

            soldierNumber:
                reportAccess.soldierNumber,

            callsign:
                reportAccess.callsign,


            // Данные практической тренировки.

            trainingName:
                document.getElementById('trainingName').value.trim(),

            location:
                document.getElementById('location').value.trim(),

            participants:
                document.getElementById('participants').value.trim(),

            description:
                document.getElementById('description').value.trim(),

            notes:
                document.getElementById('notes').value.trim(),

            reportDate:
                document.getElementById('reportDate').value,


            // Служебные данные.

            formType: "Практическая тренировка",

            authorRank:
                reportAccess.authorRank,

            accessLevel:
                reportAccess.accessLevel

        };


        // Проверяем обязательные поля.

        if (!formData.trainingName) {
            throw new Error('Укажите название тренировки.');
        }

        if (!formData.location) {
            throw new Error('Укажите место проведения тренировки.');
        }

        if (!formData.participants) {
            throw new Error('Укажите состав участников.');
        }

        if (!formData.description) {
            throw new Error('Укажите описание тренировки.');
        }

        if (!formData.reportDate) {
            throw new Error('Укажите дату тренировки.');
        }


        // ==========================================
        // 3. ОПРЕДЕЛЯЕМ СРОК ОТОБРАЖЕНИЯ РАПОРТА
        // ==========================================

        const expiresAt = new Date();

        expiresAt.setDate(
            expiresAt.getDate() + 3
        );


        // ==========================================
        // 4. СОХРАНЯЕМ РАПОРТ В FIRESTORE
        // ==========================================

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


        // ==========================================
        // 5. ФОРМИРУЕМ DISCORD EMBED
        // ==========================================

        const payload = {

            username: "Канцелярия 41-го ЭРК",

            embeds: [

                {

                    title: "Форма рапорта о тренировках",

                    color: 3096367,

                    fields: [

                        {
                            name: "Докладывает:",
                            value: `\`${formData.reporting}\``,
                            inline: false
                        },

                        {
                            name: "Тренировка:",
                            value: `**${formData.trainingName}** (${formData.location})`,
                            inline: false
                        },

                        {
                            name: "Состав:",
                            value: `\`\`\`\n${formData.participants}\n\`\`\``,
                            inline: false
                        },

                        {
                            name: "Описание:",
                            value: formData.description,
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

                }

            ]

        };


        // ==========================================
        // 6. ОТПРАВЛЯЕМ В DISCORD
        // ==========================================

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
        // 7. СОХРАНЯЕМ СТАТУС СИНХРОНИЗАЦИИ
        // ==========================================

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


        showStatus(
            'Практическая тренировка успешно отправлена!',
            'success'
        );

        practicalForm.reset();

        fillReportingField(reportAccess);


    } catch (error) {

        console.error(
            'Ошибка отправки практической тренировки:',
            error
        );


        // ==========================================
        // 8. СОХРАНЯЕМ ОШИБКУ СИНХРОНИЗАЦИИ
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

            practicalForm.reset();

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
                'Не удалось сохранить рапорт в Firestore: ' + error.message,
                'error'
            );

        }

    } finally {

        isSubmitting = false;

        submitBtn.classList.remove('loading');

        // Если профиль не загрузился, не разрешаем отправку.

        submitBtn.disabled = !currentProfileData;

    }

});
