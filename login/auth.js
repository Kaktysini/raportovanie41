
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

let isLoginMode = true;
let isSubmitting = false;

const authForm = document.getElementById("authForm");
const soldierNumberInput = document.getElementById("soldierNumber");
const passwordInput = document.getElementById("password");

const authTitle = document.getElementById("authTitle");
const authBtn = document.getElementById("authBtn");
const toggleAuthBtn = document.getElementById("toggleAuthBtn");
const statusDiv = document.getElementById("authStatus");


// ======================================================
// ОТОБРАЖЕНИЕ СООБЩЕНИЙ
// ======================================================

function setStatus(message, type = "") {
    statusDiv.textContent = message;
    statusDiv.className = "form-status";

    if (type) {
        statusDiv.classList.add(type);
    }
}


// ======================================================
// ПЕРЕКЛЮЧЕНИЕ ВХОДА И РЕГИСТРАЦИИ
// ======================================================

toggleAuthBtn.addEventListener("click", () => {
    if (isSubmitting) return;

    isLoginMode = !isLoginMode;

    authTitle.textContent = isLoginMode
        ? "ВХОД В СИСТЕМУ"
        : "РЕГИСТРАЦИЯ";

    authBtn.textContent = isLoginMode
        ? "ВОЙТИ"
        : "ЗАРЕГИСТРИРОВАТЬСЯ";

    toggleAuthBtn.textContent = isLoginMode
        ? "У меня нет аккаунта"
        : "Уже есть аккаунт";

    setStatus("");
});


// ======================================================
// СОЗДАНИЕ ПРОФИЛЯ НОВОГО ПОЛЬЗОВАТЕЛЯ
// ======================================================

function createPendingProfile(soldierNumber) {
    return {
        soldierNumber: soldierNumber,

        // Аккаунт ожидает одобрения администрации.
        status: "pending",

        // Обычный пользователь.
        // Административные права самостоятельно получить нельзя.
        role: "user",

        // Звание и уровень назначаются администрацией.
        rank: null,
        accessLevel: null,

        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
}


// ======================================================
// ОБРАБОТКА ФОРМЫ
// ======================================================

authForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    const number = soldierNumberInput.value.trim();
    const password = passwordInput.value;

    if (!number || !password) {
        setStatus("Заполните все обязательные поля.", "error");
        return;
    }

    if (!/^\d+$/.test(number)) {
        setStatus("Номер бойца должен содержать только цифры.", "error");
        return;
    }

    const fakeEmail = `${number}@erk41.local`;

    isSubmitting = true;
    authBtn.disabled = true;
    toggleAuthBtn.disabled = true;

    setStatus("Обработка...");

    try {

        // ==================================================
        // ВХОД В СУЩЕСТВУЮЩИЙ АККАУНТ
        // ==================================================

        if (isLoginMode) {

            const credential = await auth.signInWithEmailAndPassword(
                fakeEmail,
                password
            );

            const user = credential.user;

            const userRef = db.collection("users").doc(user.uid);
            const userSnapshot = await userRef.get();

            // Старые аккаунты, у которых ещё нет профиля,
            // получают профиль с ожиданием одобрения.
            if (!userSnapshot.exists) {

                await userRef.set(createPendingProfile(number));

                await auth.signOut();

                setStatus(
                    "Ваш аккаунт найден. Создан профиль, который ожидает одобрения администрации.",
                    "success"
                );

                return;
            }

            const profile = userSnapshot.data();

            // Дополнительная проверка номера бойца.
            if (
                profile.soldierNumber &&
                profile.soldierNumber !== number
            ) {
                await auth.signOut();

                setStatus(
                    "Номер бойца не совпадает с данными профиля. Обратитесь к администрации.",
                    "error"
                );

                return;
            }

            // Проверка одобрения администрации.
            if (profile.status !== "approved") {

                await auth.signOut();

                if (profile.status === "rejected") {
                    setStatus(
                        "Ваша заявка на регистрацию отклонена. Обратитесь к администрации.",
                        "error"
                    );
                } else {
                    setStatus(
                        "Ваш аккаунт ожидает одобрения администрации. Доступ пока закрыт.",
                        "success"
                    );
                }

                return;
            }

            // Пользователь одобрен.
            window.location.href = "../dashboard/index.html";

        }

        // ==================================================
        // РЕГИСТРАЦИЯ НОВОГО ПОЛЬЗОВАТЕЛЯ
        // ==================================================

        else {

            const credential = await auth.createUserWithEmailAndPassword(
                fakeEmail,
                password
            );

            const user = credential.user;

            try {

                await db.collection("users")
                    .doc(user.uid)
                    .set(createPendingProfile(number));

            } catch (profileError) {

                // Если профиль не создался, закрываем сессию.
                // Сам аккаунт Firebase остаётся, и его можно
                // восстановить через следующий вход.
                await auth.signOut();

                throw profileError;
            }

            await auth.signOut();

            setStatus(
                "Регистрация прошла успешно! Ваша заявка отправлена администрации. Ожидайте одобрения.",
                "success"
            );

            authForm.reset();
        }

    } catch (error) {

        console.error("Ошибка авторизации:", error);

        // При ошибке работы с профилем не оставляем
        // пользователя в авторизованной сессии.
        if (auth.currentUser) {
            try {
                await auth.signOut();
            } catch (signOutError) {
                console.error("Ошибка выхода:", signOutError);
            }
        }

        if (
            error.code === "auth/invalid-login-credentials" ||
            error.code === "auth/invalid-credential"
        ) {
            setStatus(
                "Неверный номер бойца или пароль.",
                "error"
            );
        }

        else if (error.code === "auth/user-not-found") {
            setStatus(
                "Пользователь с таким номером не найден.",
                "error"
            );
        }

        else if (error.code === "auth/wrong-password") {
            setStatus(
                "Неверный пароль.",
                "error"
            );
        }

        else if (error.code === "auth/email-already-in-use") {
            setStatus(
                "Этот номер бойца уже зарегистрирован.",
                "error"
            );
        }

        else if (error.code === "auth/weak-password") {
            setStatus(
                "Пароль должен содержать минимум 6 символов.",
                "error"
            );
        }

        else if (error.code === "permission-denied") {
            setStatus(
                "Нет разрешения на создание или чтение профиля. Проверьте правила Firestore.",
                "error"
            );
        }

        else {
            setStatus(
                "Ошибка: " + error.message,
                "error"
            );
        }

    } finally {

        isSubmitting = false;
        authBtn.disabled = false;
        toggleAuthBtn.disabled = false;

    }
});
