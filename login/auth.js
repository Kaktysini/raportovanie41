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
const db = firebase.firestore(); // ВАЖНО: добавили базу данных для создания профиля

let isLoginMode = true; 

document.getElementById('toggleAuthBtn').addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').textContent = isLoginMode ? "ВХОД В СИСТЕМУ" : "РЕГИСТРАЦИЯ";
    document.getElementById('authBtn').textContent = isLoginMode ? "ВОЙТИ" : "ЗАРЕГИСТРИРОВАТЬСЯ";
    document.getElementById('toggleAuthBtn').textContent = isLoginMode ? "У меня нет аккаунта" : "Уже есть аккаунт";
    document.getElementById('authStatus').textContent = "";
    document.getElementById('authStatus').className = "form-status";
});

document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const number = document.getElementById('soldierNumber').value.trim();
    const password = document.getElementById('password').value;
    const statusDiv = document.getElementById('authStatus');
    
    const fakeEmail = `${number}@erk41.local`;

    statusDiv.textContent = 'Обработка...';
    statusDiv.className = 'form-status';

    try {
        if (isLoginMode) {
            // ВХОД
            await auth.signInWithEmailAndPassword(fakeEmail, password);
        } else {
            // РЕГИСТРАЦИЯ
            const userCredential = await auth.createUserWithEmailAndPassword(fakeEmail, password);
            const user = userCredential.user;
            
            // Создаем запись в базе данных users с начальным уровнем 0
            await db.collection('users').doc(user.uid).set({
                soldierNumber: number,
                level: 0, 
                rank: "Рядовой-рекрут", 
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        window.location.href = '../dashboard/index.html';

    } catch (error) {
        // ОБРАБОТКА ОШИБОК
        if (error.code === 'auth/invalid-login-credentials' || error.code === 'auth/invalid-credential') {
            statusDiv.textContent = 'Данного пользователя нет в базе данных (или введен неверный пароль).';
        } 
        else if (error.code === 'auth/user-not-found') {
            statusDiv.textContent = 'Данного пользователя нет в базе данных.';
        } 
        else if (error.code === 'auth/wrong-password') {
            statusDiv.textContent = 'Неверный пароль.';
        } 
        else if (error.code === 'auth/email-already-in-use') {
            statusDiv.textContent = 'Этот номер уже зарегистрирован.';
        } 
        else if (error.code === 'auth/weak-password') {
            statusDiv.textContent = 'Пароль должен быть минимум 6 символов.';
        } 
        else {
            statusDiv.textContent = 'Ошибка: ' + error.message;
        }
        
        statusDiv.classList.add('error');
    }
});
