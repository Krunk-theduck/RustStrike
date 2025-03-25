import { database } from './firebase-config.js';

export class RoomManager {
    constructor(game) {
        this.game = game;
        this.database = database;
        this.activeRoom = null;
        this.roomListeners = new Map();
        this.lastUpdateTime = 0;
        this.updateInterval = 50; // 20 updates per second
        this.setupConnectionMonitoring();
    }

    setupConnectionMonitoring() {
        const connectedRef = this.database.ref('.info/connected');
        connectedRef.on('value', (snap) => {
            if (snap.val() === true && this.activeRoom) {
                this.setupDisconnectHandlers();
            }
        });
    }

    setupDisconnectHandlers() {
        if (!this.activeRoom) return;

        const roomRef = this.database.ref(`rooms/${this.activeRoom}`);
        const playerRef = roomRef.child(`players/${this.game.localPlayer.id}`);
        const hostRef = roomRef.child('hostId');

        // Set up disconnect cleanup
        playerRef.onDisconnect().remove();

        // Check if user is host
        hostRef.get().then((snapshot) => {
            if (snapshot.val() === this.game.localPlayer.id) {
                roomRef.onDisconnect().remove();
            }
        });
    }

    async createRoom(roomCode) {
        try {
            await this.leaveRoom();

            const initialPosition = this.game.localPlayer.findSafeSpawnPosition(this.game.map);
            const roomRef = this.database.ref(`rooms/${roomCode}`);
            const roomData = {
                hostId: this.game.localPlayer.id,
                map: this.game.map.tiles,
                hostPosition: {
                    x: initialPosition.x,
                    y: initialPosition.y
                },
                players: {
                    [this.game.localPlayer.id]: {
                        x: initialPosition.x,
                        y: initialPosition.y,
                        id: this.game.localPlayer.id,
                        lastUpdate: window.ServerValue.TIMESTAMP
                    }
                },
                createdAt: window.ServerValue.TIMESTAMP
            };

            await roomRef.set(roomData);
            this.activeRoom = roomCode;
            this.listenToRoom(roomCode);
            this.setupDisconnectHandlers();
            this.startPositionUpdates();

            return roomCode;
        } catch (error) {
            console.error('Error creating room:', error);
            throw error;
        }
    }

    async joinRoom(roomCode) {
        try {
            await this.leaveRoom();

            const roomRef = this.database.ref(`rooms/${roomCode}`);
            const snapshot = await roomRef.once('value');
            const roomData = snapshot.val();

            if (!roomData) {
                throw new Error('Room not found');
            }

            // Use the Player's existing safe spawn method but near the host
            const hostPos = roomData.hostPosition;
            const spawnPos = this.findSafeSpawnNearPosition(hostPos, this.game.map);

            // Update player position
            this.game.localPlayer.x = spawnPos.x;
            this.game.localPlayer.y = spawnPos.y;

            // Add player to room
            await roomRef.child('players').update({
                [this.game.localPlayer.id]: {
                    x: spawnPos.x,
                    y: spawnPos.y,
                    id: this.game.localPlayer.id,
                    lastUpdate: window.ServerValue.TIMESTAMP
                }
            });

            this.game.map.tiles = roomData.map;
            this.activeRoom = roomCode;
            this.listenToRoom(roomCode);
            this.setupDisconnectHandlers();
            this.startPositionUpdates();

            return roomCode;
        } catch (error) {
            console.error('Error joining room:', error);
            throw error;
        }
    }

    findSafeSpawnNearPosition(targetPos, map) {
        const radius = 200; // Maximum spawn distance from host
        const playerSize = 20; // Player size for collision checking
        const checkPoints = [
            { x: 0, y: 0 },     // Try exact position first
            { x: -50, y: 0 },   // Then try cardinal directions
            { x: 50, y: 0 },
            { x: 0, y: -50 },
            { x: 0, y: 50 },
            { x: -50, y: -50 }, // Then diagonals
            { x: 50, y: 50 },
            { x: -50, y: 50 },
            { x: 50, y: -50 }
        ];

        // Check predefined positions first
        for (const offset of checkPoints) {
            const testPos = {
                x: targetPos.x + offset.x,
                y: targetPos.y + offset.y
            };

            if (this.isPositionSafe(testPos, map, playerSize)) {
                return testPos;
            }
        }

        // If no predefined position works, try random positions
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * radius;
            const testPos = {
                x: targetPos.x + Math.cos(angle) * distance,
                y: targetPos.y + Math.sin(angle) * distance
            };

            if (this.isPositionSafe(testPos, map, playerSize)) {
                return testPos;
            }
        }

