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


// ======================================================
// СПРАВОЧНИК ЗВАНИЙ И УРОВНЕЙ
// ======================================================

const RANK_GROUPS = [
    {
        label: "Уровень 0",
        level: 0,
        ranks: [
            "Рядовой-рекрут",
            "Рядовой",
            "Старший рядовой"
        ]
    },
    {
        label: "Уровень 1",
        level: 1,
        ranks: [
            "Специалист",
            "Капрал"
        ]
    },
    {
        label: "Уровень 2",
        level: 2,
        ranks: [
            "Сержант",
            "Штаб-сержант",
            "Сержант первого класса"
        ]
    },
    {
        label: "Уровень 3",
        level: 3,
        ranks: [
            "Первый сержант",
            "Мастер-сержант",
            "Сержант-майор"
        ]
    },
    {
        label: "Уровень 4",
        level: 4,
        ranks: [
            "Команд сержант-майор",
            "Сержант-майор сухопутных войск"
        ]
    },
    {
        label: "Уровень 5",
        level: 5,
        ranks: [
            "Младший лейтенант",
            "Лейтенант"
        ]
    },
    {
        label: "Уровень 6",
        level: 6,
        ranks: [
            "Капитан",
            "Майор",
            "Подполковник",
            "Полковник"
        ]
    },
    {
        label: "КМД (администрация)",
        level: null,
        ranks: [
            "Командир",
            "Командир первого класса",
            "Коммандер",
            "Маршал"
        ]
    }
];

const RANK_TO_LEVEL = {};

RANK_GROUPS.forEach(group => {
    group.ranks.forEach(rank => {
        RANK_TO_LEVEL[rank] = group.level;
    });
});

// Порядок обычных воинских званий.
// Используется для проверки того, что запрошено действительно
// более высокое звание, в том числе внутри одного уровня.

const PROMOTION_RANK_ORDER = RANK_GROUPS
    .filter(group => group.level !== null)
    .flatMap(group => group.ranks);


// ======================================================
// СОСТОЯНИЕ ПАНЕЛИ
// ======================================================

let currentUser = null;
let currentProfile = null;

let allUsers = [];
let pendingUsers = [];
let pendingRankRequests = [];

let realtimeListenersStarted = false;
let realtimeUnsubscribeFunctions = [];


// ======================================================
// ЭЛЕМЕНТЫ СТРАНИЦЫ
// ======================================================

const adminIdentity =
    document.getElementById("adminIdentity");

const adminMessage =
    document.getElementById("adminMessage");

const pendingList =
    document.getElementById("pendingList");

const rankRequestsList =
    document.getElementById("rankRequestsList");

const usersList =
    document.getElementById("usersList");

const pendingCount =
    document.getElementById("pendingCount");

const rankRequestsCount =
    document.getElementById("rankRequestsCount");

const usersSearch =
    document.getElementById("usersSearch");


// ======================================================
// БЕЗОПАСНОЕ ОТОБРАЖЕНИЕ ТЕКСТА
// ======================================================

function escapeHtml(value) {

    return String(value ?? "").replace(/[&<>"']/g, char => {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[char];
    });
}


// ======================================================
// СООБЩЕНИЯ
// ======================================================

function showMessage(message, isError = false) {

    if (!adminMessage) return;

    adminMessage.textContent = message;

    adminMessage.style.color = isError
        ? "#ff7777"
        : "#e5e7eb";
}


// ======================================================
// ПРЕОБРАЗОВАНИЕ ЗВАНИЯ В УРОВЕНЬ
// ======================================================

function getLevelByRank(rank) {

    if (!Object.prototype.hasOwnProperty.call(RANK_TO_LEVEL, rank)) {
        return undefined;
    }

    return RANK_TO_LEVEL[rank];
}


function getRankDescription(rank) {

    if (!rank) {
        return "Звание не назначено";
    }

    const level = getLevelByRank(rank);

    if (level === undefined) {
        return rank;
    }

    if (level === null) {
        return `${rank} — КМД`;
    }

    return `${rank} — уровень ${level}`;
}


function getLevelLabel(level) {

    if (level === null) {
        return "КМД";
    }

    if (Number.isInteger(level)) {
        return `Уровень ${level}`;
    }

    return "Не указан";
}


// ======================================================
// ПРОВЕРКА ПОРЯДКА ЗВАНИЙ
// ======================================================

function isRankHigher(currentRank, requestedRank) {

    const currentIndex =
        PROMOTION_RANK_ORDER.indexOf(currentRank);

    const requestedIndex =
        PROMOTION_RANK_ORDER.indexOf(requestedRank);

    if (currentIndex === -1 || requestedIndex === -1) {
        return false;
    }

    return requestedIndex > currentIndex;
}


// ======================================================
// СПИСОК ЗВАНИЙ ДЛЯ SELECT
// ======================================================

