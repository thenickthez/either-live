const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const liveGames = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/* ========================================
   ADMIN AUTHENTICATION
======================================== */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH_SECRET = process.env.AUTH_SECRET || ADMIN_PASSWORD;

function parseCookies(req) {
    return Object.fromEntries(
        String(req.headers.cookie || '')
            .split(';')
            .map(cookie => cookie.trim())
            .filter(Boolean)
            .map(cookie => {
                const index = cookie.indexOf('=');
                return [
                    decodeURIComponent(cookie.slice(0, index)),
                    decodeURIComponent(cookie.slice(index + 1))
                ];
            })
    );
}

function adminToken() {
    if (!AUTH_SECRET) {
        return '';
    }

    return crypto
        .createHmac('sha256', AUTH_SECRET)
        .update('either-live-admin')
        .digest('hex');
}

function isAdmin(req) {
    const cookies = parseCookies(req);
    const expected = adminToken();
    const received = cookies.either_admin || '';

    if (!expected || expected.length !== received.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(received)
    );
}

function requireAdmin(req, res, next) {
    if (isAdmin(req)) {
        return next();
    }

    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Admin login required.' });
    }

    return res.redirect('/login');
}

app.get('/login', (req, res) => {
    if (isAdmin(req)) {
        return res.redirect('/admin');
    }

    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    if (!ADMIN_PASSWORD) {
        return res.status(503).send('ADMIN_PASSWORD is not configured.');
    }

    const submitted = String(req.body.password || '');
    const valid = submitted.length === ADMIN_PASSWORD.length &&
        crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(ADMIN_PASSWORD));

    if (!valid) {
        return res.redirect('/login?error=1');
    }

    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookie = [
        `either_admin=${encodeURIComponent(adminToken())}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=28800',
        secure ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    res.setHeader('Set-Cookie', cookie);
    return res.redirect('/admin');
});

app.post('/logout', (req, res) => {
    res.setHeader(
        'Set-Cookie',
        'either_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );
    res.redirect('/login');
});

app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (req, res) => res.redirect('/admin'));
app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/host/:code', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play/:code', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

/* ========================================
   ADMIN API
======================================== */

app.use('/api/sets', requireAdmin);
app.use('/api/questions', requireAdmin);
app.use('/api/games', requireAdmin);

app.get('/api/sets', (req, res) => {
    const sets = db.prepare(`
        SELECT s.id, s.name, COUNT(q.id) AS question_count
        FROM question_sets s
        LEFT JOIN questions q ON q.set_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC, s.id DESC
    `).all();

    res.json(sets);
});

app.post('/api/sets', (req, res) => {
    const name = String(req.body.name || '').trim();

    if (!name) {
        return res.status(400).json({ error: 'Set name is required.' });
    }

    const result = db.prepare(
        'INSERT INTO question_sets (name) VALUES (?)'
    ).run(name);

    res.json({
        id: Number(result.lastInsertRowid),
        name
    });
});

app.put('/api/sets/:id', (req, res) => {
    const name = String(req.body.name || '').trim();

    if (!name) {
        return res.status(400).json({ error: 'Set name is required.' });
    }

    db.prepare(
        'UPDATE question_sets SET name = ? WHERE id = ?'
    ).run(name, req.params.id);

    res.json({ ok: true });
});

app.delete('/api/sets/:id', (req, res) => {
    const active = db.prepare(
        'SELECT COUNT(*) AS count FROM games WHERE set_id = ?'
    ).get(req.params.id).count;

    if (active) {
        return res.status(400).json({
            error: 'This set has game history and cannot be deleted yet.'
        });
    }

    db.prepare(
        'DELETE FROM question_sets WHERE id = ?'
    ).run(req.params.id);

    res.json({ ok: true });
});

app.get('/api/sets/:id/questions', (req, res) => {
    const questions = db.prepare(`
        SELECT *
        FROM questions
        WHERE set_id = ?
        ORDER BY sort_order, id
    `).all(req.params.id);

    res.json(questions);
});

app.post('/api/sets/:id/questions', (req, res) => {
    const optionA = String(req.body.option_a || '').trim();
    const optionB = String(req.body.option_b || '').trim();

    if (!optionA || !optionB) {
        return res.status(400).json({ error: 'Both answers are required.' });
    }

    const next = db.prepare(`
        SELECT COALESCE(MAX(sort_order), 0) + 1 AS next
        FROM questions
        WHERE set_id = ?
    `).get(req.params.id).next;

    const result = db.prepare(`
        INSERT INTO questions (set_id, option_a, option_b, sort_order)
        VALUES (?, ?, ?, ?)
    `).run(req.params.id, optionA, optionB, next);

    res.json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/questions/:id', (req, res) => {
    const optionA = String(req.body.option_a || '').trim();
    const optionB = String(req.body.option_b || '').trim();

    if (!optionA || !optionB) {
        return res.status(400).json({ error: 'Both answers are required.' });
    }

    db.prepare(`
        UPDATE questions
        SET option_a = ?, option_b = ?
        WHERE id = ?
    `).run(optionA, optionB, req.params.id);

    res.json({ ok: true });
});

app.delete('/api/questions/:id', (req, res) => {
    db.prepare(
        'DELETE FROM questions WHERE id = ?'
    ).run(req.params.id);

    res.json({ ok: true });
});

app.post('/api/questions/:id/move', (req, res) => {
    const direction = String(req.body.direction || '').toLowerCase();

    if (!['up', 'down'].includes(direction)) {
        return res.status(400).json({ error: 'Direction must be up or down.' });
    }

    const question = db.prepare(`
        SELECT *
        FROM questions
        WHERE id = ?
    `).get(req.params.id);

    if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
    }

    const neighbor = direction === 'up'
        ? db.prepare(`
            SELECT *
            FROM questions
            WHERE set_id = ?
              AND (sort_order < ? OR (sort_order = ? AND id < ?))
            ORDER BY sort_order DESC, id DESC
            LIMIT 1
        `).get(question.set_id, question.sort_order, question.sort_order, question.id)
        : db.prepare(`
            SELECT *
            FROM questions
            WHERE set_id = ?
              AND (sort_order > ? OR (sort_order = ? AND id > ?))
            ORDER BY sort_order ASC, id ASC
            LIMIT 1
        `).get(question.set_id, question.sort_order, question.sort_order, question.id);

    if (!neighbor) {
        return res.json({ ok: true });
    }

    const temporaryOrder = -1000000 - Number(question.id);

    db.exec('BEGIN');

    try {
        db.prepare('UPDATE questions SET sort_order = ? WHERE id = ?')
            .run(temporaryOrder, question.id);
        db.prepare('UPDATE questions SET sort_order = ? WHERE id = ?')
            .run(question.sort_order, neighbor.id);
        db.prepare('UPDATE questions SET sort_order = ? WHERE id = ?')
            .run(neighbor.sort_order, question.id);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    res.json({ ok: true });
});

app.post('/api/games', (req, res) => {
    const setId = Number(req.body.set_id);
    const set = db.prepare(
        'SELECT * FROM question_sets WHERE id = ?'
    ).get(setId);

    const questionCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM questions
        WHERE set_id = ?
    `).get(setId).count;

    if (!set || questionCount === 0) {
        return res.status(400).json({
            error: 'Choose a set containing at least one question.'
        });
    }

    let code;

    do {
        code = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
    } while (db.prepare('SELECT code FROM games WHERE code = ?').get(code));

    db.prepare(
        'INSERT INTO games (code, set_id) VALUES (?, ?)'
    ).run(code, setId);

    ensureLiveGame(code);

    res.json({
        code,
        host_url: `/host/${code}`
    });
});

