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

const DISCORD_WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev/report';
const PROMOTION_WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev/promotion';
const TRAINING_WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev/training';

const rankChangeList = document.getElementById('rankChangeList');
const promotionList = document.getElementById('promotionList');
const practicalList = document.getElementById('practicalList');
const theoryList = document.getElementById('theoryList');

auth.onAuthStateChanged((user) => {
    if (user) {
        loadReports(user);
    } else {
        setTimeout(() => {
            if (!auth.currentUser) window.location.href = '../login/login.html';
        }, 1000);
    }
});

async function loadReports(user) {
    rankChangeList.innerHTML = 'Поиск...';
    promotionList.innerHTML = 'Поиск...';
    practicalList.innerHTML = 'Поиск...';
    theoryList.innerHTML = 'Поиск...';

    try {
        const snapshot = await db.collection('reports').where('userId', '==', user.uid).get();
        
        rankChangeList.innerHTML = '';
        promotionList.innerHTML = '';
        practicalList.innerHTML = '';
        theoryList.innerHTML = '';
        
        const now = new Date();
        let hasRank = false, hasPromo = false, hasPract = false, hasTheory = false;

        snapshot.forEach(doc => {
            const data = doc.data();
            
            if (data.expires_at && data.expires_at.toDate() > now) {
                const card = document.createElement('div');
                card.style.cssText = 'border: 1px solid #374151; padding: 15px; margin-bottom: 15px; background-color: #1a1e1b; border-radius: 4px;';
                const safeData = JSON.stringify(data).replace(/'/g, "&#39;");
                const btnHTML = `<button class="btn-submit" style="margin-top: 10px; padding: 8px 15px; font-size: 14px;" onclick='openModal("${doc.id}", ${safeData})'>Редактировать</button>`;

                if (data.formType === "Запрос на повышение") {
                    hasPromo = true;
                    card.innerHTML = `<p><strong>Докладывает:</strong> ${data.reporting}</p><p><strong>Запрос:</strong> ${data.requestedRank}</p>${btnHTML}`;
                    promotionList.appendChild(card);
                } else if (data.formType === "Практическая тренировка") {
                    hasPract = true;
                    card.innerHTML = `<p><strong>Тренировка:</strong> ${data.trainingName}</p><p><strong>Докладывает:</strong> ${data.reporting}</p><p><strong>Дата:</strong> ${data.reportDate}</p>${btnHTML}`;
                    practicalList.appendChild(card);
                } else if (data.formType === "Теоретическая тренировка") {
                    hasTheory = true;
                    card.innerHTML = `<p><strong>Тренировка:</strong> ${data.trainingName}</p><p><strong>Докладывает:</strong> ${data.reporting}</p><p><strong>Дата:</strong> ${data.reportDate}</p>${btnHTML}`;
                    theoryList.appendChild(card);
                } else {
                    hasRank = true;
                    card.innerHTML = `<p><strong>Боец:</strong> ${data.soldierInfo}</p><p><strong>Звание:</strong> ${data.oldRank} ➔ ${data.newRank}</p><p><strong>Дата:</strong> ${data.reportDate}</p>${btnHTML}`;
                    rankChangeList.appendChild(card);
                }
            } 
        });

        if (!hasRank) rankChangeList.innerHTML = '<p>У вас нет активных рапортов этого типа.</p>';
        if (!hasPromo) promotionList.innerHTML = '<p>У вас нет активных рапортов этого типа.</p>';
        if (!hasPract) practicalList.innerHTML = '<p>У вас нет активных рапортов этого типа.</p>';
        if (!hasTheory) theoryList.innerHTML = '<p>У вас нет активных рапортов этого типа.</p>';

    } catch (error) {
        console.error(error);
    }
}

window.openModal = function(docId, data) {

    const formType = data.formType || "Новый рапорт";

    document.getElementById('editDocId').value = docId;
    document.getElementById('editFormType').value = formType;
    document.getElementById('editReporting').value = data.reporting || '';

    const groupRank = document.getElementById('group-rank');
    const groupPromo = document.getElementById('group-promotion');
    const groupTraining = document.getElementById('group-training');

    const practicalFields = document.getElementById('group-practical-details');
    const groupDate = document.getElementById('group-date');

    const modalTitle = document.getElementById('modalTitle');

    // Скрываем все группы полей
    groupRank.style.display = 'none';
    groupPromo.style.display = 'none';
    groupTraining.style.display = 'none';
    practicalFields.style.display = 'none';

    // Загружаем дату для всех форм, кроме запроса на повышение
    groupDate.style.display =
        formType === "Запрос на повышение" ? 'none' : 'block';

    document.getElementById('editReportDate').value =
        data.reportDate || '';

    // Запрос на повышение
    if (formType === "Запрос на повышение") {

        modalTitle.textContent = "Редактирование запроса на повышение";

        groupPromo.style.display = 'block';

        document.getElementById('editRequestedRank').value =
            data.requestedRank || '';

    }

    // Практическая или теоретическая тренировка
    else if (
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

        // Дополнительные поля практической тренировки
        if (formType === "Практическая тренировка") {

            practicalFields.style.display = 'block';

            document.getElementById('editLocation').value =
                data.location || '';

            document.getElementById('editDescription').value =
                data.description || '';
        }

    }

    // Рапорт об изменении звания
    else {

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

window.closeModal = function() {
    document.getElementById('editModal').style.display = 'none';
}

document.getElementById('editForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const docId = document.getElementById('editDocId').value;
    const formType = document.getElementById('editFormType').value;
    
    const reportDate = document.getElementById('editReportDate').value;

let updatedData = {
    reporting: document.getElementById('editReporting').value
};

let payload = {};
let webhookUrl = DISCORD_WEBHOOK_URL;


// ЗАПРОС НА ПОВЫШЕНИЕ
if (formType === "Запрос на повышение") {

    updatedData.requestedRank =
        document.getElementById('editRequestedRank').value;

    webhookUrl = PROMOTION_WEBHOOK_URL;

    payload = {
        embeds: [{
            title: "Запрос на повышение (ИЗМЕНЕНО)",
            color: 9109504,
            fields: [
                {
                    name: "Докладывает:",
                    value: `\`${updatedData.reporting}\``,
                    inline: false
                },
                {
                    name: "Запрос:",
                    value: updatedData.requestedRank,
                    inline: false
                }
            ]
        }]
    };

}


// ПРАКТИЧЕСКАЯ И ТЕОРЕТИЧЕСКАЯ ТРЕНИРОВКА
else if (
    formType === "Практическая тренировка" ||
    formType === "Теоретическая тренировка"
) {

    updatedData.trainingName =
        document.getElementById('editTrainingName').value;

    updatedData.participants =
        document.getElementById('editParticipants').value;

    updatedData.notes =
        document.getElementById('editNotes').value;

    updatedData.reportDate = reportDate;

    webhookUrl = TRAINING_WEBHOOK_URL;

    const trainingFields = [
        {
            name: "Докладывает:",
            value: `\`${updatedData.reporting}\``,
            inline: false
        },
        {
            name: "Название:",
            value: `**${updatedData.trainingName}**`,
            inline: false
        }
    ];

    // Дополнительные данные практической тренировки
    if (formType === "Практическая тренировка") {

        updatedData.location =
            document.getElementById('editLocation').value;

        updatedData.description =
            document.getElementById('editDescription').value;

        trainingFields.push(
            {
                name: "Место проведения:",
                value: updatedData.location || "Не указано",
                inline: false
            },
            {
                name: "Описание:",
                value: updatedData.description || "Не указано",
                inline: false
            }
        );

    }

    trainingFields.push(
        {
            name: "Состав:",
            value: `\`\`\`\n${updatedData.participants}\n\`\`\``,
            inline: false
        },
        {
            name: "Примечание:",
            value: updatedData.notes || "Нет",
            inline: false
        },
        {
            name: "Дата:",
            value: updatedData.reportDate || "Не указана",
            inline: false
        }
    );

    payload = {
        embeds: [{
            title: formType === "Практическая тренировка"
                ? "Практическая тренировка (ИЗМЕНЕНО)"
                : "Теоретическая тренировка (ИЗМЕНЕНО)",

            color: 9109504,
            fields: trainingFields
        }]
    };

}


// РАПОРТ ОБ ИЗМЕНЕНИИ ЗВАНИЯ
else {

    updatedData.issuedBy =
        document.getElementById('editIssuedBy').value;

    updatedData.soldierInfo =
        document.getElementById('editSoldierInfo').value;

    updatedData.steamId =
        document.getElementById('editSteamId').value;

    updatedData.oldRank =
        document.getElementById('editOldRank').value;

    updatedData.newRank =
        document.getElementById('editNewRank').value;

    updatedData.reportDate = reportDate;

    payload = {
        embeds: [{
            title: "📝 РАПОРТ (Отредактировано бойцом)",
            color: 9109504,
            fields: [
                {
                    name: "Докладывает:",
                    value: `\`${updatedData.reporting}\``,
                    inline: false
                },
                {
                    name: "Кто выдал форму:",
                    value: `\`${updatedData.issuedBy}\``,
                    inline: false
                },
                {
                    name: "Н | П бойца:",
                    value: updatedData.soldierInfo || "Не указано",
                    inline: false
                },
                {
                    name: "Изменение звания:",
                    value: `~~${updatedData.oldRank}~~ ➔ **${updatedData.newRank}**`,
                    inline: false
                },
                {
                    name: "SteamID:",
                    value: `\`${updatedData.steamId}\``,
                    inline: false
                },
                {
                    name: "Дата рапорта:",
                    value: updatedData.reportDate || "Не указана",
                    inline: false
                }
            ]
        }]
    };

}

    try {
    const docRef = db.collection('reports').doc(docId);

    // Получаем актуальные данные рапорта из Firestore
    const currentDoc = await docRef.get();

    if (!currentDoc.exists) {
        throw new Error('Рапорт не найден.');
    }

    const currentData = currentDoc.data();

    // Проверяем наличие срока действия
    if (
        !currentData.expires_at ||
        typeof currentData.expires_at.toDate !== 'function'
    ) {
        throw new Error('Не удалось определить срок действия рапорта.');
    }

    // Проверяем, не истекли ли 3 дня
    if (currentData.expires_at.toDate().getTime() <= Date.now()) {
        closeModal();

        if (auth.currentUser) {
            await loadReports(auth.currentUser);
        }

        throw new Error(
            'Срок редактирования рапорта истёк. Прошло более 3 дней.'
        );
    }

    // Срок ещё действует — сохраняем изменения
    await docRef.update(updatedData);
        
        const docSnap = await docRef.get();

if (!docSnap.exists) {
    throw new Error('Не удалось найти сохранённый рапорт.');
}

const messageId = docSnap.data().discordMessageId;

// Проверяем наличие ID сообщения Discord
if (!messageId) {
    throw new Error(
        'Рапорт сохранён в базе, но у него отсутствует ID сообщения Discord. Обновление Discord невозможно.'
    );
}

// Проверяем адрес Worker
if (!webhookUrl) {
    throw new Error('Не указан адрес Discord Worker.');
}

// Обновляем первоначальное сообщение Discord
const response = await fetch(
    `${webhookUrl}/messages/${messageId}`,
    {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }
);

if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
        `Рапорт сохранён в базе, но Discord не обновился. HTTP ${response.status}. ${errorText}`
    );
}
        
        alert('Запись успешно обновлена!');
        closeModal();
        window.location.reload();
    } catch (error) {
        alert('Ошибка при обновлении: ' + error.message);
    }
});

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut().then(() => window.location.href = '../login/login.html'));