function buildRankOptions(selectedRank = "") {

    let html = `
        <option value="">Выберите звание</option>
    `;

    RANK_GROUPS.forEach(group => {

        html += `
            <optgroup label="${escapeHtml(group.label)}">
        `;

        group.ranks.forEach(rank => {

            const selected =
                rank === selectedRank ? "selected" : "";

            html += `
                <option value="${escapeHtml(rank)}" ${selected}>
                    ${escapeHtml(rank)}
                </option>
            `;

        });

        html += "</optgroup>";

    });

    return html;
}


// ======================================================
// ПРЕОБРАЗОВАНИЕ ДАТЫ
// ======================================================

function formatDate(timestamp) {

    if (!timestamp) {
        return "Дата неизвестна";
    }

    if (typeof timestamp.toDate === "function") {
        return timestamp.toDate().toLocaleString("ru-RU");
    }

    if (timestamp instanceof Date) {
        return timestamp.toLocaleString("ru-RU");
    }

    return "Дата неизвестна";
}


function getTimestampMillis(timestamp) {

    if (!timestamp) {
        return 0;
    }

    if (typeof timestamp.toMillis === "function") {
        return timestamp.toMillis();
    }

    if (typeof timestamp.toDate === "function") {
        return timestamp.toDate().getTime();
    }

    if (timestamp instanceof Date) {
        return timestamp.getTime();
    }

    return 0;
}


// ======================================================
// СТАТУС ПОЛЬЗОВАТЕЛЯ
// ======================================================

function getStatusLabel(status) {

    const labels = {
        pending: "Ожидает одобрения",
        approved: "Одобрен",
        rejected: "Отклонён"
    };

    return labels[status] || "Неизвестный статус";
}


// ======================================================
// УВЕДОМЛЕНИЯ
// ======================================================

// Уведомления создаются через Firestore.
// Их получает конкретный пользователь по recipientUid.
//
// Важно: создание уведомлений выполняется внутри того же
// batch, что и изменение заявки или профиля.
// Таким образом, решение и уведомление сохраняются вместе.

function addNotificationToBatch(
    batch,
    recipientUid,
    type,
    title,
    message,
    relatedId
) {

    if (!recipientUid) {
        throw new Error("Не указан получатель уведомления.");
    }

    const notificationRef = db
        .collection("notifications")
        .doc();

    batch.set(notificationRef, {

        recipientUid: recipientUid,

        type: type,

        title: title,

        message: message,

        relatedId: relatedId || "",

        read: false,

        createdAt:
            firebase.firestore.FieldValue.serverTimestamp()

    });

}


// ======================================================
// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ======================================================

document.querySelectorAll(".admin-tab").forEach(button => {

    button.addEventListener("click", () => {

        const tab = button.dataset.tab;

        document.querySelectorAll(".admin-tab").forEach(item => {
            item.classList.remove("active");
        });

        document.querySelectorAll(".admin-section").forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");

        const tabPanels = {
            pending: "pendingPanel",
            users: "usersPanel",
            rankRequests: "rankRequestsPanel",
            "rank-requests": "rankRequestsPanel"
        };

        const panelId = tabPanels[tab];

        if (panelId) {

            const panel = document.getElementById(panelId);

            if (panel) {
                panel.classList.add("active");
            }

        }

    });

});


// ======================================================
// ЗАГРУЗКА ЗАЯВОК НА РЕГИСТРАЦИЮ
// ======================================================

async function loadPendingApplications() {

    if (pendingList) {
        pendingList.innerHTML = `
            <div class="admin-empty">Загрузка заявок...</div>
        `;
    }

    const snapshot = await db.collection("users")
        .where("status", "==", "pending")
        .get();

    pendingUsers = [];

    snapshot.forEach(doc => {

        pendingUsers.push({
            uid: doc.id,
            ...doc.data()
        });

    });

    pendingUsers.sort((a, b) =>
        String(a.soldierNumber || "").localeCompare(
            String(b.soldierNumber || ""),
            "ru",
            { numeric: true }
        )
    );

    if (pendingCount) {
        pendingCount.textContent = pendingUsers.length;
    }

    renderPendingApplications();
}


// ======================================================
// ОТОБРАЖЕНИЕ ЗАЯВОК НА РЕГИСТРАЦИЮ
// ======================================================

