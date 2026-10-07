# Either Live
A lightweight live either/or audience voting prototype.

## Local setup
1. Install Node.js LTS.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000/host/DEMO`.

For phones on the same network, use your computer's LAN IP instead of localhost, e.g. `http://192.168.1.20:3000/host/DEMO`.

## Current prototype
- Host/shared screen
- QR code join
- Anonymous browser player ID
- One vote per browser per question
- Live answer count
- Host reveal
- Next question
- Reset votes

Votes and game state are currently stored in memory and reset when Node restarts. SQLite/admin question management are planned for Stage 2.
