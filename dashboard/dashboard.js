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

// Слушаем состояние авторизации
auth.onAuthStateChanged((user) => {
    if (user) {
        const soldierNumber = user.email.split('@')[0];
        document.getElementById('profileNumber').textContent = `Боец № ${soldierNumber}`;
    } else {
        setTimeout(() => {
            if (!auth.currentUser) window.location.href = '../login/login.html';
        }, 1000);
    }
});

// Управление модальным окном выбора формы
window.openFormModal = function() {
    document.getElementById('formModal').style.display = 'flex';
}

window.closeFormModal = function() {
    document.getElementById('formModal').style.display = 'none';
    // При закрытии окна прячем подменю обратно (чтобы в следующий раз оно было закрыто)
    document.getElementById('trainingSubMenu').style.display = 'none';
    document.getElementById('trainingArrow').style.transform = 'rotate(0deg)';
}

// Логика раскрытия/скрытия меню тренировок
window.toggleTrainingMenu = function() {
    const subMenu = document.getElementById('trainingSubMenu');
    const arrow = document.getElementById('trainingArrow');
    
    if (subMenu.style.display === 'none' || subMenu.style.display === '') {
        subMenu.style.display = 'flex'; // Показываем
        arrow.style.transform = 'rotate(180deg)'; // Крутим стрелочку вверх
    } else {
        subMenu.style.display = 'none'; // Скрываем
        arrow.style.transform = 'rotate(0deg)'; // Возвращаем стрелочку
    }
}

// Закрытие окна при клике вне его области (на темный фон)
document.getElementById('formModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeFormModal();
    }
});

// Кнопка выхода
document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = '../login/login.html';
    });
});
