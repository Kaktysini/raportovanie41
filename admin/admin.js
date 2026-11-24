
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
// СПРАВОЧНИК ЗВАНИЙ И УРОВНЕЙ
// 0–6 — обычные уровни, 7 — КМД.
// Административные роли задаются отдельно.
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
// СОСТОЯНИЕ ПАНЕЛИ
// ==========================================

let currentUser = null;
let currentProfile = null;

let allUsers = [];
let pendingUsers = [];


// ==========================================
// ЭЛЕМЕНТЫ СТРАНИЦЫ
// ==========================================

const adminIdentity =
    document.getElementById("adminIdentity");

const adminMessage =
    document.getElementById("adminMessage");

const pendingList =
    document.getElementById("pendingList");

const usersList =
    document.getElementById("usersList");

const pendingCount =
    document.getElementById("pendingCount");

const usersSearch =
    document.getElementById("usersSearch");


// ==========================================
// БЕЗОПАСНОЕ ОТОБРАЖЕНИЕ ТЕКСТА
// ==========================================

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
// ПРЕОБРАЗОВАНИЕ ЗВАНИЯ В УРОВЕНЬ
// ==========================================

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

    if (level === 7) {
        return `${rank} — КМД`;
    }

    return `${rank} — уровень ${level}`;
}


// ==========================================
// СПИСОК ЗВАНИЙ ДЛЯ SELECT
// ==========================================

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


// ==========================================
// ПРЕОБРАЗОВАНИЕ ДАТЫ
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

        if (tab === "pending") {
            document.getElementById("pendingPanel")
                .classList.add("active");
        }

        if (tab === "users") {
            document.getElementById("usersPanel")
                .classList.add("active");
        }

    });

});


// ==========================================
// ЗАГРУЗКА ЗАЯВОК НА РЕГИСТРАЦИЮ
// ==========================================

async function loadPendingApplications() {

    pendingList.innerHTML = `
        <div class="admin-empty">Загрузка заявок...</div>
    `;

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

    pendingCount.textContent = pendingUsers.length;

    renderPendingApplications();
}


// ==========================================
// ОТОБРАЖЕНИЕ ЗАЯВОК
// ==========================================

