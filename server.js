const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const GAME_CODE = 'DEMO';

const questions = [
  { a: 'Live in the mountains', b: 'Live at the beach' },
  { a: 'Give up coffee', b: 'Give up desserts' },
  { a: 'Travel to the past', b: 'Travel to the future' }
];

const game = { index: 0, revealed: false, votes: new Map() };

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req,res) => res.redirect(`/host/${GAME_CODE}`));
app.get('/host/:code', (req,res) => res.sendFile(path.join(__dirname,'public','host.html')));
app.get('/play/:code', (req,res) => res.sendFile(path.join(__dirname,'public','play.html')));
app.get('/api/qr/:code', async (req,res) => {
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${base}/play/${req.params.code}`;
  const png = await QRCode.toBuffer(url, { width: 500, margin: 1 });
  res.type('png').send(png);
});

function state() {
  const q = questions[game.index];
  let a = 0, b = 0;
  for (const v of game.votes.values()) v === 'a' ? a++ : b++;
  const total = a + b;
  return { code: GAME_CODE, questionNumber: game.index + 1, questionCount: questions.length,
    question: q, revealed: game.revealed, total, a, b,
    aPct: total ? Math.round(a/total*100) : 0, bPct: total ? Math.round(b/total*100) : 0 };
}
function broadcast(){ io.to(GAME_CODE).emit('gameState', state()); }

io.on('connection', socket => {
  socket.on('joinGame', ({code, playerId, role}) => {
    if ((code || '').toUpperCase() !== GAME_CODE) return socket.emit('gameError','Game not found');
    socket.join(GAME_CODE); socket.data = { playerId, role }; socket.emit('gameState', state());
  });
  socket.on('vote', choice => {
    if (!socket.data?.playerId || game.revealed || !['a','b'].includes(choice)) return;
    game.votes.set(socket.data.playerId, choice); broadcast();
  });
  socket.on('reveal', () => { if(socket.data?.role === 'host'){ game.revealed = true; broadcast(); }});
  socket.on('next', () => { if(socket.data?.role === 'host'){ game.index=(game.index+1)%questions.length; game.votes.clear(); game.revealed=false; broadcast(); }});
  socket.on('reset', () => { if(socket.data?.role === 'host'){ game.votes.clear(); game.revealed=false; broadcast(); }});
});
server.listen(PORT, () => console.log(`Either Live running on http://localhost:${PORT}`));
