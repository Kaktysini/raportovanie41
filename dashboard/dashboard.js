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
// СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЯ
// ======================================================

let currentUser = null;
let currentProfile = null;

let notificationsUnsubscribe = null;
let notificationsCache = [];


// ======================================================
// ЭЛЕМЕНТЫ СТРАНИЦЫ
// ======================================================

const profileNumberElement =
    document.getElementById("profileNumber");

const adminPanelCard =
    document.getElementById("adminPanelCard");

const createReportsCard =
    document.getElementById("createReportsCard");

const myReportsCard =
    document.getElementById("myReportsCard");

const callsignAccessWarning =
    document.getElementById("callsignAccessWarning");

const profileModal =
    document.getElementById("profileModal");

const formModal =
    document.getElementById("formModal");

const profileForm =
    document.getElementById("profileForm");

const callsignInput =
    document.getElementById("callsignInput");

const saveProfileBtn =
    document.getElementById("saveProfileBtn");

const profileSaveStatus =
    document.getElementById("profileSaveStatus");

const notificationsList =
    document.getElementById("notificationsList");

const notificationBadge =
    document.getElementById("notificationBadge");


// ======================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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


function getAccessLevelLabel(level) {

    if (level === null || level === undefined) {
        return "Не назначен";
    }

    if (level === 7) {
        return "КМД";
    }

    if (Number.isInteger(level)) {
        return `Уровень ${level}`;
    }

    return "Не указан";
}


function getRoleLabel(role) {

    const roles = {
        user: "Боец",
        admin: "Администратор",
        superadmin: "Главный администратор"
    };

    return roles[role] || "Не указана";
}


function hasCallsign() {

    return Boolean(
        currentProfile &&
        typeof currentProfile.callsign === "string" &&
        currentProfile.callsign.trim().length >= 2
    );
}


// ======================================================
// ОТОБРАЖЕНИЕ ДАННЫХ ПРОФИЛЯ
// ======================================================

function renderProfile() {

    if (!currentProfile || !currentUser) {
        return;
    }

    const soldierNumber =
        currentProfile.soldierNumber ||
        (
            currentUser.email
                ? currentUser.email.split("@")[0]
                : "Не указан"
        );

    const callsign =
        typeof currentProfile.callsign === "string"
            ? currentProfile.callsign.trim()
            : "";

    const rank =
        currentProfile.rank || "Не назначено";

    const accessLevel =
        getAccessLevelLabel(currentProfile.accessLevel);

    const role =
        getRoleLabel(currentProfile.role);


    // Информация в верхней части главного меню.

    if (profileNumberElement) {

        const identityParts = [
            String(soldierNumber)
        ];

        if (callsign) {
            identityParts.push(`Позывной: ${callsign}`);
        }

        profileNumberElement.textContent =
            identityParts.join(" | ");

    }


    // Информация в окне профиля.

    const profileSoldierNumber =
        document.getElementById("profileSoldierNumber");

    const profileRank =
        document.getElementById("profileRank");

    const profileAccessLevel =
        document.getElementById("profileAccessLevel");

    const profileRole =
        document.getElementById("profileRole");


    if (profileSoldierNumber) {
        profileSoldierNumber.textContent =
            String(soldierNumber);
    }

    if (profileRank) {
        profileRank.textContent = rank;
    }

    if (profileAccessLevel) {
        profileAccessLevel.textContent = accessLevel;
    }

    if (profileRole) {
        profileRole.textContent = role;
    }


    // Заполняем поле позывного текущим значением.

    if (callsignInput && document.activeElement !== callsignInput) {
        callsignInput.value = callsign;
    }


    // Если позывного нет, показываем предупреждение.

    updateReportAccess();
}


// ======================================================
// ПРОВЕРКА НАЛИЧИЯ ПОЗЫВНОГО
// ======================================================

