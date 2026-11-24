
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
// ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ И ЕГО ПРОФИЛЯ
// ======================================================

auth.onAuthStateChanged(async (user) => {

    if (!user) {
        window.location.href = "../login/login.html";
        return;
    }

    try {

        const profileRef = db.collection("users").doc(user.uid);
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

        const soldierNumber =
            profile.soldierNumber ||
            user.email.split("@")[0];

        document.getElementById("profileNumber").textContent =
            `Боец № ${soldierNumber}`;

        // Административная карточка доступна
        // только администраторам.
        const adminPanelCard =
            document.getElementById("adminPanelCard");

        if (
            profile.role === "admin" ||
            profile.role === "superadmin"
        ) {
            adminPanelCard.style.display = "block";
        } else {
            adminPanelCard.style.display = "none";
        }

    } catch (error) {

        console.error("Ошибка проверки профиля:", error);

        alert(
            "Не удалось проверить профиль пользователя. Выполните повторный вход."
        );

        await auth.signOut();

        window.location.href = "../login/login.html";
    }
});


// ======================================================
// УПРАВЛЕНИЕ МОДАЛЬНЫМ ОКНОМ
// ======================================================

window.openFormModal = function() {
    document.getElementById("formModal").style.display = "flex";
};


window.closeFormModal = function() {

    document.getElementById("formModal").style.display = "none";

    document.getElementById("trainingSubMenu").style.display = "none";

    document.getElementById("trainingArrow").style.transform =
        "rotate(0deg)";
};


// ======================================================
// МЕНЮ ТРЕНИРОВОК
// ======================================================

window.toggleTrainingMenu = function() {

    const subMenu =
        document.getElementById("trainingSubMenu");

    const arrow =
        document.getElementById("trainingArrow");

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
// ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА ПО НАЖАТИЮ ВНЕ ЕГО
// ======================================================

document.getElementById("formModal").addEventListener("click", function(e) {

    if (e.target === this) {
        closeFormModal();
    }

});


// ======================================================
// ВЫХОД ИЗ АККАУНТА
// ======================================================

document.getElementById("logoutBtn").addEventListener("click", async () => {

    try {

        await auth.signOut();

        window.location.href = "../login/login.html";

    } catch (error) {

        console.error("Ошибка выхода:", error);

        alert("Не удалось выйти из аккаунта.");

    }

});
