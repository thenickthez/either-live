const socket = io();

const code = window.location.pathname
    .split('/')
    .pop()
    .toUpperCase();

let playerId = localStorage.getItem('eitherPlayerId');

if (!playerId) {
    playerId =
        'player-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substring(2, 10);

    localStorage.setItem('eitherPlayerId', playerId);
}

let lastQuestion = 0;
let voted = false;

const playerHeadline = document.getElementById('player-headline');
const playerGame = document.getElementById('player-game');
const progress = document.getElementById('progress');
const message = document.getElementById('message');
const buttonA = document.getElementById('a');
const buttonB = document.getElementById('b');
const personalResults = document.getElementById('personal-results');
const personalResultsList = document.getElementById('personal-results-list');
const overallPercent = document.getElementById('overall-percent');
const overallCopy = document.getElementById('overall-copy');

/* ========================================
   JOIN GAME
======================================== */

socket.on('connect', () => {
    socket.emit('joinGame', {
        code,
        playerId,
        role: 'player'
    });
});

/* ========================================
   GAME STATE
======================================== */

socket.on('gameState', state => {
    if (state.status === 'lobby') {
        showLobby(state);
        return;
    }

    if (state.status === 'finished') {
        progress.textContent = 'CALCULATING YOUR RESULTS...';
        message.textContent = 'One moment.';
        buttonA.disabled = true;
        buttonB.disabled = true;
        return;
    }

    if (!state.question) {
        return;
    }

    showQuestion(state);
});

function showLobby(state) {
    playerHeadline.textContent = 'YOU’RE IN!';
    progress.textContent = `GAME ${state.code}`;
    message.textContent = 'Look at the big screen.';

    buttonA.textContent = 'Waiting for host';
    buttonB.textContent = 'Game starts soon';

    buttonA.disabled = true;
    buttonB.disabled = true;
}

function showQuestion(state) {
    playerHeadline.textContent = 'WOULD YOU RATHER?';

    if (state.questionNumber !== lastQuestion) {
        lastQuestion = state.questionNumber;
        voted = false;

        buttonA.disabled = false;
        buttonB.disabled = false;

        message.textContent = 'Choose one.';
    }

    progress.textContent =
        `QUESTION ${state.questionNumber} OF ${state.questionCount}`;

    buttonA.textContent = state.question.a;
    buttonB.textContent = state.question.b;
}

/* ========================================
   VOTING
======================================== */

function vote(choice) {
    if (voted) {
        return;
    }

    voted = true;
    socket.emit('vote', choice);

    buttonA.disabled = true;
    buttonB.disabled = true;

    message.textContent =
        '✓ Answer submitted. Look at the big screen!';
}

buttonA.addEventListener('click', () => {
    vote('a');
});

buttonB.addEventListener('click', () => {
    vote('b');
});

/* ========================================
   PERSONAL END-OF-GAME RESULTS
======================================== */

socket.on('personalResults', data => {
    playerGame.classList.add('hidden');
    personalResults.classList.remove('hidden');
    playerHeadline.textContent = 'YOUR RESULTS';

    personalResultsList.innerHTML = '';

    data.results.forEach(result => {
        const card = document.createElement('article');
        card.className = 'personal-result-card';

        const question = document.createElement('div');
        question.className = 'personal-question-number';
        question.textContent = `QUESTION ${result.questionNumber}`;

        const choice = document.createElement('h2');
        choice.textContent = result.choice;

        const comparison = document.createElement('p');
        comparison.textContent =
            `${result.samePercent}% also chose ${result.choice}`;

        card.appendChild(question);
        card.appendChild(choice);
        card.appendChild(comparison);

        personalResultsList.appendChild(card);
    });

    overallPercent.textContent = `${data.overallPercent}%`;
    overallCopy.textContent =
        `On average, ${data.overallPercent}% of players made the same choices as you.`;
});

/* ========================================
   ERRORS
======================================== */

socket.on('gameError', error => {
    message.textContent = error;
});
