const socket = io();

const code = window.location.pathname
    .split('/')
    .pop()
    .toUpperCase();

const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const finished = document.getElementById('finished');
const headline = document.getElementById('headline');
let confettiPlayed = false;

/* ========================================
   JOIN AS HOST
======================================== */

socket.on('connect', () => {
    socket.emit('joinGame', {
        code,
        role: 'host'
    });
});

/* ========================================
   LOBBY
======================================== */

document.getElementById('game-code').textContent = code;
document.getElementById('qr-code').textContent = code;
document.getElementById('qr-image').src = `/api/qr/${code}`;

const joinUrl = `${window.location.origin}/play/${code}`;
document.getElementById('join-url').textContent = joinUrl;

/* ========================================
   HOST CONTROLS
======================================== */

document.getElementById('start').addEventListener('click', () => {
    socket.emit('start');
});

document.getElementById('reveal').addEventListener('click', () => {
    socket.emit('reveal');
});

document.getElementById('next').addEventListener('click', () => {
    socket.emit('next');
});

document.getElementById('reset').addEventListener('click', () => {
    socket.emit('reset');
});

/* ========================================
   LIVE GAME STATE
======================================== */

socket.on('gameState', state => {
    lobby.classList.toggle('hidden', state.status !== 'lobby');
    game.classList.toggle('hidden', state.status !== 'playing');
    finished.classList.toggle('hidden', state.status !== 'finished');

    if (state.status === 'lobby') {
        showLobby(state);
        return;
    }

    if (state.status === 'finished') {
        showFinalResults(state);
        launchConfetti();
        return;
    }

    showQuestion(state);
});

function showLobby(state) {
    headline.textContent = 'JOIN THE GAME';

    document.getElementById('lobby-status').textContent =
        `${state.playerCount} PLAYER${state.playerCount === 1 ? '' : 'S'} JOINED`;
}

function showQuestion(state) {
    headline.textContent = 'WOULD YOU RATHER?';

    document.getElementById('question-status').textContent =
        `QUESTION ${state.questionNumber} OF ${state.questionCount}`;

    document.getElementById('a-text').textContent = state.question.a;
    document.getElementById('b-text').textContent = state.question.b;

    document.getElementById('answer-status').textContent =
        `${state.total} ANSWER${state.total === 1 ? '' : 'S'} RECEIVED`;

    const aPercent = document.getElementById('a-percent');
    const bPercent = document.getElementById('b-percent');
    const aFill = document.getElementById('a-fill');
    const bFill = document.getElementById('b-fill');

    if (state.revealed) {
        aPercent.textContent = `${state.aPct}%`;
        bPercent.textContent = `${state.bPct}%`;
        aFill.style.width = `${state.aPct}%`;
        bFill.style.width = `${state.bPct}%`;
        return;
    }

    aPercent.textContent = '';
    bPercent.textContent = '';
    aFill.style.width = '0%';
    bFill.style.width = '0%';
}

function showFinalResults(state) {
    headline.textContent = 'HOW ALIKE WERE WE?';

    const summary = state.groupSummary;

    if (!summary) {
        return;
    }

    document.getElementById('agreed-choice').textContent =
        summary.mostAgreed.winningChoice;

    document.getElementById('agreed-percent').textContent =
        `${summary.mostAgreed.highPercent}% chose it`;

    document.getElementById('least-options').textContent =
        `${summary.leastAgreed.a} ${summary.leastAgreed.aPct}%  /  ${summary.leastAgreed.b} ${summary.leastAgreed.bPct}%`;

    document.getElementById('overall-alike').textContent =
        `${summary.overallAlikePercent}%`;

    document.getElementById('alike-statement').textContent =
        getAlikeStatement(summary.overallAlikePercent);
}

function getAlikeStatement(percent) {
    const low = [
        'You would not survive a crisis together.',
        'Try not to get stuck in an elevator with these people.',
        "Look to your left. Look to your right. These people don't think like you.",
        'It is important to accept our differences — and maybe celebrate them too.',
        'Picking a group restaurant is going to take a while.',
        'Your group chat probably has at least three separate arguments happening right now.',
        'Team-building exercise recommended. Possibly several.',
        'You agree on one thing: you definitely do not agree.'
    ];

    const middle = [
        'Some of you should start dating, but it may end in divorce.',
        'It is a cup-half-empty / cup-half-full kind of crowd.',
        'There are two types of people in this world. You are them!',
        'Different enough to be interesting. Alike enough to share a table.',
        'You could road-trip together, but somebody is definitely controlling the playlist.',
        'A healthy mix of agreement, disagreement, and questionable opinions.',
        'You would make a great committee — which may or may not be a compliment.',
        'You agree just enough to keep things interesting.'
    ];

    const high = [
        'Extroverts and introverts together, living in harmony.',
        'Everyone here is so alike, someone should kiss.',
        "Great job! Let's all go get pizza. I am buying.",
        'So alike, so smart, so handsome. We should start a podcast together.',
        'At this point, you may all be sharing one brain.',
        'Group vacation approved. Choosing the itinerary should be easy.',
        'You found your people. This is getting suspicious.',
        'Same wavelength. Same vibe. Probably the same pizza toppings.'
    ];

    const statements = percent < 33
        ? low
        : percent < 66
            ? middle
            : high;

    const index = Math.abs(code.split('').reduce(
        (sum, character) => sum + character.charCodeAt(0),
        percent
    )) % statements.length;

    return statements[index];
}

/* ========================================
   FINAL SCREEN CONFETTI
======================================== */

function launchConfetti() {
    if (confettiPlayed) {
        return;
    }

    confettiPlayed = true;

    const canvas = document.getElementById('confetti-canvas');
    const context = canvas.getContext('2d');
    const pieces = [];
    const colors = ['#ffffff', '#ffcc00', '#ff4d6d', '#4dabf7', '#51cf66'];

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    resizeCanvas();

    for (let i = 0; i < 180; i += 1) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * canvas.height * 0.5,
            width: 6 + Math.random() * 8,
            height: 8 + Math.random() * 12,
            speed: 2 + Math.random() * 5,
            drift: -2 + Math.random() * 4,
            rotation: Math.random() * Math.PI,
            rotationSpeed: -0.15 + Math.random() * 0.3,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }

    const start = performance.now();

    function draw(now) {
        context.clearRect(0, 0, canvas.width, canvas.height);

        pieces.forEach(piece => {
            piece.x += piece.drift;
            piece.y += piece.speed;
            piece.rotation += piece.rotationSpeed;

            context.save();
            context.translate(piece.x, piece.y);
            context.rotate(piece.rotation);
            context.fillStyle = piece.color;
            context.fillRect(
                -piece.width / 2,
                -piece.height / 2,
                piece.width,
                piece.height
            );
            context.restore();
        });

        if (now - start < 6000) {
            requestAnimationFrame(draw);
        } else {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    window.addEventListener('resize', resizeCanvas, { once: true });
    requestAnimationFrame(draw);
}

/* ========================================
   ERRORS
======================================== */

socket.on('gameError', error => {
    headline.textContent = error;
});