        // If all else fails, return the original target position
        return targetPos;
    }

    isPositionSafe(pos, map, size) {
        // Check corners of player hitbox
        const halfSize = size / 2;
        const corners = [
            { x: pos.x - halfSize, y: pos.y - halfSize }, // Top-left
            { x: pos.x + halfSize, y: pos.y - halfSize }, // Top-right
            { x: pos.x - halfSize, y: pos.y + halfSize }, // Bottom-left
            { x: pos.x + halfSize, y: pos.y + halfSize }  // Bottom-right
        ];

        return corners.every(point => map.isWalkable(point.x, point.y));
    }

    startPositionUpdates() {
        const updatePosition = async () => {
            if (!this.activeRoom || !this.game.localPlayer) return;

            const now = Date.now();
            if (now - this.lastUpdateTime < this.updateInterval) return;
            this.lastUpdateTime = now;

            const playerRef = this.database.ref(`rooms/${this.activeRoom}/players/${this.game.localPlayer.id}`);
            await playerRef.update({
                x: this.game.localPlayer.x,
                y: this.game.localPlayer.y,
                lastUpdate: window.ServerValue.TIMESTAMP
            });

            // Update host position if we're the host
            if (this.game.isHost) {
                await this.database.ref(`rooms/${this.activeRoom}/hostPosition`).set({
                    x: this.game.localPlayer.x,
                    y: this.game.localPlayer.y
                });
            }
        };

        // Update position every frame
        const update = () => {
            if (this.activeRoom) {
                updatePosition();
                requestAnimationFrame(update);
            }
        };
        update();
    }

    listenToRoom(roomCode) {
        if (this.roomListeners.has(roomCode)) return;

        const playersRef = this.database.ref(`rooms/${roomCode}/players`);
        const listener = playersRef.on('value', (snapshot) => {
            const players = snapshot.val() || {};
            const now = Date.now();

            // Remove disconnected players
            for (const [playerId, player] of this.game.players) {
                if (!players[playerId] && playerId !== this.game.localPlayer.id) {
                    this.game.players.delete(playerId);
                }
            }

            // Update or add players
            for (const [playerId, playerData] of Object.entries(players)) {
                if (playerId === this.game.localPlayer.id) continue;

                // Ignore updates older than 5 seconds
                if (now - playerData.lastUpdate > 5000) continue;

                let player = this.game.players.get(playerId);
                if (!player) {
                    player = new window.Player(playerData.x, playerData.y);
                    player.id = playerId;
                    this.game.players.set(playerId, player);
                } else {
                    player.x = playerData.x;
                    player.y = playerData.y;
                }
            }
        });

        this.roomListeners.set(roomCode, listener);
    }

    async leaveRoom() {
        if (!this.activeRoom) return;

        try {
            const roomRef = this.database.ref(`rooms/${this.activeRoom}`);
            
            // Cancel all onDisconnect operations
            await roomRef.onDisconnect().cancel();

            if (this.game.isHost) {
                // If host, remove the entire room
                await roomRef.remove();
            } else {
                // If client, just remove the player
                const playerRef = roomRef.child(`players/${this.game.localPlayer.id}`);
                await playerRef.remove();
            }

            // Clean up listeners
            if (this.roomListeners.has(this.activeRoom)) {
                const playersRef = this.database.ref(`rooms/${this.activeRoom}/players`);
                playersRef.off('value', this.roomListeners.get(this.activeRoom));
                this.roomListeners.delete(this.activeRoom);
            }

            this.activeRoom = null;
            this.game.isRunning = false; // Make sure game loop stops
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    }
}

// Make RoomManager globally available
window.RoomManager = RoomManager; 