function renderPendingApplications() {

    if (!pendingList) return;

    if (pendingUsers.length === 0) {

        pendingList.innerHTML = `
            <div class="admin-empty">
                Новых заявок на регистрацию нет.
            </div>
        `;

        return;
    }

    pendingList.innerHTML = pendingUsers.map(user => {

        const uid = escapeHtml(user.uid);

        const number = escapeHtml(
            user.soldierNumber || "Не указан"
        );

        const createdAt = escapeHtml(
            formatDate(user.createdAt)
        );

        return `
            <article class="admin-card" data-user-card="${uid}">

                <div class="admin-card-header">

                    <h3>Боец № ${number}</h3>

                    <span class="admin-status">
                        Ожидает одобрения
                    </span>

                </div>

                <div class="admin-meta">
                    <div>UID: ${uid}</div>
                    <div>Дата регистрации: ${createdAt}</div>
                </div>

                <div class="admin-field">

                    <label>Назначить звание:</label>

                    <select
                        class="admin-select"
                        data-rank-select
                    >
                        ${buildRankOptions(user.rank || "")}
                    </select>

                    <div class="admin-small-note" data-level-preview>
                        Выберите звание для определения уровня доступа.
                    </div>

                </div>

                <div class="admin-actions">

                    <button
                        type="button"
                        class="admin-button admin-approve"
                        data-action="approve"
                        data-uid="${uid}"
                        ${user.rank ? "" : "disabled"}
                    >
                        ОДОБРИТЬ
                    </button>

                    <button
                        type="button"
                        class="admin-button admin-reject"
                        data-action="reject"
                        data-uid="${uid}"
                    >
                        ОТКЛОНИТЬ
                    </button>

                </div>

            </article>
        `;

    }).join("");
}


// ======================================================
// ОДОБРЕНИЕ ПОЛЬЗОВАТЕЛЯ
// ======================================================