function renderPendingApplications() {

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
        const number = escapeHtml(user.soldierNumber || "Не указан");
        const createdAt = escapeHtml(formatDate(user.createdAt));

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
                        disabled
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


// ==========================================
// ОДОБРЕНИЕ ПОЛЬЗОВАТЕЛЯ
// ==========================================

async function approveUser(uid, button) {

    const card = button.closest("[data-user-card]");

    const rankSelect = card.querySelector("[data-rank-select]");

    const rank = rankSelect.value;

    if (!rank) {

        showMessage(
            "Перед одобрением необходимо назначить пользователю звание.",
            true
        );

        return;
    }

    const accessLevel = getLevelByRank(rank);

    if (!Number.isInteger(accessLevel)) {

        showMessage("Не удалось определить уровень звания.", true);

        return;
    }

    const number = card.querySelector("h3").textContent;

    const levelLabel = accessLevel === 7
        ? "КМД"
        : accessLevel;

    const confirmed = confirm(
        `Одобрить регистрацию ${number}?\n\nЗвание: ${rank}\nУровень: ${levelLabel}`
    );

    if (!confirmed) return;

    button.disabled = true;

    try {

        await db.collection("users").doc(uid).update({

            status: "approved",

            rank: rank,

            accessLevel: accessLevel,

            approvedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            approvedBy: currentUser.uid,

            updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        showMessage("Пользователь успешно одобрен.");

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


// ==========================================
// ОТКЛОНЕНИЕ РЕГИСТРАЦИИ
// ==========================================

async function rejectUser(uid, button) {

    const confirmed = confirm(
        "Вы действительно хотите отклонить эту регистрацию?"
    );

    if (!confirmed) return;

    button.disabled = true;

    try {

        await db.collection("users").doc(uid).update({

            status: "rejected",

            rejectedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

            rejectedBy: currentUser.uid,

            updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        showMessage("Заявка отклонена.");

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


// ==========================================
// ЗАГРУЗКА ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
// ==========================================

async function loadUsers() {

    usersList.innerHTML = `
        <div class="admin-empty">Загрузка пользователей...</div>
    `;

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


// ==========================================
// ОТОБРАЖЕНИЕ ПОЛЬЗОВАТЕЛЕЙ
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


        // ======================================
        // ПРАВА НА ИЗМЕНЕНИЕ ЗВАНИЯ
        // ======================================

        let rankControls = "";

        // Обычный администратор может менять звание
        // обычным пользователям.
        //
        // Главный администратор может менять звание
        // обычным пользователям и администраторам.
        //
        // Звание и роль не зависят друг от друга.
        // Собственное звание через карточку не меняется.

        const canEditRank =
            user.uid !== currentUser.uid &&
            (
                user.role === "user" ||
                (
                    currentProfile.role === "superadmin" &&
                    user.role === "admin"
                )
            );

        if (canEditRank) {

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


        // ======================================
        // УПРАВЛЕНИЕ АДМИНИСТРАТИВНЫМИ РОЛЯМИ
        // ======================================

        let roleControls = "";

        if (currentProfile.role === "superadmin") {

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


// ==========================================
// СОХРАНЕНИЕ НОВОГО ЗВАНИЯ
// ==========================================

async function saveUserRank(uid, button) {

    const card = button.closest("[data-user-card]");

    const rank = card.querySelector("[data-rank-select]").value;

    if (!rank) {

        showMessage("Выберите звание.", true);

        return;
    }

    const accessLevel = getLevelByRank(rank);

    if (!Number.isInteger(accessLevel)) {

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

        const levelLabel = accessLevel === 7
            ? "КМД"
            : accessLevel;

        showMessage(
            `Звание изменено: ${rank}. Уровень: ${levelLabel}.`
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


// ==========================================
// УПРАВЛЕНИЕ РОЛЯМИ — ТОЛЬКО SUPERADMIN
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


// ==========================================
// ОБРАБОТКА КНОПОК
// ==========================================

document.addEventListener("click", async (event) => {

    const button = event.target.closest("[data-action]");

    if (!button) return;

    const action = button.dataset.action;

    const uid = button.dataset.uid;

    if (!uid) return;

    if (action === "approve") {
        await approveUser(uid, button);
    }

    else if (action === "reject") {
        await rejectUser(uid, button);
    }

    else if (action === "save-rank") {
        await saveUserRank(uid, button);
    }

    else if (action === "save-role") {
        await saveUserRole(uid, button);
    }

});


// ==========================================
// ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР УРОВНЯ ЗВАНИЯ
// ==========================================

document.addEventListener("change", (event) => {

    if (!event.target.matches("[data-rank-select]")) return;

    const card = event.target.closest("[data-user-card]");

    const preview = card.querySelector("[data-level-preview]");

    const rank = event.target.value;

    if (!rank) {

        preview.textContent =
            "Выберите звание для определения уровня доступа.";

    } else {

        preview.textContent = getRankDescription(rank);

    }

    const approveButton = card.querySelector(
        '[data-action="approve"]'
    );

    if (approveButton) {
        approveButton.disabled = !rank;
    }

});


// ==========================================
// ПОИСК ПОЛЬЗОВАТЕЛЕЙ
// ==========================================

usersSearch.addEventListener("input", () => {
    renderUsers();
});


// ==========================================
// ОБЩАЯ ЗАГРУЗКА ДАННЫХ
// ==========================================

async function loadAllData() {

    showMessage("Обновление данных...");

    try {

        await Promise.all([
            loadPendingApplications(),
            loadUsers()
        ]);

        showMessage("Данные административной панели обновлены.");

    } catch (error) {

        console.error("Ошибка загрузки данных:", error);

        showMessage(
            "Не удалось загрузить данные: " + error.message,
            true
        );

    }
}


// ==========================================
// ПРОВЕРКА АДМИНИСТРАТИВНЫХ ПРАВ
// ==========================================

auth.onAuthStateChanged(async (user) => {

    currentUser = user;

    if (!user) {

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
            `Боец № ${number} | ${roleLabel}`;

        await loadAllData();

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


// ==========================================
// ВЫХОД ИЗ АККАУНТА
// ==========================================

document.getElementById("logoutBtn").addEventListener("click", async () => {

    try {

        await auth.signOut();

        window.location.href = "../login/login.html";

    } catch (error) {

        console.error("Ошибка выхода:", error);

        alert("Не удалось выйти из аккаунта.");

    }

});
