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

// ==========================================
// СПРАВОЧНИК ЗВАНИЙ
// ==========================================

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
        label: "КМД (отдельная категория)",
        level: 7,
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

// ==========================================
// СОСТОЯНИЕ
// ==========================================

let currentUser = null;
let currentProfile = null;

let allUsers = [];
let pendingUsers = [];
let pendingRankRequests = [];

let firstPendingSnapshot = true;
let firstRankSnapshot = true;

let unsubscribePending = null;
let unsubscribeRankRequests = null;
let unsubscribeUsers = null;

// ==========================================
// ЭЛЕМЕНТЫ СТРАНИЦЫ
// ==========================================

const adminIdentity = document.getElementById("adminIdentity");
const adminMessage = document.getElementById("adminMessage");

const pendingList = document.getElementById("pendingList");
const rankRequestsList = document.getElementById("rankRequestsList");
const usersList = document.getElementById("usersList");

const pendingCount = document.getElementById("pendingCount");
const rankRequestsCount = document.getElementById("rankRequestsCount");

const usersSearch = document.getElementById("usersSearch");

// ==========================================
// БЕЗОПАСНОЕ ОТОБРАЖЕНИЕ ТЕКСТА
// ==========================================

function escapeHtml(value) {

    return String(value ?? "").replace(/[&<>"']/g, char => {

const entities = {
            "&": "&",
            "<": "<",
            ">": ">",
            '"': """,
            "'": "'"
        };

return entities[char];
    });
}

// ==========================================
// СООБЩЕНИЯ
// ==========================================

function showMessage(message, isError = false) {

    adminMessage.textContent = message;

adminMessage.style.color = isError
        ? "#ff7777"
        : "#e5e7eb";
}

// ==========================================
// УРОВНИ ЗВАНИЙ
// ==========================================

function getLevelByRank(rank) {
    return Object.prototype.hasOwnProperty.call(RANK_TO_LEVEL, rank)
        ? RANK_TO_LEVEL[rank]
        : undefined;
}

function getRankDescription(rank) {

if (!rank) {
        return "Звание не назначено";
    }

    const level = getLevelByRank(rank);

if (level === undefined) {
        return rank;
    }

if (level === 7) {
return $DIL0 — КМД;
}

return $DIL0 — уровень $DIL1;
}

function buildRankOptions(selectedRank = "") {

let html = DIL0;

    RANK_GROUPS.forEach(group => {

        html += `

`;

        });

        html += "</optgroup>";

    });

return html;
}

// ==========================================
// ФОРМАТИРОВАНИЕ ДАТЫ
// ==========================================

function formatDate(timestamp) {

if (!timestamp || typeof timestamp.toDate !== "function") {
        return "Дата неизвестна";
    }

return timestamp.toDate().toLocaleString("ru-RU");
}

// ==========================================
// СТАТУС ПОЛЬЗОВАТЕЛЯ
// ==========================================

function getStatusLabel(status) {

const labels = {
        pending: "Ожидает одобрения",
        approved: "Одобрен",
        rejected: "Отклонён"
    };

return labels[status] || "Неизвестный статус";
}

// ==========================================
// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ==========================================

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

const panel = document.getElementById(
            tab === "pending"
                ? "pendingPanel"
                : tab === "rankRequests"
                    ? "rankRequestsPanel"
                    : "usersPanel"
        );

if (panel) {
            panel.classList.add("active");
        }

    });

});

// ==========================================
// СОЗДАНИЕ УВЕДОМЛЕНИЯ БОЙЦУ
// ==========================================

function createUserNotification(
    batch,
    recipientUid,
    type,
    title,
    message,
    relatedId
) {

const notificationRef =
        db.collection("notifications").doc();

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

// ==========================================
// ПОДПИСКА НА ЗАЯВКИ В РЕАЛЬНОМ ВРЕМЕНИ
// ==========================================

function startRealtimeListeners() {

    // Заявки на регистрацию

unsubscribePending = db.collection("users")
        .where("status", "==", "pending")
        .onSnapshot(snapshot => {

pendingUsers = snapshot.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            }));

pendingUsers.sort((a, b) =>
                String(a.soldierNumber || "").localeCompare(
                    String(b.soldierNumber || ""),
                    "ru",
                    { numeric: true }
                )
            );

            pendingCount.textContent = pendingUsers.length;

            renderPendingApplications();

            if (!firstPendingSnapshot) {

const added = snapshot.docChanges().filter(
                    change => change.type === "added"
                );

if (added.length > 0) {
showMessage(
Поступила новая заявка на регистрацию. Новых заявок: $DIL0
);
}

            }

            firstPendingSnapshot = false;

        }, error => {

            console.error("Ошибка заявок на регистрацию:", error);

showMessage(
                "Не удалось получать заявки на регистрацию: " + error.message,
                true
            );

        });

    // Заявки на повышение

unsubscribeRankRequests = db.collection("rankRequests")
        .where("status", "==", "pending")
        .onSnapshot(snapshot => {

pendingRankRequests = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            pendingRankRequests.sort((a, b) => {

const dateA = a.createdAt?.toDate?.().getTime() || 0;
                const dateB = b.createdAt?.toDate?.().getTime() || 0;

return dateB - dateA;
            });

rankRequestsCount.textContent =
                pendingRankRequests.length;

            renderRankRequests();

            if (!firstRankSnapshot) {

const added = snapshot.docChanges().filter(
                    change => change.type === "added"
                );

if (added.length > 0) {
showMessage(
Поступил новый запрос на повышение. Новых запросов: $DIL0
);
}

            }

            firstRankSnapshot = false;

        }, error => {

            console.error("Ошибка запросов на повышение:", error);

showMessage(
                "Не удалось получать запросы на повышение: " + error.message,
                true
            );

        });

    // Все пользователи

unsubscribeUsers = db.collection("users")
        .onSnapshot(snapshot => {

allUsers = snapshot.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            }));

allUsers.sort((a, b) =>
                String(a.soldierNumber || "").localeCompare(
                    String(b.soldierNumber || ""),
                    "ru",
                    { numeric: true }
                )
            );

            renderUsers();

        }, error => {

            console.error("Ошибка списка пользователей:", error);

showMessage(
                "Не удалось обновить список пользователей: " + error.message,
                true
            );

        });

}

// ==========================================
// ОТОБРАЖЕНИЕ ЗАЯВОК НА РЕГИСТРАЦИЮ
// ==========================================

function renderPendingApplications() {

    if (pendingUsers.length === 0) {

pendingList.innerHTML = `

`;

return;
    }

    pendingList.innerHTML = pendingUsers.map(user => {

const uid = escapeHtml(user.uid);
        const number = escapeHtml(user.soldierNumber || "Не указан");

return `

`;

}).join("");
}

// ==========================================
// ОТОБРАЖЕНИЕ ЗАПРОСОВ НА ПОВЫШЕНИЕ
// ==========================================

function renderRankRequests() {

    if (pendingRankRequests.length === 0) {

rankRequestsList.innerHTML = `

`;

return;
    }

    rankRequestsList.innerHTML = pendingRankRequests.map(request => {

const id = escapeHtml(request.id);
        const number = escapeHtml(request.soldierNumber || "Не указан");

const currentRank = escapeHtml(request.currentRank);
        const requestedRank = escapeHtml(request.requestedRank);

const currentLevel = escapeHtml(request.currentAccessLevel);
        const requestedLevel = escapeHtml(request.requestedLevel);

return `

`;

}).join("");
}

// ==========================================
// ОДОБРЕНИЕ РЕГИСТРАЦИИ
// ==========================================

async function approveRegistration(uid, button) {

    const card = button.closest("[data-user-card]");

    const rank = card.querySelector("[data-rank-select]").value;

    const accessLevel = getLevelByRank(rank);

    if (!rank || !Number.isInteger(accessLevel)) {

showMessage(
            "Перед одобрением необходимо назначить корректное звание.",
            true
        );

return;
    }

    const userRef = db.collection("users").doc(uid);

    const userSnapshot = await userRef.get();

if (!userSnapshot.exists) {
        showMessage("Пользователь не найден.", true);
        return;
    }

    const userData = userSnapshot.data();

if (userData.status !== "pending") {
        showMessage("Эта заявка уже обработана.", true);
        return;
    }

const confirmed = confirm(
Одобрить регистрацию бойца № $DIL0?\n\nЗвание: $DIL1\nУровень: $DIL2
);

    if (!confirmed) return;

    button.disabled = true;

    try {

        const batch = db.batch();

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

createUserNotification(
batch,
uid,
"registration_approved",
"Регистрация одобрена",
Администрация одобрила вашу регистрацию. Назначено звание: $DIL0. Уровень доступа: $DIL1.,
uid
);

        await batch.commit();

showMessage(
Регистрация бойца № $DIL0 одобрена.
);

    } catch (error) {

        console.error("Ошибка одобрения регистрации:", error);

showMessage(
            "Не удалось одобрить регистрацию: " + error.message,
            true
        );

        button.disabled = false;

    }

}

// ==========================================
// ОТКЛОНЕНИЕ РЕГИСТРАЦИИ
// ==========================================

async function rejectRegistration(uid, button) {

    const userRef = db.collection("users").doc(uid);

    const userSnapshot = await userRef.get();

if (!userSnapshot.exists) {
        showMessage("Пользователь не найден.", true);
        return;
    }

    const userData = userSnapshot.data();

if (userData.status !== "pending") {
        showMessage("Эта заявка уже обработана.", true);
        return;
    }

const confirmed = confirm(
Отклонить регистрацию бойца № $DIL0?
);

    if (!confirmed) return;

    button.disabled = true;

    try {

        const batch = db.batch();

        batch.update(userRef, {

            status: "rejected",

rejectedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            rejectedBy: currentUser.uid,

updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

createUserNotification(
            batch,
            uid,
            "registration_rejected",
            "Регистрация отклонена",
            "Администрация отклонила вашу заявку на регистрацию. Обратитесь к администрации для уточнения причины.",
            uid
        );

        await batch.commit();

showMessage(
Регистрация бойца № $DIL0 отклонена.
);

    } catch (error) {

        console.error("Ошибка отклонения регистрации:", error);

showMessage(
            "Не удалось отклонить регистрацию: " + error.message,
            true
        );

        button.disabled = false;

    }

}

// ==========================================
// ОДОБРЕНИЕ ЗАПРОСА НА ПОВЫШЕНИЕ
// ==========================================

async function approveRankRequest(requestId, button) {

const requestRef =
        db.collection("rankRequests").doc(requestId);

    const requestSnapshot = await requestRef.get();

if (!requestSnapshot.exists) {
        showMessage("Запрос на повышение не найден.", true);
        return;
    }

    const request = requestSnapshot.data();

if (request.status !== "pending") {
        showMessage("Этот запрос уже обработан.", true);
        return;
    }

    const userRef = db.collection("users").doc(request.userId);

    const userSnapshot = await userRef.get();

if (!userSnapshot.exists) {
        showMessage("Профиль бойца не найден.", true);
        return;
    }

    const userProfile = userSnapshot.data();

if (
        userProfile.status !== "approved" ||
        userProfile.role !== "user"
    ) {
        showMessage(
            "Профиль бойца изменён или недоступен для повышения. Проверьте его вручную.",
            true
        );

return;
    }

    const validLevel = getLevelByRank(request.requestedRank);

if (
        !Number.isInteger(validLevel) ||
        validLevel !== request.requestedLevel
    ) {
        showMessage(
            "Данные запрашиваемого звания не совпадают со справочником. Запрос не обработан.",
            true
        );

return;
    }

const confirmed = confirm(
Одобрить повышение бойца № $DIL0?\n\n +
Старое звание: $DIL1\n +
Новое звание: $DIL2\n +
Новый уровень: $DIL3
);

    if (!confirmed) return;

    button.disabled = true;

    try {

        const batch = db.batch();

// Меняем профиль бойца.
        batch.update(userRef, {

            rank: request.requestedRank,

            accessLevel: validLevel,

updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

// Отмечаем запрос как одобренный.
        batch.update(requestRef, {

            status: "approved",

decidedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            decidedBy: currentUser.uid

        });

// Отправляем персональное уведомление.
createUserNotification(
batch,
request.userId,
"rank_approved",
"Запрос на повышение одобрен",
Администрация одобрила ваш запрос. Новое звание: $DIL0. Новый уровень доступа: $DIL1.,
requestId
);

        await batch.commit();

showMessage(
Боец № $DIL0 повышен до звания $DIL1.
);

    } catch (error) {

        console.error("Ошибка одобрения повышения:", error);

showMessage(
            "Не удалось одобрить повышение: " + error.message,
            true
        );

        button.disabled = false;

    }

}

// ==========================================
// ОТКЛОНЕНИЕ ЗАПРОСА НА ПОВЫШЕНИЕ
// ==========================================

async function rejectRankRequest(requestId, button) {

const requestRef =
        db.collection("rankRequests").doc(requestId);

    const requestSnapshot = await requestRef.get();

if (!requestSnapshot.exists) {
        showMessage("Запрос не найден.", true);
        return;
    }

    const request = requestSnapshot.data();

if (request.status !== "pending") {
        showMessage("Этот запрос уже обработан.", true);
        return;
    }

const decisionNote = prompt(
        "Укажите причину отказа бойцу:",
        ""
    );

if (decisionNote === null) {
        return;
    }

    button.disabled = true;

    try {

        const batch = db.batch();

        batch.update(requestRef, {

            status: "rejected",

decidedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            decidedBy: currentUser.uid,

            decisionNote: decisionNote.trim()

        });

createUserNotification(
batch,
request.userId,
"rank_rejected",
"Запрос на повышение отклонён",
decisionNote.trim()
? Администрация отклонила ваш запрос на звание $DIL0. Причина: $DIL1
: Администрация отклонила ваш запрос на звание $DIL2.,
requestId
);

        await batch.commit();

showMessage(
Запрос бойца № $DIL0 отклонён.
);

    } catch (error) {

        console.error("Ошибка отклонения повышения:", error);

showMessage(
            "Не удалось отклонить запрос: " + error.message,
            true
        );

        button.disabled = false;

    }

}

// ==========================================
// ЗАГРУЗКА И ОТОБРАЖЕНИЕ ПОЛЬЗОВАТЕЛЕЙ
// ==========================================

function renderUsers() {

const searchValue =
        usersSearch.value.trim().toLowerCase();

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

`;

return;
    }

    usersList.innerHTML = filteredUsers.map(user => {

        const uid = escapeHtml(user.uid);

        const number = escapeHtml(user.soldierNumber || "Не указан");

        const rank = escapeHtml(getRankDescription(user.rank));

        const status = escapeHtml(getStatusLabel(user.status));

        const role = escapeHtml(user.role || "user");

// Возможность изменения звания.
        // Обычный admin меняет звания обычным бойцам.
        // superadmin может менять звания обычным и администраторам.

const canEditRank =
            user.uid !== currentUser.uid &&
            (
                user.role === "user" ||
                (
                    currentProfile.role === "superadmin" &&
                    user.role === "admin"
                )
            );

        let rankControls = "";

        if (canEditRank) {

rankControls = `

`;

        }

        // Управление ролями доступно только superadmin.

        let roleControls = "";

        if (currentProfile.role === "superadmin") {

            if (user.role === "superadmin") {

roleControls = `

`;

            } else {

roleControls = `

                            Администратор
                        
                        
                    `;

            }

        }

return `

`;

    }).join("");

}

// ==========================================
// СОХРАНЕНИЕ ЗВАНИЯ В СПИСКЕ ПОЛЬЗОВАТЕЛЕЙ
// ==========================================

async function saveUserRank(uid, button) {

    const card = button.closest("[data-user-card]");

    const rank = card.querySelector("[data-rank-select]").value;

    const accessLevel = getLevelByRank(rank);

    if (!rank || !Number.isInteger(accessLevel)) {

        showMessage("Выберите корректное звание.", true);

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
Звание изменено: $DIL0. Уровень: $DIL1.
);

    } catch (error) {

        console.error("Ошибка изменения звания:", error);

showMessage(
            "Не удалось изменить звание: " + error.message,
            true
        );

        button.disabled = false;

    }

}

// ==========================================
// УПРАВЛЕНИЕ АДМИНИСТРАТИВНЫМИ РОЛЯМИ
// ==========================================

async function saveUserRole(uid, button) {

    if (currentProfile.role !== "superadmin") {

showMessage(
            "Только главный администратор может назначать администраторов.",
            true
        );

return;
    }

    const card = button.closest("[data-user-card]");

    const newRole = card.querySelector("[data-role-select]").value;

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

    } catch (error) {

        console.error("Ошибка изменения роли:", error);

showMessage(
            "Не удалось изменить роль: " + error.message,
            true
        );

        button.disabled = false;

    }

}

// ==========================================
// ОБРАБОТКА КНОПОК
// ==========================================

document.addEventListener("click", async event => {

    const button = event.target.closest("[data-action]");

    if (!button) return;

    if (button.disabled) return;

const action = button.dataset.action;
    const uid = button.dataset.uid;

    if (!uid) return;

if (action === "approve-registration") {
        await approveRegistration(uid, button);
    }

else if (action === "reject-registration") {
        await rejectRegistration(uid, button);
    }

else if (action === "approve-rank") {
        await approveRankRequest(uid, button);
    }

else if (action === "reject-rank") {
        await rejectRankRequest(uid, button);
    }

else if (action === "save-rank") {
        await saveUserRank(uid, button);
    }

else if (action === "save-role") {
        await saveUserRole(uid, button);
    }

});

// ==========================================
// ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР УРОВНЯ
// ==========================================

document.addEventListener("change", event => {

    if (!event.target.matches("[data-rank-select]")) return;

    const card = event.target.closest("[data-user-card]");

    const preview = card.querySelector("[data-level-preview]");

    const rank = event.target.value;

preview.textContent = rank
        ? getRankDescription(rank)
        : "Выберите звание для определения уровня.";

const approveButton = card.querySelector(
        '[data-action="approve-registration"]'
    );

if (approveButton) {
        approveButton.disabled = !Number.isInteger(getLevelByRank(rank));
    }

});

// ==========================================
// ПОИСК ПОЛЬЗОВАТЕЛЕЙ
// ==========================================

usersSearch.addEventListener("input", renderUsers);

// ==========================================
// ПРОВЕРКА ПРАВ И ЗАПУСК ПОДПИСОК
// ==========================================

auth.onAuthStateChanged(async user => {

    currentUser = user;

    if (!user) {

        window.location.href = "../login/login.html";

return;
    }

    try {

const snapshot = await db
            .collection("users")
            .doc(user.uid)
            .get();

        if (!snapshot.exists) {

            await auth.signOut();

            window.location.href = "../login/login.html";

return;
        }

        currentProfile = snapshot.data();

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

            adminIdentity.textContent = "Доступ запрещён";

setTimeout(() => {
                window.location.href = "../dashboard/index.html";
            }, 1500);

return;
        }

const number =
            currentProfile.soldierNumber ||
            user.email.split("@")[0];

const roleLabel =
            currentProfile.role === "superadmin"
                ? "Главный администратор"
                : "Администратор";

adminIdentity.textContent =
Боец № $DIL0 | $DIL1;

        startRealtimeListeners();

    } catch (error) {

        console.error("Ошибка проверки доступа:", error);

showMessage(
            "Не удалось проверить административные права: " + error.message,
            true
        );

        await auth.signOut();

        window.location.href = "../login/login.html";

    }

});

// ==========================================
// ВЫХОД И ОТКЛЮЧЕНИЕ ПОДПИСОК
// ==========================================

document.getElementById("logoutBtn").addEventListener("click", async () => {

if (unsubscribePending) unsubscribePending();
    if (unsubscribeRankRequests) unsubscribeRankRequests();
    if (unsubscribeUsers) unsubscribeUsers();

    try {

        await auth.signOut();

        window.location.href = "../login/login.html";

    } catch (error) {

        console.error("Ошибка выхода:", error);

        alert("Не удалось выйти из аккаунта.");

    }

});