async function approveUser(uid, button) {

    const card = button.closest("[data-user-card]");

    if (!card) return;

    const rankSelect = card.querySelector("[data-rank-select]");

    const rank = rankSelect ? rankSelect.value : "";

    if (!rank) {

        showMessage(
            "Перед одобрением необходимо назначить пользователю звание.",
            true
        );

        return;
    }

    const accessLevel = getLevelByRank(rank);

    if (accessLevel === undefined) {

        showMessage("Не удалось определить уровень звания.", true);

        return;
    }

    const numberElement = card.querySelector("h3");

    const soldierNumber = numberElement
        ? numberElement.textContent.replace("Боец № ", "")
        : uid;

    const confirmed = confirm(
        `Одобрить регистрацию бойца № ${soldierNumber}?\n\nЗвание: ${rank}\nУровень: ${accessLevel === null ? "КМД" : accessLevel}`
    );

    if (!confirmed) return;

    button.disabled = true;

    try {

        const batch = db.batch();

        const userRef = db.collection("users").doc(uid);

        batch.update(userRef, {

            status: "approved",

            rank: rank,

            accessLevel: accessLevel,

            approvedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            approvedBy: currentUser.uid,

            updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        addNotificationToBatch(
            batch,
            uid,
            "registration_approved",
            "Регистрация одобрена",
            `Ваша регистрация одобрена. Вам назначено звание: ${rank}.`,
            uid
        );

        await batch.commit();

        showMessage("Пользователь успешно одобрен. Уведомление отправлено.");

        await loadAllData();

    } catch (error) {

        console.error("Ошибка одобрения:", error);

        showMessage(
            "Не удалось одобрить пользователя: " + error.message,
            true
        );

        button.disabled = false;

    }
}


// ======================================================
// ОТКЛОНЕНИЕ РЕГИСТРАЦИИ
// ======================================================

async function rejectUser(uid, button) {

    const confirmed = confirm(
        "Вы действительно хотите отклонить эту регистрацию?"
    );

    if (!confirmed) return;

    button.disabled = true;

    try {

        const batch = db.batch();

        const userRef = db.collection("users").doc(uid);

        batch.update(userRef, {

            status: "rejected",

            rejectedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            rejectedBy: currentUser.uid,

            updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        addNotificationToBatch(
            batch,
            uid,
            "registration_rejected",
            "Регистрация отклонена",
            "Ваша заявка на регистрацию была отклонена администрацией.",
            uid
        );

        await batch.commit();

        showMessage("Заявка отклонена. Уведомление отправлено.");

        await loadAllData();

    } catch (error) {

        console.error("Ошибка отклонения:", error);

        showMessage(
            "Не удалось отклонить регистрацию: " + error.message,
            true
        );

        button.disabled = false;

    }
}


// ======================================================
// ЗАГРУЗКА ЗАПРОСОВ НА ПОВЫШЕНИЕ
// ======================================================

async function loadRankRequests() {

    if (rankRequestsList) {
        rankRequestsList.innerHTML = `
            <div class="admin-empty">
                Загрузка запросов на повышение...
            </div>
        `;
    }

    const snapshot = await db
        .collection("rankRequests")
        .where("status", "==", "pending")
        .get();

    pendingRankRequests = [];

    snapshot.forEach(doc => {

        pendingRankRequests.push({
            id: doc.id,
            ...doc.data()
        });

    });

    pendingRankRequests.sort((a, b) =>
        getTimestampMillis(b.createdAt) -
        getTimestampMillis(a.createdAt)
    );

    if (rankRequestsCount) {
        rankRequestsCount.textContent = pendingRankRequests.length;
    }

    renderRankRequests();
}


// ======================================================
// ОТОБРАЖЕНИЕ ЗАПРОСОВ НА ПОВЫШЕНИЕ
// ======================================================

function renderRankRequests() {

    if (!rankRequestsList) return;

    if (pendingRankRequests.length === 0) {

        rankRequestsList.innerHTML = `
            <div class="admin-empty">
                Новых запросов на повышение нет.
            </div>
        `;

        return;
    }

    rankRequestsList.innerHTML = pendingRankRequests.map(request => {

        const requestId = escapeHtml(request.id);

        const uid = escapeHtml(request.userId || "Не указан");

        const soldierNumber = escapeHtml(
            request.soldierNumber || "Не указан"
        );

        const currentRank = escapeHtml(
            request.currentRank || "Не указано"
        );

        const requestedRank = escapeHtml(
            request.requestedRank || "Не указано"
        );

        const currentLevel = escapeHtml(
            getLevelLabel(request.currentAccessLevel)
        );

        const requestedLevel = escapeHtml(
            getLevelLabel(request.requestedLevel)
        );

        const reporting = escapeHtml(
            request.reporting || "Не указано"
        );

        const reason = escapeHtml(
            request.reason || "Причина не указана"
        );

        const createdAt = escapeHtml(
            formatDate(request.createdAt)
        );

        const reportId = escapeHtml(
            request.reportId || "Не указан"
        );

        return `
            <article
                class="admin-card"
                data-rank-request-card="${requestId}"
            >

                <div class="admin-card-header">

                    <h3>Боец № ${soldierNumber}</h3>

                    <span class="admin-status">
                        Ожидает рассмотрения
                    </span>

                </div>

                <div class="admin-meta">

                    <div>UID бойца: ${uid}</div>

                    <div>Дата подачи: ${createdAt}</div>

                    <div>Кто подал запрос: ${reporting}</div>

                    <div>ID рапорта: ${reportId}</div>

                </div>

                <div class="admin-field">

                    <label>Текущее звание:</label>

                    <div>
                        ${currentRank}
                        (${currentLevel})
                    </div>

                </div>

                <div class="admin-field">

                    <label>Запрашиваемое звание:</label>

                    <strong>
                        ${requestedRank}
                        (${requestedLevel})
                    </strong>

                </div>

                <div class="admin-field">

                    <label>Причина повышения:</label>

                    <div>
                        ${reason}
                    </div>

                </div>

                <div class="admin-actions">

                    <button
                        type="button"
                        class="admin-button admin-approve"
                        data-action="approve-rank"
                        data-request-id="${requestId}"
                    >
                        ОДОБРИТЬ ПОВЫШЕНИЕ
                    </button>

                    <button
                        type="button"
                        class="admin-button admin-reject"
                        data-action="reject-rank"
                        data-request-id="${requestId}"
                    >
                        ОТКЛОНИТЬ ЗАПРОС
                    </button>

                </div>

            </article>
        `;

    }).join("");
}


// ======================================================
// ПОЛУЧЕНИЕ АКТУАЛЬНОГО ЗАПРОСА НА ПОВЫШЕНИЕ
// ======================================================

async function getPendingRankRequest(requestId) {

    const requestSnapshot = await db
        .collection("rankRequests")
        .doc(requestId)
        .get();

    if (!requestSnapshot.exists) {
        throw new Error("Запрос на повышение не найден.");
    }

    const request = requestSnapshot.data();

    if (request.status !== "pending") {
        throw new Error(
            "Этот запрос уже был рассмотрен другим администратором."
        );
    }

    return {
        id: requestSnapshot.id,
        ...request
    };
}


// ======================================================
// ПРОВЕРКА АКТУАЛЬНОСТИ ЗАПРОСА
// ======================================================

// Перед одобрением проверяем:
// 1. Существует ли профиль бойца.
// 2. Одобрен ли его аккаунт.
// 3. Не изменилось ли его звание с момента подачи запроса.
// 4. Не изменился ли уровень доступа.
// 5. Действительно ли запрошено более высокое звание.
// 6. Совпадает ли уровень запрошенного звания со справочником.

async function validateRankRequest(request) {

    if (!request.userId) {
        throw new Error("В запросе отсутствует UID бойца.");
    }

    const userSnapshot = await db
        .collection("users")
        .doc(request.userId)
        .get();

    if (!userSnapshot.exists) {
        throw new Error("Профиль бойца не найден.");
    }

    const userData = userSnapshot.data();

    if (userData.status !== "approved") {
        throw new Error(
            "Аккаунт бойца не находится в статусе одобрения."
        );
    }

    if (userData.role !== "user") {
        throw new Error(
            "Запрос на повышение принадлежит не обычному пользователю."
        );
    }

    if (
        userData.rank !== request.currentRank ||
        userData.accessLevel !== request.currentAccessLevel
    ) {

        throw new Error(
            "Звание или уровень доступа бойца изменились после подачи запроса. Запрос нельзя одобрить."
        );

    }

    const currentLevel = getLevelByRank(userData.rank);

    if (
        !Number.isInteger(currentLevel) ||
        currentLevel !== userData.accessLevel
    ) {

        throw new Error(
            "Текущее звание или уровень доступа бойца некорректны."
        );

    }

    const requestedLevel = getLevelByRank(
        request.requestedRank
    );

    if (
        !Number.isInteger(requestedLevel) ||
        requestedLevel !== request.requestedLevel
    ) {

        throw new Error(
            "Запрашиваемое звание или его уровень некорректны."
        );

    }

    if (
        !isRankHigher(
            request.currentRank,
            request.requestedRank
        )
    ) {

        throw new Error(
            "Запрошенное звание не является более высоким."
        );

    }

    return {
        userRef: userSnapshot.ref,
        userData: userData,
        requestedLevel: requestedLevel
    };
}


// ======================================================
// ОДОБРЕНИЕ ЗАПРОСА НА ПОВЫШЕНИЕ
// ======================================================

async function approveRankRequest(requestId, button) {

    const confirmed = confirm(
        "Вы действительно хотите одобрить запрос на повышение?\n\nПосле одобрения звание и уровень доступа бойца будут изменены."
    );

    if (!confirmed) return;

    button.disabled = true;

    try {

        // Повторно читаем заявку из Firestore.
        // Это защищает от одобрения уже рассмотренного запроса.

        const request = await getPendingRankRequest(requestId);

        // Проверяем актуальность звания и уровня бойца.

        const validation = await validateRankRequest(request);

        const batch = db.batch();

        // Обновляем профиль бойца.

        batch.update(validation.userRef, {

            rank: request.requestedRank,

            accessLevel: validation.requestedLevel,

            updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        // Отмечаем запрос как одобренный.

        const requestRef = db
            .collection("rankRequests")
            .doc(requestId);

        batch.update(requestRef, {

            status: "approved",

            decidedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            decidedBy: currentUser.uid,

            decisionNote: "Запрос одобрен администрацией."

        });

        // Создаём уведомление бойцу.

        addNotificationToBatch(
            batch,
            request.userId,
            "rank_approved",
            "Запрос на повышение одобрен",
            `Ваш запрос на повышение одобрен. Новое звание: ${request.requestedRank}. Новый уровень доступа: ${validation.requestedLevel}.`,
            requestId
        );

        // Сохраняем все изменения одной операцией.

        await batch.commit();

        showMessage(
            `Запрос одобрен. Боец № ${request.soldierNumber || "?"} получил звание ${request.requestedRank}. Уведомление отправлено.`
        );

        await loadAllData();

    } catch (error) {

        console.error(
            "Ошибка одобрения запроса на повышение:",
            error
        );

        showMessage(
            "Не удалось одобрить запрос: " + error.message,
            true
        );

        button.disabled = false;

    }
}


// ======================================================
// ОТКЛОНЕНИЕ ЗАПРОСА НА ПОВЫШЕНИЕ
// ======================================================

async function rejectRankRequest(requestId, button) {

    const decisionNote = prompt(
        "Укажите причину отклонения запроса на повышение:"
    );

    // Отмена окна означает отмену отклонения.

    if (decisionNote === null) {
        return;
    }

    const finalDecisionNote =
        decisionNote.trim() || "Без дополнительного комментария.";

    if (finalDecisionNote.length > 1000) {

        showMessage(
            "Причина отклонения не должна превышать 1000 символов.",
            true
        );

        return;
    }

    const confirmed = confirm(
        "Отклонить запрос на повышение?\n\nПричина: " +
        finalDecisionNote
    );

    if (!confirmed) return;

    button.disabled = true;

    try {

        const request = await getPendingRankRequest(requestId);

        const batch = db.batch();

        const requestRef = db
            .collection("rankRequests")
            .doc(requestId);

        // Изменяем статус заявки.

        batch.update(requestRef, {

            status: "rejected",

            decidedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            decidedBy: currentUser.uid,

            decisionNote: finalDecisionNote

        });

        // Проверяем существование профиля получателя.
        // Если профиль существует, отправляем уведомление.

        const recipientSnapshot = await db
            .collection("users")
            .doc(request.userId)
            .get();

        if (recipientSnapshot.exists) {

            addNotificationToBatch(
                batch,
                request.userId,
                "rank_rejected",
                "Запрос на повышение отклонён",
                `Ваш запрос на повышение отклонён. Причина: ${finalDecisionNote}`,
                requestId
            );

        }

        await batch.commit();

        showMessage(
            "Запрос на повышение отклонён. Решение сохранено."
        );

        await loadAllData();

    } catch (error) {

        console.error(
            "Ошибка отклонения запроса на повышение:",
            error
        );

        showMessage(
            "Не удалось отклонить запрос: " + error.message,
            true
        );

        button.disabled = false;

    }
}


// ======================================================
// ЗАГРУЗКА ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
// ======================================================

async function loadUsers() {

    if (usersList) {
        usersList.innerHTML = `
            <div class="admin-empty">Загрузка пользователей...</div>
        `;
    }

    const snapshot = await db.collection("users").get();

    allUsers = [];

    snapshot.forEach(doc => {

        allUsers.push({
            uid: doc.id,
            ...doc.data()
        });

    });

    allUsers.sort((a, b) =>
        String(a.soldierNumber || "").localeCompare(
            String(b.soldierNumber || ""),
            "ru",
            { numeric: true }
        )
    );

    renderUsers();
}


// ======================================================
// ОТОБРАЖЕНИЕ ПОЛЬЗОВАТЕЛЕЙ
// ======================================================

function renderUsers() {

    if (!usersList) return;

    const searchValue = usersSearch
        ? usersSearch.value.trim().toLowerCase()
        : "";

    const filteredUsers = allUsers.filter(user => {

        const searchable = [
            user.soldierNumber,
            user.rank,
            user.status,
            user.role
        ].join(" ").toLowerCase();

        return searchable.includes(searchValue);

    });

    if (filteredUsers.length === 0) {

        usersList.innerHTML = `
            <div class="admin-empty">
                Пользователи не найдены.
            </div>
        `;

        return;
    }

    usersList.innerHTML = filteredUsers.map(user => {

        const uid = escapeHtml(user.uid);

        const number = escapeHtml(
            user.soldierNumber || "Не указан"
        );

        const rank = escapeHtml(
            getRankDescription(user.rank)
        );

        const status = escapeHtml(
            getStatusLabel(user.status)
        );

        const role = escapeHtml(
            user.role || "user"
        );

        let rankControls = "";

        if (user.role === "user") {

            rankControls = `
                <div class="admin-field">

                    <label>Изменить звание:</label>

                    <select
                        class="admin-select"
                        data-rank-select
                    >
                        ${buildRankOptions(user.rank || "")}
                    </select>

                    <div class="admin-small-note" data-level-preview>
                        ${escapeHtml(getRankDescription(user.rank))}
                    </div>

                    <div class="admin-actions">

                        <button
                            type="button"
                            class="admin-button admin-save"
                            data-action="save-rank"
                            data-uid="${uid}"
                        >
                            СОХРАНИТЬ ЗВАНИЕ
                        </button>

                    </div>

                </div>
            `;

        }

        let roleControls = "";

        if (
            currentProfile &&
            currentProfile.role === "superadmin"
        ) {

            if (user.role === "superadmin") {

                roleControls = `
                    <div class="admin-field">
                        <label>Административная роль:</label>
                        <strong>Главный администратор</strong>
                        <div class="admin-small-note">
                            Роль главного администратора закреплена отдельно.
                        </div>
                    </div>
                `;

            } else {

                roleControls = `
                    <div class="admin-field">

                        <label>Административная роль:</label>

                        <select
                            class="admin-select"
                            data-role-select
                        >
                            <option
                                value="user"
                                ${user.role === "user" ? "selected" : ""}
                            >
                                Обычный пользователь
                            </option>

                            <option
                                value="admin"
                                ${user.role === "admin" ? "selected" : ""}
                            >
                                Администратор
                            </option>

                        </select>

                        <div class="admin-actions">

                            <button
                                type="button"
                                class="admin-button admin-save"
                                data-action="save-role"
                                data-uid="${uid}"
                            >
                                СОХРАНИТЬ РОЛЬ
                            </button>

                        </div>

                    </div>
                `;

            }

        }

        return `
            <article class="admin-card" data-user-card="${uid}">

                <div class="admin-card-header">

                    <h3>Боец № ${number}</h3>

                    <span class="admin-status">
                        ${status}
                    </span>

                </div>

                <div class="admin-meta">

                    <div>UID: ${uid}</div>

                    <div>Звание: ${rank}</div>

                    <div>Роль: ${role}</div>

                    <div>
                        Дата регистрации:
                        ${escapeHtml(formatDate(user.createdAt))}
                    </div>

                </div>

                ${rankControls}

                ${roleControls}

            </article>
        `;

    }).join("");
}


// ======================================================
// СОХРАНЕНИЕ НОВОГО ЗВАНИЯ
// ======================================================

async function saveUserRank(uid, button) {

    const card = button.closest("[data-user-card]");

    if (!card) return;

    const rankSelect = card.querySelector("[data-rank-select]");

    const rank = rankSelect ? rankSelect.value : "";

    if (!rank) {

        showMessage("Выберите звание.", true);

        return;
    }

    const accessLevel = getLevelByRank(rank);

    if (accessLevel === undefined) {

        showMessage("Не удалось определить уровень звания.", true);

        return;
    }

    button.disabled = true;

    try {

        await db.collection("users").doc(uid).update({

            rank: rank,

            accessLevel: accessLevel,

            updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        showMessage(
            `Звание изменено: ${rank}. Уровень: ${accessLevel === null ? "КМД" : accessLevel}.`
        );

        await loadAllData();

    } catch (error) {

        console.error("Ошибка изменения звания:", error);

        showMessage(
            "Не удалось изменить звание: " + error.message,
            true
        );

        button.disabled = false;

    }
}


// ======================================================
// УПРАВЛЕНИЕ АДМИНИСТРАТИВНЫМИ РОЛЯМИ
// ======================================================

async function saveUserRole(uid, button) {

    if (!currentProfile || currentProfile.role !== "superadmin") {

        showMessage(
            "Только главный администратор может назначать администраторов.",
            true
        );

        return;
    }

    const card = button.closest("[data-user-card]");

    if (!card) return;

    const roleSelect = card.querySelector("[data-role-select]");

    const newRole = roleSelect ? roleSelect.value : "";

    if (!["user", "admin"].includes(newRole)) {

        showMessage("Недопустимая роль.", true);

        return;
    }

    if (uid === currentUser.uid) {

        showMessage(
            "Нельзя изменить собственную роль через этот раздел.",
            true
        );

        return;
    }

    const confirmed = confirm(
        newRole === "admin"
            ? "Назначить этому пользователю администратора?"
            : "Снять с этого пользователя права администратора?"
    );

    if (!confirmed) return;

    button.disabled = true;

    try {

        await db.collection("users").doc(uid).update({

            role: newRole,

            updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        showMessage(
            newRole === "admin"
                ? "Пользователь назначен администратором."
                : "Права администратора сняты."
        );

        await loadAllData();

    } catch (error) {

        console.error("Ошибка изменения роли:", error);

        showMessage(
            "Не удалось изменить роль: " + error.message,
            true
        );

        button.disabled = false;

    }
}


// ======================================================
// ОБРАБОТКА КНОПОК
// ======================================================

document.addEventListener("click", async (event) => {

    const target = event.target;

    if (!target || typeof target.closest !== "function") {
        return;
    }

    const button = target.closest("[data-action]");

    if (!button) return;

    const action = button.dataset.action;
    const uid = button.dataset.uid;
    const requestId = button.dataset.requestId;

    try {

        if (action === "approve" && uid) {
            await approveUser(uid, button);
        }

        else if (action === "reject" && uid) {
            await rejectUser(uid, button);
        }

        else if (action === "save-rank" && uid) {
            await saveUserRank(uid, button);
        }

        else if (action === "save-role" && uid) {
            await saveUserRole(uid, button);
        }

        else if (action === "approve-rank" && requestId) {
            await approveRankRequest(requestId, button);
        }

        else if (action === "reject-rank" && requestId) {
            await rejectRankRequest(requestId, button);
        }

    } catch (error) {

        console.error("Ошибка обработки действия:", error);

        showMessage(
            "Не удалось выполнить действие: " + error.message,
            true
        );

    }

});


// ======================================================
// ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР УРОВНЯ ПО ЗВАНИЮ
// ======================================================

document.addEventListener("change", (event) => {

    if (!event.target.matches("[data-rank-select]")) return;

    const card = event.target.closest("[data-user-card]");

    if (!card) return;

    const preview = card.querySelector("[data-level-preview]");

    const rank = event.target.value;

    if (!rank) {

        if (preview) {
            preview.textContent =
                "Выберите звание для определения уровня доступа.";
        }

        return;
    }

    if (preview) {
        preview.textContent = getRankDescription(rank);
    }

    // На вкладке заявок включаем кнопку одобрения
    // только после выбора звания.

    const approveButton = card.querySelector(
        '[data-action="approve"]'
    );

    if (approveButton) {
        approveButton.disabled = false;
    }

});


// ======================================================
// ПОИСК ПОЛЬЗОВАТЕЛЕЙ
// ======================================================

if (usersSearch) {

    usersSearch.addEventListener("input", () => {
        renderUsers();
    });

}


// ======================================================
// ОБЩАЯ ЗАГРУЗКА ДАННЫХ
// ======================================================

async function loadAllData() {

    showMessage("Обновление данных...");

    try {

        await Promise.all([

            loadPendingApplications(),

            loadRankRequests(),

            loadUsers()

        ]);

        showMessage(
            "Данные административной панели обновлены."
        );

    } catch (error) {

        console.error("Ошибка загрузки данных:", error);

        showMessage(
            "Не удалось загрузить данные: " + error.message,
            true
        );

    }
}


// ======================================================
// REALTIME-ОБНОВЛЕНИЕ ДАННЫХ
// ======================================================

// Подписки обновляют списки заявок и пользователей
// без необходимости перезагружать страницу.
//
// Дополнительно проверяется, что подписки ещё не были созданы.

function startRealtimeListeners() {

    if (realtimeListenersStarted) return;

    realtimeListenersStarted = true;

    // --------------------------------------------------
    // Заявки на регистрацию
    // --------------------------------------------------

    const pendingUnsubscribe = db
        .collection("users")
        .where("status", "==", "pending")
        .onSnapshot(snapshot => {

            pendingUsers = [];

            snapshot.forEach(doc => {

                pendingUsers.push({
                    uid: doc.id,
                    ...doc.data()
                });

            });

            pendingUsers.sort((a, b) =>
                String(a.soldierNumber || "").localeCompare(
                    String(b.soldierNumber || ""),
                    "ru",
                    { numeric: true }
                )
            );

            if (pendingCount) {
                pendingCount.textContent = pendingUsers.length;
            }

            renderPendingApplications();

        }, error => {

            console.error(
                "Ошибка realtime-заявок на регистрацию:",
                error
            );

            showMessage(
                "Ошибка обновления заявок на регистрацию: " + error.message,
                true
            );

        });

    realtimeUnsubscribeFunctions.push(pendingUnsubscribe);


    // --------------------------------------------------
    // Запросы на повышение
    // --------------------------------------------------

    const rankRequestsUnsubscribe = db
        .collection("rankRequests")
        .where("status", "==", "pending")
        .onSnapshot(snapshot => {

            pendingRankRequests = [];

            snapshot.forEach(doc => {

                pendingRankRequests.push({
                    id: doc.id,
                    ...doc.data()
                });

            });

            pendingRankRequests.sort((a, b) =>
                getTimestampMillis(b.createdAt) -
                getTimestampMillis(a.createdAt)
            );

            if (rankRequestsCount) {
                rankRequestsCount.textContent =
                    pendingRankRequests.length;
            }

            renderRankRequests();

        }, error => {

            console.error(
                "Ошибка realtime-запросов на повышение:",
                error
            );

            showMessage(
                "Ошибка обновления запросов на повышение: " + error.message,
                true
            );

        });

    realtimeUnsubscribeFunctions.push(rankRequestsUnsubscribe);


    // --------------------------------------------------
    // Все пользователи
    // --------------------------------------------------

    const usersUnsubscribe = db
        .collection("users")
        .onSnapshot(snapshot => {

            allUsers = [];

            snapshot.forEach(doc => {

                allUsers.push({
                    uid: doc.id,
                    ...doc.data()
                });

            });

            allUsers.sort((a, b) =>
                String(a.soldierNumber || "").localeCompare(
                    String(b.soldierNumber || ""),
                    "ru",
                    { numeric: true }
                )
            );

            renderUsers();

        }, error => {

            console.error(
                "Ошибка realtime-пользователей:",
                error
            );

            showMessage(
                "Ошибка обновления пользователей: " + error.message,
                true
            );

        });

    realtimeUnsubscribeFunctions.push(usersUnsubscribe);

}


// ======================================================
// ОСТАНОВКА REALTIME-ПОДПИСОК
// ======================================================

function stopRealtimeListeners() {

    realtimeUnsubscribeFunctions.forEach(unsubscribe => {

        try {
            unsubscribe();
        } catch (error) {
            console.error("Ошибка остановки подписки:", error);
        }

    });

    realtimeUnsubscribeFunctions = [];

    realtimeListenersStarted = false;

}


// ======================================================
// ПРОВЕРКА АДМИНИСТРАТИВНЫХ ПРАВ
// ======================================================

auth.onAuthStateChanged(async (user) => {

    currentUser = user;

    if (!user) {

        stopRealtimeListeners();

        window.location.href = "../login/login.html";

        return;
    }

    try {

        const profileSnapshot = await db
            .collection("users")
            .doc(user.uid)
            .get();

        if (!profileSnapshot.exists) {

            await auth.signOut();

            window.location.href = "../login/login.html";

            return;
        }

        currentProfile = profileSnapshot.data();

        if (currentProfile.status !== "approved") {

            await auth.signOut();

            window.location.href = "../login/login.html";

            return;
        }

        if (
            currentProfile.role !== "admin" &&
            currentProfile.role !== "superadmin"
        ) {

            showMessage(
                "У вас нет административных полномочий.",
                true
            );

            if (adminIdentity) {
                adminIdentity.textContent = "Доступ запрещён";
            }

            setTimeout(() => {
                window.location.href = "../dashboard/index.html";
            }, 1500);

            return;
        }

        const number =
            currentProfile.soldierNumber ||
            (user.email ? user.email.split("@")[0] : "Не указан");

        if (adminIdentity) {

            adminIdentity.textContent =
                `Боец № ${number} | ${
                    currentProfile.role === "superadmin"
                        ? "Главный администратор"
                        : "Администратор"
                }`;

        }

        await loadAllData();

        startRealtimeListeners();

    } catch (error) {

        console.error("Ошибка проверки доступа:", error);

        showMessage(
            "Ошибка проверки административных прав: " + error.message,
            true
        );

        await auth.signOut();

        window.location.href = "../login/login.html";

    }

});


// ======================================================
// ВЫХОД ИЗ АККАУНТА
// ======================================================

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {

    logoutBtn.addEventListener("click", async () => {

        try {

            stopRealtimeListeners();

            await auth.signOut();

            window.location.href = "../login/login.html";

        } catch (error) {

            console.error("Ошибка выхода:", error);

            alert("Не удалось выйти из аккаунта.");

        }

    });

}
