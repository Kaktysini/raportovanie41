(function () {

    'use strict';


    // ==================================================
    // НАСТРОЙКИ
    // ==================================================

    const PROJECT_ROOT = '/raportovanie41/';

    const SWITCH_DURATION = 520;

    const ARRIVAL_DURATION = 450;

    const NOISE_INTERVAL = 35;

    const REDUCED_MOTION = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;


    // ==================================================
    // СОЗДАНИЕ ТЕЛЕВИЗИОННОГО ЭКРАНА
    // ==================================================

    let overlay = null;
    let canvas = null;
    let context = null;

    let noiseAnimation = null;
    let noiseRunning = false;
    let lastNoiseFrame = 0;

    let isNavigating = false;


    function createOverlay() {

        if (overlay) return;


        overlay = document.createElement('div');

        overlay.className = 'tv-transition-layer';

        overlay.setAttribute('aria-hidden', 'true');


        canvas = document.createElement('canvas');

        canvas.className = 'tv-transition-noise';


        const scanlines =
            document.createElement('div');

        scanlines.className =
            'tv-transition-scanlines';


        const vignette =
            document.createElement('div');

        vignette.className =
            'tv-transition-vignette';


        const roll =
            document.createElement('div');

        roll.className =
            'tv-transition-roll';


        overlay.appendChild(canvas);

        overlay.appendChild(scanlines);

        overlay.appendChild(vignette);

        overlay.appendChild(roll);


        document.body.appendChild(overlay);


        context = canvas.getContext('2d', {
            alpha: true
        });


        resizeCanvas();

    }


    // ==================================================
    // РАЗМЕР ХОЛСТА
    // ==================================================

    function resizeCanvas() {

        if (!canvas || !context) return;

        // Низкое разрешение создаёт характерную
        // пиксельную рябь аналогового телевизора.

        canvas.width = Math.max(
            1,
            Math.floor(window.innerWidth / 4)
        );

        canvas.height = Math.max(
            1,
            Math.floor(window.innerHeight / 4)
        );

        context.imageSmoothingEnabled = false;

    }


    // ==================================================
    // ГЕНЕРАЦИЯ ТЕЛЕВИЗИОННОГО ШУМА
    // ==================================================

    function drawNoise(timestamp) {

        if (!noiseRunning) return;

        if (
            timestamp - lastNoiseFrame >= NOISE_INTERVAL
        ) {

            lastNoiseFrame = timestamp;

            const width = canvas.width;

            const height = canvas.height;

            const imageData =
                context.createImageData(width, height);

            const pixels = imageData.data;


            for (
                let i = 0;
                i < pixels.length;
                i += 4
            ) {

                const value =
                    Math.floor(Math.random() * 256);

                pixels[i] = value;

                pixels[i + 1] = value;

                pixels[i + 2] = value;

                pixels[i + 3] =
                    Math.floor(80 + Math.random() * 175);

            }


            // Случайные светлые и тёмные горизонтальные
            // полосы, имитирующие помехи сигнала.

            if (Math.random() > 0.55) {

                const y = Math.floor(
                    Math.random() * height
                );

                const rowStart = y * width * 4;

                const rowEnd = Math.min(
                    rowStart + width * 4,
                    pixels.length
                );

                const brightness =
                    Math.random() > 0.5 ? 255 : 15;


                for (
                    let i = rowStart;
                    i < rowEnd;
                    i += 4
                ) {

                    pixels[i] = brightness;

                    pixels[i + 1] = brightness;

                    pixels[i + 2] = brightness;

                    pixels[i + 3] = 220;

                }

            }


            context.putImageData(imageData, 0, 0);

        }


        noiseAnimation =
            requestAnimationFrame(drawNoise);

    }


    function startNoise() {

        if (noiseRunning) return;

        noiseRunning = true;

        lastNoiseFrame = 0;

        noiseAnimation =
            requestAnimationFrame(drawNoise);

    }


    function stopNoise() {

        noiseRunning = false;

        if (noiseAnimation !== null) {

            cancelAnimationFrame(noiseAnimation);

            noiseAnimation = null;

        }

    }


    // ==================================================
    // ВКЛЮЧЕНИЕ ЭФФЕКТА ПОЯВЛЕНИЯ СТРАНИЦЫ
    // ==================================================

    function playArrival() {

        if (REDUCED_MOTION) return;

        createOverlay();

        resizeCanvas();

        overlay.className =
            'tv-transition-layer is-active is-entering';

        startNoise();


        window.setTimeout(() => {

            overlay.className =
                'tv-transition-layer';

            stopNoise();

        }, ARRIVAL_DURATION);

    }


    // ==================================================
    // ПЕРЕКЛЮЧЕНИЕ КАНАЛА И ПЕРЕХОД
    // ==================================================

    function navigate(url) {

        if (isNavigating) return;

        if (REDUCED_MOTION) {

            window.location.assign(url);

            return;

        }


        isNavigating = true;

        createOverlay();

        resizeCanvas();


        overlay.className =
            'tv-transition-layer is-active is-switching';


        startNoise();


        // Небольшая задержка позволяет увидеть
        // помехи перед загрузкой следующей страницы.

        window.setTimeout(() => {

            window.location.assign(url);

        }, SWITCH_DURATION);

    }


    // ==================================================
    // ПРОВЕРКА ВНУТРЕННЕЙ ССЫЛКИ
    // ==================================================

    function isProjectLink(url) {

        if (url.origin !== window.location.origin) {
            return false;
        }


        const isInsideProject =
            url.pathname === PROJECT_ROOT.slice(0, -1) ||
            url.pathname.startsWith(PROJECT_ROOT);


        return isInsideProject;

    }


    // ==================================================
    // ПЕРЕХВАТ ПЕРЕХОДОВ ПО ССЫЛКАМ
    // ==================================================

    document.addEventListener('click', event => {

        if (REDUCED_MOTION) return;

        if (event.defaultPrevented) return;


        // Игнорируем клики вспомогательными кнопками мыши.

        if (event.button !== 0) return;


        // Не мешаем открытию новой вкладки.

        if (
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.metaKey
        ) {

            return;

        }


        const target = event.target;

        if (!target || typeof target.closest !== 'function') {
            return;
        }


        const link = target.closest('a[href]');

        if (!link) return;


        // Ссылки с этим классом можно исключить
        // из телевизионного перехода.

        if (link.classList.contains('no-tv-transition')) {
            return;
        }


        // Не перехватываем ссылки для скачивания.

        if (link.hasAttribute('download')) {
            return;
        }


        // Не перехватываем ссылки в новых окнах.

        if (
            link.target &&
            link.target !== '_self'
        ) {

            return;

        }


        const rawHref =
            link.getAttribute('href');


        if (
            !rawHref ||
            rawHref.startsWith('#') ||
            rawHref.startsWith('mailto:') ||
            rawHref.startsWith('tel:') ||
            rawHref.startsWith('javascript:')
        ) {

            return;

        }


        let url;

        try {

            url = new URL(
                link.href,
                window.location.href
            );

        } catch (error) {

            return;

        }


        if (!isProjectLink(url)) {
            return;
        }


        // Обычные переходы внутри той же страницы
        // не должны вызывать помехи.

        if (
            url.pathname === window.location.pathname &&
            url.search === window.location.search
        ) {

            return;

        }


        event.preventDefault();

        navigate(url.href);

    });


    // ==================================================
    // ПОДДЕРЖКА ПЕРЕХОДОВ НАЗАД И ВПЕРЁД
    // ==================================================

    window.addEventListener('pageshow', event => {

        // При возврате страницы из BFCache
        // снова показываем короткий телевизионный эффект.

        if (event.persisted) {
            playArrival();
        }

    });


    // ==================================================
    // АДАПТАЦИЯ К РАЗМЕРУ ЭКРАНА
    // ==================================================

    window.addEventListener('resize', () => {

        if (overlay) {
            resizeCanvas();
        }

    });


    // ==================================================
    // ПУБЛИЧНЫЙ МЕТОД ДЛЯ ПЕРЕХОДОВ ИЗ JAVASCRIPT
    // ==================================================

    window.TVTransition = {

        navigate: navigate,

        play: playArrival

    };


    // ==================================================
    // ЗАПУСК
    // ==================================================

    if (document.readyState === 'loading') {

        document.addEventListener(
            'DOMContentLoaded',
            playArrival,
            { once: true }
        );

    } else {

        playArrival();

    }

})();