function updateReportAccess() {

    const accessGranted = hasCallsign();

    if (callsignAccessWarning) {

        callsignAccessWarning.style.display =
            accessGranted ? "none" : "block";

    }

    if (createReportsCard) {

        createReportsCard.style.opacity =
            accessGranted ? "1" : "0.55";

        createReportsCard.setAttribute(
            "aria-disabled",
            accessGranted ? "false" : "true"
        );

    }

    if (myReportsCard) {

        myReportsCard.style.opacity =
            accessGranted ? "1" : "0.55";

        myReportsCard.setAttribute(
            "aria-disabled",
            accessGranted ? "false" : "true"
        );

    }
}


// ======================================================
// ОКНО ПРОФИЛЯ
// ======================================================

window.openProfileModal = function() {

    if (!profileModal) return;

    profileModal.style.display = "flex";

    if (currentProfile) {
        renderProfile();
    }

    renderNotifications();

};


window.closeProfileModal = function() {

    if (!profileModal) return;

    profileModal.style.display = "none";

};


// ======================================================
// СОХРАНЕНИЕ ПОЗЫВНОГО
// ======================================================

if (profileForm) {

    profileForm.addEventListener("submit", async event => {

        event.preventDefault();

        if (!currentUser || !currentProfile) {

            showProfileSaveStatus(
                "Не удалось определить пользователя. Перезайдите в аккаунт.",
                true
            );

            return;
        }

        const callsign =
            callsignInput.value.trim().replace(/\s+/g, " ");

        if (callsign.length < 2) {

            showProfileSaveStatus(
                "Позывной должен содержать не менее 2 символов.",
                true
            );

            callsignInput.focus();

            return;
        }

        if (callsign.length > 30) {

            showProfileSaveStatus(
                "Позывной не должен превышать 30 символов.",
                true
            );

            callsignInput.focus();

            return;
        }

        if (callsign === currentProfile.callsign) {

            showProfileSaveStatus(
                "Этот позывной уже сохранён.",
                false
            );

            return;
        }

        saveProfileBtn.disabled = true;

        showProfileSaveStatus(
            "Сохранение позывного...",
            false
        );

        try {

            await db.collection("users")
                .doc(currentUser.uid)
                .update({

                    callsign: callsign,

                    callsignUpdatedAt:
                        firebase.firestore.FieldValue.serverTimestamp(),

                    updatedAt:
                        firebase.firestore.FieldValue.serverTimestamp()

                });

            // Обновляем локальные данные профиля.

            currentProfile.callsign = callsign;

            renderProfile();

            showProfileSaveStatus(
                "Позывной успешно сохранён. Доступ к рапортам открыт.",
                false
            );

        } catch (error) {

            console.error(
                "Ошибка сохранения позывного:",
                error
            );

            showProfileSaveStatus(
                "Не удалось сохранить позывной. Возможно, необходимо обновить правила Firestore. Ошибка: " +
                error.message,
                true
            );

        } finally {

            saveProfileBtn.disabled = false;

        }

    });

}


function showProfileSaveStatus(message, isError) {

    if (!profileSaveStatus) return;

    profileSaveStatus.textContent = message;

    profileSaveStatus.style.color = isError
        ? "#ff7777"
        : "#9be7a0";

}


// ======================================================
// БЛОКИРОВКА ДОСТУПА К РАПОРТАМ БЕЗ ПОЗЫВНОГО
// ======================================================

window.openFormModal = function() {

    if (!hasCallsign()) {

        openProfileModal();

        showProfileSaveStatus(
            "Сначала заполните и сохраните позывной. До этого доступ к рапортам закрыт.",
            true
        );

        callsignInput.focus();

        return;
    }

    if (formModal) {
        formModal.style.display = "flex";
    }

};


// При попытке открыть раздел собственных рапортов
// без заполненного позывного перенаправление отменяется.

if (myReportsCard) {

    myReportsCard.addEventListener("click", event => {

        if (!hasCallsign()) {

            event.preventDefault();

            openProfileModal();

            showProfileSaveStatus(
                "Для просмотра и редактирования рапортов сначала заполните позывной.",
                true
            );

            callsignInput.focus();

        }

    });

}


// ======================================================
// УПРАВЛЕНИЕ МОДАЛЬНЫМ ОКНОМ ВЫБОРА ФОРМЫ
// ======================================================

