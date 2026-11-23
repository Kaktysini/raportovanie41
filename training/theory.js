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
const WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev';

auth.onAuthStateChanged((user) => { if (!user) setTimeout(() => { if (!auth.currentUser) window.location.href = '../login/login.html'; }, 1000); });

document.getElementById('theoryForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const form = event.target;
    const submitBtn = form.querySelector('.btn-submit');
    const statusDiv = document.getElementById('formStatus');

    submitBtn.classList.add('loading'); submitBtn.disabled = true; 
    statusDiv.textContent = 'Отправка...'; statusDiv.className = 'form-status';

    const formData = {
        reporting: form.reporting.value,
        trainingName: form.trainingName.value,
        participants: form.participants.value,
        notes: form.notes.value,
        reportDate: form.reportDate.value,
        formType: "Теоретическая тренировка"
    };

    const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 3);

    try {
        const docRef = await db.collection('reports').add({
            ...formData, userId: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(), expires_at: firebase.firestore.Timestamp.fromDate(expiresAt)
        });

        const payload = {
            username: "Канцелярия 41-го ЭРК",
            embeds: [{
                title: "Форма рапорта о Теоретической тренировке",
                color: 3096367,
                fields: [
                    { name: "Докладывает:", value: `\`${formData.reporting}\``, inline: false },
                    { name: "Название:", value: `**${formData.trainingName}**`, inline: false },
                    { name: "Оценки состава:", value: `\`\`\`\n${formData.participants}\n\`\`\``, inline: false },
                    { name: "Примечание:", value: formData.notes || "Нет", inline: false },
                    { name: "Дата:", value: formData.reportDate, inline: false }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        const response = await fetch(`${WEBHOOK_URL}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

        if (response.ok) {
            const createdMessage = await response.json();
            await docRef.update({ discordMessageId: createdMessage.id });
            statusDiv.textContent = 'Рапорт отправлен!'; statusDiv.classList.add('success');
            form.reset();
        }
    } catch (error) {
        statusDiv.textContent = 'Ошибка: ' + error.message; statusDiv.classList.add('error');
    } finally {
        submitBtn.classList.remove('loading'); submitBtn.disabled = false;
    }
});