/* ========================================
   QR CODE
======================================== */

function getLocalIPv4() {
    const networks = os.networkInterfaces();

    for (const interfaces of Object.values(networks)) {
        for (const network of interfaces || []) {
            if (network.family === 'IPv4' && !network.internal) {
                return network.address;
            }
        }
    }

    return 'localhost';
}

app.get('/api/qr/:code', async (req, res) => {
    const code = req.params.code.toUpperCase();
    let base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

    if (!process.env.PUBLIC_URL && /localhost|127\.0\.0\.1/i.test(base)) {
        base = `${req.protocol}://${getLocalIPv4()}:${PORT}`;
    }

    const playUrl = `${base}/play/${code}`;
    const png = await QRCode.toBuffer(playUrl, {
        width: 500,
        margin: 1
    });

    res.type('png').send(png);
});

/* ========================================
   LIVE GAME HELPERS
======================================== */

function getQuestions(setId) {
    return db.prepare(`
        SELECT
            id,
            option_a AS a,
            option_b AS b
        FROM questions
        WHERE set_id = ?
        ORDER BY sort_order, id
    `).all(setId);
}

function ensureLiveGame(code) {
    code = String(code || '').toUpperCase();

    if (liveGames.has(code)) {
        return liveGames.get(code);
    }

    const row = db.prepare(
        'SELECT * FROM games WHERE code = ?'
    ).get(code);

    if (!row) {
        return null;
    }

    const game = {
        code,
        setId: row.set_id,
        status: row.status,
        index: row.question_index,
        revealed: false,
        votes: new Map(),
        players: new Set(),
        playerAnswers: new Map(),
        questionResults: []
    };

    liveGames.set(code, game);
    return game;
}