window.closeFormModal = function() {

    if (formModal) {
        formModal.style.display = "none";
    }

    const trainingSubMenu =
        document.getElementById("trainingSubMenu");

    const trainingArrow =
        document.getElementById("trainingArrow");

    if (trainingSubMenu) {
        trainingSubMenu.style.display = "none";
    }

    if (trainingArrow) {
        trainingArrow.style.transform = "rotate(0deg)";
    }

};


// ======================================================
// МЕНЮ ТРЕНИРОВОК
// ======================================================

window.toggleTrainingMenu = function() {

    const subMenu =
        document.getElementById("trainingSubMenu");

    const arrow =
        document.getElementById("trainingArrow");

    if (!subMenu || !arrow) return;

    if (
        subMenu.style.display === "none" ||
        subMenu.style.display === ""
    ) {

        subMenu.style.display = "flex";

        arrow.style.transform = "rotate(180deg)";

    } else {

        subMenu.style.display = "none";

        arrow.style.transform = "rotate(0deg)";

    }

};


// ======================================================
// ЗАКРЫТИЕ МОДАЛЬНЫХ ОКОН ПО НАЖАТИЮ ВНЕ ИХ
// ======================================================

if (formModal) {

    formModal.addEventListener("click", event => {

        if (event.target === formModal) {
            closeFormModal();
        }

    });

}


if (profileModal) {

    profileModal.addEventListener("click", event => {

        if (event.target === profileModal) {
            closeProfileModal();
        }

    });

}


// ======================================================
// КАРТОЧКА ПРОФИЛЯ: ПОДДЕРЖКА КЛАВИАТУРЫ
// ======================================================

const profileCard =
    document.getElementById("profileCard");

if (profileCard) {

    profileCard.addEventListener("keydown", event => {

        if (event.key === "Enter" || event.key === " ") {

            event.preventDefault();

            openProfileModal();

        }

    });

}


// ======================================================
// УВЕДОМЛЕНИЯ
// ======================================================

// Получаем уведомления только текущего пользователя.
// Запрос сортируется на стороне браузера, чтобы не требовать
// дополнительный составной индекс Firestore.

function startNotificationsListener(uid) {

    stopNotificationsListener();

    notificationsUnsubscribe = db
        .collection("notifications")
        .where("recipientUid", "==", uid)
        .onSnapshot(snapshot => {

            notificationsCache = [];

            snapshot.forEach(doc => {

                notificationsCache.push({
                    id: doc.id,
                    ...doc.data()
                });

            });

            notificationsCache.sort((a, b) =>
                getTimestampMillis(b.createdAt) -
                getTimestampMillis(a.createdAt)
            );

            updateNotificationBadge();

            renderNotifications();

        }, error => {

            console.error(
                "Ошибка загрузки уведомлений:",
                error
            );

            if (notificationsList) {

                notificationsList.innerHTML = `
                    <div class="profile-empty">
                        Не удалось загрузить уведомления.
                    </div>
                `;

            }

        });

}


// ======================================================
// ОСТАНОВКА ПОДПИСКИ НА УВЕДОМЛЕНИЯ
// ======================================================

function stopNotificationsListener() {

    if (notificationsUnsubscribe) {

        notificationsUnsubscribe();

        notificationsUnsubscribe = null;

    }

    notificationsCache = [];

    updateNotificationBadge();

}


// ======================================================
// СЧЁТЧИК НЕПРОЧИТАННЫХ УВЕДОМЛЕНИЙ
// ======================================================

function updateNotificationBadge() {

    if (!notificationBadge) return;

    const unreadCount = notificationsCache.filter(
        notification => notification.read !== true
    ).length;

    notificationBadge.textContent = unreadCount;

    notificationBadge.hidden = unreadCount === 0;

}


// ======================================================
// ОТОБРАЖЕНИЕ УВЕДОМЛЕНИЙ
// ======================================================

