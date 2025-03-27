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
                this.setupPresenceSystem();
            }
        });
    }

    setupPresenceSystem() {
        if (!this.activeRoom) return;

        const roomRef = this.database.ref(`rooms/${this.activeRoom}`);
        const playerRef = roomRef.child(`players/${this.game.localPlayer.id}`);
        const hostRef = roomRef.child('hostId');
        const lastOnlineRef = roomRef.child('hostLastOnline');

        // Set up player cleanup on disconnect
        playerRef.onDisconnect().remove();

        // If we're the host, set up room cleanup system
        hostRef.get().then((snapshot) => {
            if (snapshot.val() === this.game.localPlayer.id) {
                // Update host's last online timestamp every 30 seconds
                this.hostPresenceInterval = setInterval(() => {
                    lastOnlineRef.set(window.ServerValue.TIMESTAMP);
                }, 30000);

                // On disconnect, update last online time
                lastOnlineRef.onDisconnect().set(window.ServerValue.TIMESTAMP);

                // Set up a cleanup trigger that other clients can check
                roomRef.child('shouldCleanup').onDisconnect().set(true);
            } else {
                // If we're not the host, monitor the cleanup trigger
                this.monitorHostPresence(roomRef);
            }
        });
    }

    monitorHostPresence(roomRef) {
        // Check for host timeout every 30 seconds
        const checkHostPresence = () => {
            roomRef.child('shouldCleanup').get().then((snapshot) => {
                if (snapshot.val() === true) {
                    // Host has disconnected, clean up the room
                    console.log('Host disconnected, cleaning up room');
                    this.leaveRoom();
                }
            });

            roomRef.child('hostLastOnline').get().then((snapshot) => {
                const lastOnline = snapshot.val();
                if (lastOnline) {
                    const now = Date.now();
                    // If host hasn't updated in 1 minute, consider them disconnected
                    if (now - lastOnline > 60000) {
                        console.log('Host timed out, cleaning up room');
                        this.leaveRoom();
                    }
                }
            });
        };

        // Start monitoring
        this.hostPresenceInterval = setInterval(checkHostPresence, 30000);
    }

    async createRoom(roomCode) {
        try {
            await this.leaveRoom();

            console.log('Creating new room, initializing host player...');
            // Assign team to host (default to red for host)
            this.game.localPlayer.team = 'red';
            this.game.localPlayer.role = 'attacker'; // Attackers are red team
            console.log('Host assigned to team:', this.game.localPlayer.team);
            
            // Initialize map first so we can use it for spawn positions
            this.game.map = new window.GameMap();
            
            // Find safe spawn position based on team
            const initialPosition = this.game.localPlayer.findSafeSpawnPosition(this.game.map);
            
            const roomRef = this.database.ref(`rooms/${roomCode}`);
            const roomData = {
                hostId: this.game.localPlayer.id,
                hostLastOnline: window.ServerValue.TIMESTAMP,
                shouldCleanup: false,
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
                        team: this.game.localPlayer.team,
                        role: this.game.localPlayer.role,
                        health: this.game.localPlayer.health,
                        isAlive: this.game.localPlayer.isAlive,
                        lastUpdate: window.ServerValue.TIMESTAMP
                    }
                },
                createdAt: window.ServerValue.TIMESTAMP
            };

            await roomRef.set(roomData);
            this.activeRoom = roomCode;
            this.listenToRoom(roomCode);
            this.setupPresenceSystem();
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

            console.log('Joining room:', roomCode);
            const roomRef = this.database.ref(`rooms/${roomCode}`);
            const snapshot = await roomRef.once('value');
            const roomData = snapshot.val();

            if (!roomData) {
                throw new Error('Room not found');
            }

            // Create new map and initialize it properly
            this.game.map = new window.GameMap();
            
            // Make sure we preserve the room data and decorations
            this.game.map.tiles = roomData.map;
            
            // Count players and assign team
            let redCount = 0;
            let blueCount = 0;
            
            if (roomData.players) {
                Object.values(roomData.players).forEach(player => {
                    if (player.team === 'red') redCount++;
                    if (player.team === 'blue') blueCount++;
                });
            }
            
            // Assign to team with fewer players
            this.game.localPlayer.team = redCount <= blueCount ? 'red' : 'blue';
            this.game.localPlayer.role = this.game.localPlayer.team === 'red' ? 'attacker' : 'defender';

            // Get spawn position from map based on team
            const spawnPos = this.game.map.getSpawnPoint(this.game.localPlayer.team);

            // Update player position
            this.game.localPlayer.x = spawnPos.x;
            this.game.localPlayer.y = spawnPos.y;

            // Initialize equipment before joining
            if (!this.game.localPlayer.equipment || this.game.localPlayer.equipment.length === 0) {
                this.game.localPlayer.equipment = [];
                this.game.localPlayer.activeWeaponIndex = 0;
            }

            // Add player to room with all required properties
            await roomRef.child('players').update({
                [this.game.localPlayer.id]: {
                    x: spawnPos.x,
                    y: spawnPos.y,
                    id: this.game.localPlayer.id,
                    team: this.game.localPlayer.team,
                    role: this.game.localPlayer.role,
                    health: this.game.localPlayer.health,
                    isAlive: this.game.localPlayer.isAlive,
                    money: this.game.localPlayer.money,
                    equipment: [],  // Will be filled by CombatManager
                    activeWeaponIndex: 0,
                    lastUpdate: window.ServerValue.TIMESTAMP
                }
            });

            this.activeRoom = roomCode;
            this.listenToRoom(roomCode);
            this.setupPresenceSystem();
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

            try {
                // Make sure the player and required data exist
                if (!this.game.localPlayer) {
                    console.warn('Local player is null, skipping position update');
                    return;
                }

                const playerRef = this.database.ref(`rooms/${this.activeRoom}/players/${this.game.localPlayer.id}`);
                
                // Use the normalized data structure that avoids circular references
                const normalizedData = this.game.localPlayer.normalizeForSync();
                
                await playerRef.update(normalizedData);

                // Update host position if we're the host
                if (this.game.isHost) {
                    await this.database.ref(`rooms/${this.activeRoom}/hostPosition`).set({
                        x: this.game.localPlayer.x,
                        y: this.game.localPlayer.y
                    });
                }
            } catch (error) {
                console.error('Failed to update player data:', error);
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
            const playersData = snapshot.val();
            if (!playersData) return;
            
            // Make sure localPlayer exists before using its properties
            if (!this.game.localPlayer) {
                console.warn('Local player is null, skipping player data update');
                return;
            }
            
            for (const [playerId, playerData] of Object.entries(playersData)) {
                // Skip local player as we manage it directly
                if (playerId === this.game.localPlayer.id) continue;
                
                try {
                    // Handle remote player
                    if (this.game.players.has(playerId)) {
                        // Update existing player
                        const player = this.game.players.get(playerId);
                        
                        // Update position and other properties
                        player.x = playerData.x;
                        player.y = playerData.y;
                        player.team = playerData.team;
                        player.role = playerData.role;
                        player.health = playerData.health;
                        player.isAlive = playerData.isAlive;
                        player.money = playerData.money || player.money;
                        
                        // Update aim properties
                        if (playerData.aim) {
                            if (!player.aim) player.aim = {};
                            player.aim.angle = playerData.aim.angle || 0;
                            player.aim.x = playerData.aim.x || player.x;
                            player.aim.y = playerData.aim.y || player.y;
                            player.direction = playerData.aim.angle || 0;
                        } else if (playerData.direction !== undefined) {
                            // Fallback to using direction if aim data isn't available
                            player.direction = playerData.direction;
                            if (!player.aim) player.aim = {};
                            player.aim.angle = playerData.direction;
                        }
                        
                        // Reconstruct weapons properly
                        if (playerData.equipment && this.game.combatManager) {
                            this.game.combatManager.reconstructWeaponsFromNetworkData(
                                player, 
                                playerData.equipment
                            );
                        }
                        
                        // Update active weapon index
                        if (typeof playerData.activeWeaponIndex === 'number') {
                            player.activeWeaponIndex = playerData.activeWeaponIndex;
                        }
                    } else {
                        // Create new player
                        const newPlayer = new window.Player(playerData.x, playerData.y);
                        newPlayer.id = playerId;
                        newPlayer.team = playerData.team;
                        newPlayer.role = playerData.role;
                        newPlayer.health = playerData.health;
                        newPlayer.isAlive = playerData.isAlive;
                        newPlayer.money = playerData.money || 800;
                        
                        // Initialize aim properties
                        if (playerData.aim) {
                            if (!newPlayer.aim) newPlayer.aim = {};
                            newPlayer.aim.angle = playerData.aim.angle || 0;
                            newPlayer.aim.x = playerData.aim.x || newPlayer.x;
                            newPlayer.aim.y = playerData.aim.y || newPlayer.y;
                            newPlayer.direction = playerData.aim.angle || 0;
                        } else if (playerData.direction !== undefined) {
                            newPlayer.direction = playerData.direction;
                            if (!newPlayer.aim) newPlayer.aim = {};
                            newPlayer.aim.angle = playerData.direction;
                        }
                        
                        // Reconstruct weapons properly
                        if (playerData.equipment && this.game.combatManager) {
                            this.game.combatManager.reconstructWeaponsFromNetworkData(
                                newPlayer, 
                                playerData.equipment
                            );
                        }
                        
                        // Update active weapon index
                        if (typeof playerData.activeWeaponIndex === 'number') {
                            newPlayer.activeWeaponIndex = playerData.activeWeaponIndex;
                        }
                        
                        this.game.players.set(playerId, newPlayer);
                    }
                } catch (error) {
                    console.error(`Error handling player ${playerId}:`, error);
                }
            }
        });

        // Listen for damage events
        try {
            const damageRef = this.database.ref(`rooms/${roomCode}/damage`);
            damageRef.on('child_added', (snapshot) => {
                const damageData = snapshot.val();
                if (!damageData) return;
                
                // Process damage events
                if (this.game.combatManager && this.game.localPlayer) {
                    this.game.combatManager.processRemoteDamage(damageData);
                }
                
                // Remove processed damage events to keep database clean
                snapshot.ref.remove();
            });
        } catch (error) {
            console.error('Error setting up damage listener:', error);
        }

        this.roomListeners.set(roomCode, listener);
    }

    async leaveRoom() {
        if (!this.activeRoom) return;

        try {
            // Clear the host presence interval if it exists
            if (this.hostPresenceInterval) {
                clearInterval(this.hostPresenceInterval);
                this.hostPresenceInterval = null;
            }

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

    synchronizeAim() {
        if (!this.activeRoom || !this.game.localPlayer) return;
        
        try {
            const playerRef = this.database.ref(
                `rooms/${this.activeRoom}/players/${this.game.localPlayer.id}`
            );
            
            // Update only the aim data to reduce network traffic
            if (this.game.localPlayer.aim) {
                playerRef.child('aim').update({
                    angle: this.game.localPlayer.aim.angle,
                    x: this.game.localPlayer.aim.x,
                    y: this.game.localPlayer.aim.y
                });
            }
        } catch (error) {
            console.error('Failed to sync aim data:', error);
        }
    }

    handleGameEvent(event) {
        // Handle existing events...
        
        // Add this case to handle bomb assignment
        if (event.type === 'bombAssigned') {
            const playerId = event.playerId;
            const player = this.game.players.get(playerId);
            
            if (player) {
                player.hasBomb = true;
                
                // Update UI if this is the local player
                if (this.game.localPlayer && player.id === this.game.localPlayer.id) {
                    if (this.game.ui) {
                        this.game.ui.showBombCarrierStatus(true);
                    }
                }
            }
        }
        
        // Other event handlers...
    }
}

// Make RoomManager globally available
window.RoomManager = RoomManager; 
