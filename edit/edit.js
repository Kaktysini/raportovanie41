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

const DISCORD_WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev';
const PROMOTION_WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev';
const TRAINING_WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev';

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
            } else {
                doc.ref.delete().catch(err => console.error("Ошибка удаления:", err));
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
    document.getElementById('editDocId').value = docId;
    document.getElementById('editFormType').value = data.formType || "Новый рапорт";
    document.getElementById('editReporting').value = data.reporting || '';

    const groupRank = document.getElementById('group-rank');
    const groupPromo = document.getElementById('group-promotion');
    const groupTraining = document.getElementById('group-training');
    const modalTitle = document.getElementById('modalTitle');

    groupRank.style.display = 'none';
    groupPromo.style.display = 'none';
    groupTraining.style.display = 'none';

    if (data.formType === "Запрос на повышение") {
        modalTitle.textContent = "Редактирование запроса на повышение";
        groupPromo.style.display = 'block';
        document.getElementById('editRequestedRank').value = data.requestedRank || '';
    } else if (data.formType === "Практическая тренировка" || data.formType === "Теоретическая тренировка") {
        modalTitle.textContent = "Редактирование тренировки";
        groupTraining.style.display = 'block';
        document.getElementById('editTrainingName').value = data.trainingName || '';
        document.getElementById('editParticipants').value = data.participants || '';
        document.getElementById('editNotes').value = data.notes || '';
    } else {
        modalTitle.textContent = "Редактирование рапорта";
        groupRank.style.display = 'block';
        document.getElementById('editIssuedBy').value = data.issuedBy || '';
        document.getElementById('editSoldierInfo').value = data.soldierInfo || '';
        document.getElementById('editSteamId').value = data.steamId || '';
        document.getElementById('editOldRank').value = data.oldRank || '';
        document.getElementById('editNewRank').value = data.newRank || '';
    }
    
    document.getElementById('editModal').style.display = 'flex';
}

window.closeModal = function() {
    document.getElementById('editModal').style.display = 'none';
}

document.getElementById('editForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const docId = document.getElementById('editDocId').value;
    const formType = document.getElementById('editFormType').value;
    
    let updatedData = { reporting: document.getElementById('editReporting').value };
    let payload = {};
    let webhookUrl = DISCORD_WEBHOOK_URL;

    if (formType === "Запрос на повышение") {
        updatedData.requestedRank = document.getElementById('editRequestedRank').value;
        webhookUrl = PROMOTION_WEBHOOK_URL;
        payload = { embeds: [{ title: "Запрос на повышение (ИЗМЕНЕНО)", color: 9109504, fields: [{ name: "Докладывает:", value: `\`${updatedData.reporting}\`` }, { name: "Запрос:", value: updatedData.requestedRank }] }] };
    } else if (formType === "Практическая тренировка" || formType === "Теоретическая тренировка") {
        updatedData.trainingName = document.getElementById('editTrainingName').value;
        updatedData.participants = document.getElementById('editParticipants').value;
        updatedData.notes = document.getElementById('editNotes').value;
        webhookUrl = TRAINING_WEBHOOK_URL;
        payload = { embeds: [{ title: "Тренировка (ИЗМЕНЕНО)", color: 9109504, fields: [{ name: "Докладывает:", value: `\`${updatedData.reporting}\`` }, { name: "Название:", value: updatedData.trainingName }, { name: "Состав:", value: `\`\`\`\n${updatedData.participants}\n\`\`\`` }] }] };
    } else {
        updatedData.issuedBy = document.getElementById('editIssuedBy').value;
        updatedData.soldierInfo = document.getElementById('editSoldierInfo').value;
        updatedData.steamId = document.getElementById('editSteamId').value;
        updatedData.oldRank = document.getElementById('editOldRank').value;
        updatedData.newRank = document.getElementById('editNewRank').value;
        payload = { embeds: [{ title: "📝 РАПОРТ (Отредактировано бойцом)", color: 9109504, fields: [{ name: "Докладывает:", value: `\`${updatedData.reporting}\`` }, { name: "Изменение звания:", value: `~~${updatedData.oldRank}~~ ➔ **${updatedData.newRank}**` }] }] };
    }

    try {
        const docRef = db.collection('reports').doc(docId);
        await docRef.update(updatedData);
        
        const docSnap = await docRef.get();
        const messageId = docSnap.data().discordMessageId;
        
        if (messageId && webhookUrl.startsWith('https://discord.com')) {
            await fetch(`${webhookUrl}/messages/${messageId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
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