function renderNotifications() {

    if (!notificationsList) return;

    if (notificationsCache.length === 0) {

        notificationsList.innerHTML = `
            <div class="profile-empty">
                У вас пока нет уведомлений.
            </div>
        `;

        return;
    }

    notificationsList.innerHTML = notificationsCache.map(notification => {

        const id = escapeHtml(notification.id);

        const title = escapeHtml(
            notification.title || "Уведомление"
        );

        const message = escapeHtml(
            notification.message || ""
        );

        const date = escapeHtml(
            formatDate(notification.createdAt)
        );

        const isRead = notification.read === true;

        return `
            <article class="profile-notification ${isRead ? "" : "unread"}">

                <div class="profile-notification-title">
                    ${title}
                </div>

                <div class="profile-notification-message">
                    ${message}
                </div>

                <span class="profile-notification-date">
                    ${date}
                </span>

                ${
                    isRead
                        ? `
                            <div class="profile-help">
                                Прочитано
                            </div>
                        `
                        : `
                            <div class="profile-notification-actions">

                                <button
                                    type="button"
                                    class="profile-notification-read"
                                    data-mark-notification-read="${id}"
                                >
                                    ОТМЕТИТЬ ПРОЧИТАННЫМ
                                </button>

                            </div>
                        `
                }

            </article>
        `;

    }).join("");

}


// ======================================================
// ОТМЕТКА УВЕДОМЛЕНИЯ ПРОЧИТАННЫМ
// ======================================================

if (notificationsList) {

    notificationsList.addEventListener("click", async event => {

        const button = event.target.closest(
            "[data-mark-notification-read]"
        );

        if (!button || !currentUser) return;

        const notificationId =
            button.dataset.markNotificationRead;

        if (!notificationId) return;

        button.disabled = true;

        try {

            await db.collection("notifications")
                .doc(notificationId)
                .update({

                    read: true,

                    readAt:
                        firebase.firestore.FieldValue.serverTimestamp()

                });

            // Список обновится автоматически через onSnapshot.

        } catch (error) {

            console.error(
                "Ошибка отметки уведомления:",
                error
            );

            button.disabled = false;

            alert(
                "Не удалось отметить уведомление прочитанным: " +
                error.message
            );

        }

    });

}


// ======================================================
// ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ И ЕГО ПРОФИЛЯ
// ======================================================

auth.onAuthStateChanged(async user => {

    currentUser = user;

    if (!user) {

        stopNotificationsListener();

        window.location.href = "../login/login.html";

        return;
    }

    try {

        const profileRef = db
            .collection("users")
            .doc(user.uid);

        const profileSnapshot = await profileRef.get();


        // Профиль должен существовать.

        if (!profileSnapshot.exists) {

            await auth.signOut();

            window.location.href = "../login/login.html";

            return;
        }


        const profile = profileSnapshot.data();


        // Без одобрения администрации доступ закрыт.

        if (profile.status !== "approved") {

            await auth.signOut();

            window.location.href = "../login/login.html";

            return;
        }


        currentProfile = profile;


        // Показываем данные профиля.

        renderProfile();


        // Административная карточка доступна
        // только администраторам.

        if (adminPanelCard) {

            if (
                profile.role === "admin" ||
                profile.role === "superadmin"
            ) {

                adminPanelCard.style.display = "block";

            } else {

                adminPanelCard.style.display = "none";

            }

        }


        // Подключаем уведомления текущего пользователя.

        startNotificationsListener(user.uid);


        // Если позывной отсутствует, сразу открываем профиль.

        if (!hasCallsign()) {

            openProfileModal();

            showProfileSaveStatus(
                "Для доступа к рапортам необходимо указать и сохранить позывной.",
                true
            );

        }

    } catch (error) {

        console.error(
            "Ошибка проверки профиля:",
            error
        );

        alert(
            "Не удалось проверить профиль пользователя. Выполните повторный вход."
        );

        stopNotificationsListener();

        await auth.signOut();

        window.location.href = "../login/login.html";

    }

});


// ======================================================
// ВЫХОД ИЗ АККАУНТА
// ======================================================

const logoutBtn =
    document.getElementById("logoutBtn");

if (logoutBtn) {

    logoutBtn.addEventListener("click", async () => {

        try {

            stopNotificationsListener();

            await auth.signOut();

            window.location.href = "../login/login.html";

        } catch (error) {

            console.error(
                "Ошибка выхода:",
                error
            );

            alert("Не удалось выйти из аккаунта.");

        }

    });

}