function countCurrentVotes(game) {
    let a = 0;
    let b = 0;

    for (const vote of game.votes.values()) {
        if (vote === 'a') {
            a++;
        }

        if (vote === 'b') {
            b++;
        }
    }

    return {
        a,
        b,
        total: a + b
    };
}

function saveCurrentQuestionResult(game) {
    const questions = getQuestions(game.setId);
    const question = questions[game.index];

    if (!question) {
        return;
    }

    const counts = countCurrentVotes(game);

    game.questionResults[game.index] = {
        questionNumber: game.index + 1,
        questionId: question.id,
        a: question.a,
        b: question.b,
        aVotes: counts.a,
        bVotes: counts.b,
        total: counts.total,
        aPct: counts.total ? Math.round((counts.a / counts.total) * 100) : 0,
        bPct: counts.total ? Math.round((counts.b / counts.total) * 100) : 0
    };
}

function buildPersonalResults(game, playerId) {
    const answers = game.playerAnswers.get(playerId) || new Map();
    const results = [];

    for (let index = 0; index < game.questionResults.length; index++) {
        const questionResult = game.questionResults[index];
        const choice = answers.get(index);

        if (!questionResult || !choice) {
            continue;
        }

        const selectedText = choice === 'a'
            ? questionResult.a
            : questionResult.b;

        const samePercent = choice === 'a'
            ? questionResult.aPct
            : questionResult.bPct;

        results.push({
            questionNumber: questionResult.questionNumber,
            choice: selectedText,
            samePercent
        });
    }

    const overallPercent = results.length
        ? Math.round(
            results.reduce((sum, item) => sum + item.samePercent, 0) / results.length
        )
        : 0;

    return {
        results,
        overallPercent
    };
}

function buildGroupSummary(game) {
    const completed = game.questionResults.filter(Boolean);

    if (!completed.length) {
        return null;
    }

    const ranked = completed.map(result => {
        const highPercent = Math.max(result.aPct, result.bPct);
        const difference = Math.abs(result.aPct - result.bPct);

        return {
            ...result,
            highPercent,
            difference,
            winningChoice: result.aPct >= result.bPct ? result.a : result.b
        };
    });

    const mostAgreed = [...ranked].sort(
        (first, second) => second.highPercent - first.highPercent
    )[0];

    const leastAgreed = [...ranked].sort(
        (first, second) => first.highPercent - second.highPercent
    )[0];

    const similarityScores = completed
        .filter(result => result.total > 1)
        .map(result => {
            const matchingPairs =
                (result.a * (result.a - 1)) +
                (result.b * (result.b - 1));
            const possiblePairs = result.total * (result.total - 1);

            return possiblePairs
                ? (matchingPairs / possiblePairs) * 100
                : 0;
        });

    const overallAlikePercent = similarityScores.length
        ? Math.round(
            similarityScores.reduce((sum, score) => sum + score, 0) /
            similarityScores.length
        )
        : 100;

    return {
        mostAgreed,
        leastAgreed,
        overallAlikePercent
    };
}

