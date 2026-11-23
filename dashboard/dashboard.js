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

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // 1. Показываем номер бойца
        const soldierNumber = user.email.split('@')[0];
        document.getElementById('profileNumber').textContent = `Боец № ${soldierNumber}`;

        // 2. Получаем профиль из Firestore, чтобы узнать уровень
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            
            // Если профиля нет (старый аккаунт), считаем что уровень 0
            let userLevel = 0;
            if (doc.exists) {
                userLevel = doc.data().level || 0;
            }
            
            document.getElementById('profileLevel').textContent = userLevel;

            // 3. Прячем формы, которые недоступны
            const allForms = document.querySelectorAll('#formsContainer > [data-require-level]');
            
            allForms.forEach(formElement => {
                const requiredLevel = parseInt(formElement.getAttribute('data-require-level'));
                
                // Если требуемый уровень больше, чем у бойца — скрываем элемент
                if (requiredLevel > userLevel) {
                    formElement.style.display = 'none';
                    
                    // Если это кнопка тренировок, прячем и подменю
                    if(formElement.getAttribute('onclick') === 'toggleTrainingMenu()') {
                        document.getElementById('trainingSubMenu').style.display = 'none';
                    }
                }
            });

        } catch (error) {
            console.error("Ошибка загрузки профиля:", error);
            document.getElementById('profileLevel').textContent = "Ошибка";
        }

    } else {
        setTimeout(() => {
            if (!auth.currentUser) window.location.href = '../login/login.html';
        }, 1000);
    }
});

// Управление модальным окном
window.openFormModal = function() {
    document.getElementById('formModal').style.display = 'flex';
}

window.closeFormModal = function() {
    document.getElementById('formModal').style.display = 'none';
    document.getElementById('trainingSubMenu').style.display = 'none';
    document.getElementById('trainingArrow').style.transform = 'rotate(0deg)';
}

// Логика раскрытия/скрытия меню тренировок
window.toggleTrainingMenu = function() {
    const subMenu = document.getElementById('trainingSubMenu');
    const arrow = document.getElementById('trainingArrow');
    
    if (subMenu.style.display === 'none' || subMenu.style.display === '') {
        subMenu.style.display = 'flex'; 
        arrow.style.transform = 'rotate(180deg)'; 
    } else {
        subMenu.style.display = 'none'; 
        arrow.style.transform = 'rotate(0deg)'; 
    }
}

document.getElementById('formModal').addEventListener('click', function(e) {
    if (e.target === this) closeFormModal();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut().then(() => window.location.href = '../login/login.html');
});
