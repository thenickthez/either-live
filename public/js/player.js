const socket = io();

const code = window.location.pathname
    .split("/")
    .pop()
    .toUpperCase();

let playerId = localStorage.getItem("eitherPlayerId");

if (!playerId) {

    playerId =
        "player-" +
        Date.now() +
        "-" +
        Math.random().toString(36).substring(2, 10);

    localStorage.setItem("eitherPlayerId", playerId);

}

let lastQuestion = 0;
let voted = false;


// Elements
const buttonA = document.getElementById("a");
const buttonB = document.getElementById("b");
const message = document.getElementById("message");
const progress = document.getElementById("progress");


// Join game
socket.on("connect", function () {

    console.log("Connected to server.");

    socket.emit("joinGame", {
        code: code,
        playerId: playerId,
        role: "player"
    });

});


// Receive current game state
socket.on("gameState", function (state) {

    console.log("Game state received:", state);

    if (!state.question) {
        message.textContent = "Waiting for question...";
        return;
    }

    // New question
    if (state.questionNumber !== lastQuestion) {

        lastQuestion = state.questionNumber;
        voted = false;

        buttonA.disabled = false;
        buttonB.disabled = false;

        message.textContent = "Choose one.";

    }

    progress.textContent =
        "QUESTION " +
        state.questionNumber +
        " OF " +
        state.questionCount;

    buttonA.textContent = state.question.a;
    buttonB.textContent = state.question.b;

});


// Vote
function vote(choice) {

    if (voted) {
        return;
    }

    voted = true;

    console.log("Voting:", choice);

    socket.emit("vote", choice);

    buttonA.disabled = true;
    buttonB.disabled = true;

    message.textContent =
        "✓ Answer submitted. Look at the big screen!";

}


buttonA.addEventListener("click", function () {
    vote("a");
});

buttonB.addEventListener("click", function () {
    vote("b");
});


// Errors
socket.on("gameError", function (error) {

    console.error(error);

    message.textContent = error;

});