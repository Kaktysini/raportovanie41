
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

const PROMOTION_WEBHOOK_URL = 'https://erk-proxy.cotnow1000.workers.dev/promotion';
const promotionForm = document.getElementById('promotionForm');
const statusDiv = document.getElementById('formStatus');
const currentRankInfo = document.getElementById('currentRankInfo');
const rankRequestState = document.getElementById('rankRequestState');

let currentUser = null;
let isSubmitting = false;

const RANK_GROUPS = [
    { level: 0, ranks: ["Рядовой-рекрут", "Рядовой", "Старший рядовой"] },
    { level: 1, ranks: ["Специалист", "Капрал"] },
    { level: 2, ranks: ["Сержант", "Штаб-сержант", "Сержант первого класса"] },
    { level: 3, ranks: ["Первый сержант", "Мастер-сержант", "Сержант-майор"] },
    { level: 4, ranks: ["Команд сержант-майор", "Сержант-майор сухопутных войск"] },
    { level: 5, ranks: ["Младший лейтенант", "Лейтенант"] },
    { level: 6, ranks: ["Капитан", "Майор", "Подполковник", "Полковник"] }
];

const ALL_RANKS = RANK_GROUPS.flatMap(group =>
    group.ranks.map(name => ({ name, level: group.level }))
);

function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = 'form-status';
    statusDiv.style.display = 'block';
    if (type === 'success') statusDiv.classList.add('success');
    if (type === 'error') statusDiv.classList.add('error');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

async function getCurrentProfile(user) {
    const snapshot = await db.collection('users').doc(user.uid).get();
    if (!snapshot.exists) throw new Error('Профиль пользователя не найден.');

    const profile = snapshot.data();
    if (profile.status !== 'approved') throw new Error('Ваш аккаунт ещё не одобрен администрацией.');
    if (profile.role !== 'user') throw new Error('Запрос нового звания доступен обычным бойцам.');

    if (
        typeof profile.rank !== 'string' ||
        !Number.isInteger(profile.accessLevel) ||
        profile.accessLevel < 0 ||
        profile.accessLevel > 6
    ) {
        throw new Error('Звание или уровень доступа не назначены. Обратитесь к администрации.');
    }

    return profile;
}

function renderRankOptions(profile) {
    const currentIndex = ALL_RANKS.findIndex(item => item.name === profile.rank);
    const select = document.getElementById('requestedRank');

    if (currentIndex === -1) throw new Error('Текущее звание отсутствует в справочнике.');

    const higherRanks = ALL_RANKS.slice(currentIndex + 1);
    if (!higherRanks.length) {
        select.innerHTML = '<option value="">Нет доступных званий выше текущего</option>';
        select.disabled = true;
        return false;
    }

    select.innerHTML = '<option value="">Выберите новое звание</option>' +
        higherRanks.map(item =>
            `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)} — уровень ${item.level}</option>`
        ).join('');

    select.disabled = false;
    return true;
}

async function checkPendingRequest(user) {
    const snapshot = await db.collection('rankRequests')
        .where('userId', '==', user.uid)
        .get();

    const pending = snapshot.docs.find(doc => doc.data().status === 'pending');

    if (!pending) {
        promotionForm.style.display = 'block';
        rankRequestState.style.display = 'none';
        return false;
    }

    const request = pending.data();
    promotionForm.style.display = 'none';
    rankRequestState.style.display = 'block';

    rankRequestState.innerHTML = `
        <div style="background:#1e221f;border:1px solid #d99b35;padding:20px;border-radius:5px;">
            <h3 style="color:#f59e0b;margin-top:0;">⏳ Запрос ожидает рассмотрения</h3>
            <p><strong>Текущее звание:</strong> ${escapeHtml(request.currentRank)}</p>
            <p><strong>Запрашиваемое звание:</strong> ${escapeHtml(request.requestedRank)}</p>
            <p><strong>Обоснование:</strong> ${escapeHtml(request.reason)}</p>
            <p style="color:#9ca3af;font-size:13px;">Вы получите уведомление после решения администрации.</p>
        </div>
    `;
    return true;
}

auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = '../login/login.html';
        return;
    }

    currentUser = user;

    try {
        const profile = await getCurrentProfile(user);
        currentRankInfo.innerHTML = `
            <p><strong>Текущее звание:</strong> ${escapeHtml(profile.rank)}</p>
            <p><strong>Уровень доступа:</strong> ${profile.accessLevel}</p>
        `;

        document.getElementById('reporting').value =
            `Боец № ${profile.soldierNumber || user.email.split('@')[0]} | ${profile.rank}`;

        const hasHigherRanks = renderRankOptions(profile);
        const hasPending = await checkPendingRequest(user);

        if (!hasHigherRanks) {
            promotionForm.style.display = 'none';
            showStatus('Нет доступного звания выше текущего.', 'info');
        } else if (!hasPending) {
            promotionForm.style.display = 'block';
        }
    } catch (error) {
        promotionForm.style.display = 'none';
        showStatus(error.message, 'error');
    }
});

promotionForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (isSubmitting) return;

    const user = auth.currentUser;
    if (!user) {
        showStatus('Необходимо войти в систему.', 'error');
        return;
    }

    const submitBtn = promotionForm.querySelector('.btn-submit');
    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    let reportRef = null;
    let requestRef = null;
    let firestoreSaved = false;
    let discordResponseAccepted = false;
    let createdMessageId = null;

    showStatus('Проверка данных и создание запроса...');

    try {
        const profile = await getCurrentProfile(user);
        const requestedRank = document.getElementById('requestedRank').value;
        const reason = document.getElementById('requestReason').value.trim();
        const reporting = document.getElementById('reporting').value.trim();

        const requested = ALL_RANKS.find(item => item.name === requestedRank);
        const currentIndex = ALL_RANKS.findIndex(item => item.name === profile.rank);
        const requestedIndex = ALL_RANKS.findIndex(item => item.name === requestedRank);

        if (!requested || requestedIndex <= currentIndex) {
            throw new Error('Можно запрашивать только звание выше текущего.');
        }
        if (!reason) throw new Error('Укажите обоснование запроса.');
        if (reason.length > 2000) throw new Error('Обоснование слишком длинное.');

        const existing = await db.collection('rankRequests')
            .where('userId', '==', user.uid)
            .get();

        if (existing.docs.some(doc => doc.data().status === 'pending')) {
            throw new Error('У вас уже есть запрос, ожидающий рассмотрения.');
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3);

        reportRef = db.collection('reports').doc();
        requestRef = db.collection('rankRequests').doc();

        const formData = {
            reporting,
            requestedRank,
            formType: "Запрос на повышение",
            authorRank: profile.rank,
            accessLevel: profile.accessLevel,
            rankRequestId: requestRef.id
        };

        const batch = db.batch();

        batch.set(reportRef, {
            ...formData,
            userId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            expires_at: firebase.firestore.Timestamp.fromDate(expiresAt),
            discordSyncStatus: "pending",
            discordSyncError: null,
            discordSyncUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.set(requestRef, {
            userId: user.uid,
            soldierNumber: profile.soldierNumber || user.email.split('@')[0],
            currentRank: profile.rank,
            currentAccessLevel: profile.accessLevel,
            requestedRank,
            requestedLevel: requested.level,
            reason,
            reporting,
            reportId: reportRef.id,
            status: "pending",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        firestoreSaved = true;
        showStatus('Запрос сохранён. Отправка рапорта в Discord...');

        const payload = {
            username: "Канцелярия 41-го ЭРК",
            embeds: [{
                title: "Форма рапорта запроса на проверку готовности к повышению",
                color: 3096367,
                fields: [
                    { name: "Докладывает:", value: `\`${reporting}\``, inline: false },
                    { name: "Запрашиваю проверку на повышение в звании", value: `**${requestedRank}**`, inline: false }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        const response = await fetch(`${PROMOTION_WEBHOOK_URL}?wait=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        let discordResult = {};
        try {
            discordResult = responseText ? JSON.parse(responseText) : {};
        } catch (_) {}

        if (!response.ok) {
            throw new Error(
                `Discord HTTP ${response.status}: ${discordResult.message || discordResult.error || responseText || 'Ошибка Discord'}`
            );
        }

        discordResponseAccepted = true;
        if (!discordResult.id) throw new Error('Discord не вернул ID сообщения.');

        createdMessageId = discordResult.id;

        await reportRef.update({
            discordMessageId: createdMessageId,
            discordSyncStatus: "synced",
            discordSyncError: firebase.firestore.FieldValue.delete(),
            discordSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
            discordSyncUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showStatus('Запрос отправлен администрации. Ожидайте решения.', 'success');
        promotionForm.reset();
        await checkPendingRequest(user);

    } catch (error) {
        console.error('Ошибка запроса на повышение:', error);

        if (reportRef && firestoreSaved) {
            try {
                const failedData = {
                    discordSyncStatus: "failed",
                    discordSyncError: String(error.message).slice(0, 1000),
                    discordSyncUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (createdMessageId) failedData.discordMessageId = createdMessageId;
                await reportRef.update(failedData);
            } catch (statusError) {
                console.error('Не удалось обновить статус рапорта:', statusError);
            }
        }

        if (firestoreSaved) {
            promotionForm.reset();
            await checkPendingRequest(user);

            const warning = createdMessageId || discordResponseAccepted
                ? 'Discord мог уже создать сообщение. Не отправляйте запрос повторно.'
                : 'Заявка сохранена в базе, но отправка в Discord не подтверждена. Не отправляйте запрос повторно.';

            showStatus(`${warning} ID запроса: ${requestRef.id}`, 'error');
        } else {
            showStatus('Не удалось создать запрос: ' + error.message, 'error');
        }
    } finally {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await auth.signOut();
    window.location.href = '../login/login.html';
});