function gameState(game) {
    const questions = getQuestions(game.setId);
    const question = questions[game.index] || null;
    const counts = countCurrentVotes(game);

    return {
        code: game.code,
        status: game.status,
        questionNumber: question ? game.index + 1 : 0,
        questionCount: questions.length,
        question,
        revealed: game.revealed,
        total: counts.total,
        playerCount: game.players.size,
        a: counts.a,
        b: counts.b,
        aPct: counts.total ? Math.round((counts.a / counts.total) * 100) : 0,
        bPct: counts.total ? Math.round((counts.b / counts.total) * 100) : 0,
        groupSummary: game.status === 'finished' ? buildGroupSummary(game) : null
    };
}

function broadcast(game) {
    io.to(game.code).emit('gameState', gameState(game));
}

function sendPersonalResults(game) {
    for (const socket of io.sockets.sockets.values()) {
        if (
            socket.data?.code === game.code &&
            socket.data?.role === 'player' &&
            socket.data?.playerId
        ) {
            socket.emit(
                'personalResults',
                buildPersonalResults(game, socket.data.playerId)
            );
        }
    }
}

/* ========================================
   SOCKET.IO LIVE GAME EVENTS
======================================== */

io.on('connection', socket => {
    socket.on('joinGame', ({ code, playerId, role }) => {
        const game = ensureLiveGame(code);

        if (!game) {
            return socket.emit('gameError', 'Game not found.');
        }

        socket.join(game.code);
        socket.data = {
            code: game.code,
            playerId,
            role
        };

        if (role === 'player' && playerId) {
            game.players.add(playerId);
        }

        broadcast(game);

        if (role === 'player' && game.status === 'finished') {
            socket.emit(
                'personalResults',
                buildPersonalResults(game, playerId)
            );
        }
    });

    socket.on('start', () => {
        const game = ensureLiveGame(socket.data?.code);

        if (!game || socket.data?.role !== 'host') {
            return;
        }

        game.status = 'playing';
        game.index = 0;
        game.votes.clear();
        game.playerAnswers.clear();
        game.questionResults = [];
        game.revealed = false;

        db.prepare(`
            UPDATE games
            SET status = 'playing', question_index = 0
            WHERE code = ?
        `).run(game.code);

        broadcast(game);
    });

    socket.on('vote', choice => {
        const game = ensureLiveGame(socket.data?.code);

        if (
            !game ||
            game.status !== 'playing' ||
            game.revealed ||
            !socket.data?.playerId ||
            !['a', 'b'].includes(choice)
        ) {
            return;
        }

        const playerId = socket.data.playerId;
        game.votes.set(playerId, choice);

        if (!game.playerAnswers.has(playerId)) {
            game.playerAnswers.set(playerId, new Map());
        }

        game.playerAnswers.get(playerId).set(game.index, choice);
        broadcast(game);
    });

    socket.on('reveal', () => {
        const game = ensureLiveGame(socket.data?.code);

        if (
            !game ||
            socket.data?.role !== 'host' ||
            game.status !== 'playing'
        ) {
            return;
        }

        game.revealed = true;
        saveCurrentQuestionResult(game);
        broadcast(game);
    });

    socket.on('next', () => {
        const game = ensureLiveGame(socket.data?.code);

        if (!game || socket.data?.role !== 'host') {
            return;
        }

        const questions = getQuestions(game.setId);
        saveCurrentQuestionResult(game);

        if (game.index < questions.length - 1) {
            game.index++;
            game.votes.clear();
            game.revealed = false;

            db.prepare(`
                UPDATE games
                SET question_index = ?
                WHERE code = ?
            `).run(game.index, game.code);
        } else {
            game.status = 'finished';

            db.prepare(`
                UPDATE games
                SET status = 'finished'
                WHERE code = ?
            `).run(game.code);
        }

        broadcast(game);

        if (game.status === 'finished') {
            sendPersonalResults(game);
        }
    });

    socket.on('reset', () => {
        const game = ensureLiveGame(socket.data?.code);

        if (!game || socket.data?.role !== 'host') {
            return;
        }

        game.votes.clear();
        game.revealed = false;

        for (const answers of game.playerAnswers.values()) {
            answers.delete(game.index);
        }

        game.questionResults[game.index] = undefined;
        broadcast(game);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Either Live running on http://localhost:${PORT}`);
    console.log(`Local network: http://${getLocalIPv4()}:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
});
