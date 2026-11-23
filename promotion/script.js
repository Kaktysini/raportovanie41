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

// ВСТАВЬТЕ СЮДА ССЫЛКУ НА ВАШ НОВЫЙ ВЕБХУК ДЛЯ ПОВЫШЕНИЙ
const PROMOTION_WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev/promotion';

auth.onAuthStateChanged((user) => {
    if (!user) {
        setTimeout(() => {
            if (!auth.currentUser) window.location.href = '../login/login.html';
        }, 1000);
    }
});

document.getElementById('promotionForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const form = event.target;
    const statusDiv = document.getElementById('formStatus');
    const submitBtn = form.querySelector('.btn-submit');

    // Анимация загрузки
    submitBtn.classList.add('loading');
    submitBtn.disabled = true; 
    
    statusDiv.textContent = 'Создание запроса...';
    statusDiv.className = 'form-status';

    const formData = {
        reporting: form.reporting.value,
        requestedRank: form.requestedRank.value,
        formType: "Запрос на повышение" // Указываем тип формы
    };

    // Срок жизни: 3 дня
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    try {
        const docRef = await db.collection('reports').add({
            ...formData,
            userId: user.uid, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            expires_at: firebase.firestore.Timestamp.fromDate(expiresAt)
        });

        statusDiv.textContent = 'Отправка в Discord...';

        // Формируем сообщение в точности как на вашем скриншоте
        const payload = {
            username: "Канцелярия 41-го ЭРК",
            embeds: [{
                title: "Форма рапорта запроса на проверку готовности к повышению",
                color: 3096367, // Зеленый цвет
                fields: [
                    { name: "Докладывает:", value: `\`${formData.reporting}\``, inline: false },
                    { name: "Запрашиваю проверку на повышение в звании", value: `**${formData.requestedRank}**`, inline: false }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        const response = await fetch(`${PROMOTION_WEBHOOK_URL}?wait=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const createdMessage = await response.json();
            await docRef.update({ discordMessageId: createdMessage.id });
            
            statusDiv.textContent = 'Запрос успешно отправлен!';
            statusDiv.classList.add('success');
            form.reset();
        }
    } catch (error) {
        statusDiv.textContent = 'Ошибка: ' + error.message;
        statusDiv.classList.add('error');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
});

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => window.location.href = '../login/login.html');
    });
}
