# Either Live

A live either/or audience voting game built with Node.js, Express, Socket.IO and SQLite.

## Requirements

- Node.js 22.5 or newer (this project uses Node's built-in `node:sqlite` module)
- npm

## Local setup

```bash
npm install
npm start
```

Open:

- Admin: http://localhost:3000/admin
- Create a question set or use the seeded Demo Questions set.
- Click **Create Live Game**.
- The host lobby shows a game code and QR code.
- Players scan the QR code and wait in the lobby.
- Click **Start Game** on the host screen.

## Database

The SQLite database is created automatically at:

`database/either.db`

On a brand-new database, the app seeds one Demo Questions set with three questions.

The database file is intentionally ignored by Git. Each environment creates its own database.

## Production / cPanel

The cPanel Node.js application must use Node 22.5+ and allow WebSocket connections for Socket.IO. Set the application startup file to `server.js`.

Set `PUBLIC_URL` to the public HTTPS URL of the app if the QR code should point to a different public hostname than the incoming request.

## Stage 2.1 additions

- QR codes automatically use the computer's local IPv4 address during local testing.
- Each anonymous player keeps their answers for the active game.
- At the end of the game, each phone shows every choice and the percentage of players who made the same choice.
- The phone also shows an overall similarity percentage based on the average of those per-question percentages.
- The shared host screen shows the most agreed-upon choice and the closest call.
- No winners, rankings, or points are used.

Player answers are held in server memory for the active game and are not permanently stored in SQLite.
