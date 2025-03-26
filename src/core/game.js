import { Player } from './player.js';
import { Map as GameMap } from './map.js';
import { Renderer } from '../rendering/renderer.js';
import { Camera } from '../rendering/camera.js';
import { RoomManager } from '../networking/RoomManager.js';
import { RoundManager } from './RoundManager.js';
import { RaycastEngine } from '../rendering/RaycastEngine.js';
import { CombatManager } from '../combat/CombatManager.js';
import { UserManager } from '../user/UserManager.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.players = new Map();
        this.map = null;
        this.renderer = new Renderer(this);
        this.isRunning = false;
        this.roomCode = null;
        this.isHost = false;
        this.lockPlayerMovement = false;
        
        // Mouse tracking for aiming
        this.mousePosition = { x: 0, y: 0 };
        
        // Bomb mechanics constants
        this.PLANTING_TIME = 5000; // 5 seconds to plant
        this.DEFUSING_TIME = 5000; // 5 seconds to defuse
        this.BOMB_EXPLOSION_TIME = 40000; // 40 seconds before explosion
        
        // Bomb state variables
        this.bombPosition = null; // Position of dropped bomb
        this.plantedBombPosition = null; // Position of planted bomb
        this.plantingStartTime = 0; // Time when planting started
        this.defusingStartTime = 0; // Time when defusing started
        this.bombPlantedTime = 0; // Time when bomb was planted
        this.bombExplodeTime = 0; // Time when bomb will explode
        
        // Initialize the user manager
        this.userManager = new UserManager();
        
        this.setupCanvas();
        this.roomManager = new RoomManager(this);
        this.roundManager = new RoundManager(this);
    }

    setupCanvas() {
        // Set canvas size to window size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            
            // Recreate visibility map when canvas resizes
            if (this.raycastEngine) {
                this.raycastEngine.initVisibilityMap();
            }
        });
    }

    assignTeam() {
        // Count players on each team
        let redCount = 0;
        let blueCount = 0;
        
        this.players.forEach(player => {
            if (player.team === 'red') redCount++;
            if (player.team === 'blue') blueCount++;
        });
        
        // Assign to team with fewer players
        return redCount <= blueCount ? 'red' : 'blue';
    }

    init() {
        this.keys = {};
        this.map = new GameMap();
        
        // Assign team to local player
        const team = this.assignTeam();
        this.localPlayer = new Player(undefined, undefined, this.map, team);
        
        // Make sure equipment is initialized
        if (!this.localPlayer.equipment) {
            this.localPlayer.equipment = [];
        }
        
        this.players = new Map();
        this.players.set(this.localPlayer.id, this.localPlayer);
        this.camera = new Camera(this.canvas, this.map);
        this.renderer.setCamera(this.camera);
        
        // Initialize raycast engine after camera is set
        this.raycastEngine = new RaycastEngine(this);
        
        // Apply user settings to raycast engine
        this.applyUserSettings();
        
        // Initialize combat manager
        this.combatManager = new CombatManager(this);
        
        // Initialize win condition checker
        this.winConditionInterval = null;
        
        this.setupInputHandlers();
        this.gameLoop();
        
        console.log('Game initialized successfully');
    }

    setupInputHandlers() {
        // Keyboard input
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            
            // Toggle adaptive ray count with 'R' key (only if not reloading)
            if (e.key === 'r' && this.raycastEngine && !this.isReloading()) {
                const adaptive = !this.raycastEngine.adaptiveRayCount;
                this.raycastEngine.setAdaptiveRayCount(adaptive);
                console.log(`Adaptive ray count: ${adaptive ? 'enabled' : 'disabled'}`);
            }
            
            // Toggle buy menu with 'B' key during prep phase
            if (e.key === 'b' && this.roundManager && 
                this.roundManager.currentState === this.roundManager.STATES.PREP) {
                if (this.ui) {
                    this.ui.toggleBuyMenu();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        
        // Mouse movement for aiming
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            // Get mouse position relative to canvas
            this.mousePosition = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            // Update player aim if game is running
            if (this.isRunning && this.localPlayer) {
                this.localPlayer.updateAim(this.mousePosition.x, this.mousePosition.y, this.camera);
                this.synchronizeAim();
            }
        });
        
        // Note: Mouse click for shooting is now handled by the CombatManager
    }
    
    // Helper to check if player is currently reloading
    isReloading() {
        if (!this.localPlayer || !this.localPlayer.equipment || 
            this.localPlayer.equipment.length === 0 || 
            this.localPlayer.activeWeaponIndex === undefined) {
            return false;
        }
        
        const weapon = this.localPlayer.equipment[this.localPlayer.activeWeaponIndex];
        return weapon && weapon.isReloading;
    }
    
    // Synchronize player aim with other clients
    synchronizeAim() {
        if (!this.roomManager.activeRoom || !this.localPlayer) return;
        
        const playerRef = this.database.ref(
            `rooms/${this.roomManager.activeRoom}/players/${this.localPlayer.id}/aim`
        );
        
        playerRef.update({
            angle: this.localPlayer.aim.angle,
            x: this.localPlayer.aim.x,
            y: this.localPlayer.aim.y
        });
    }

    async startGame(roomCode, isHost) {
        this.roomCode = roomCode;
        this.isHost = isHost;
        
        try {
            // Initialize game state
            this.init();

            // Setup multiplayer
            if (isHost) {
                await this.roomManager.createRoom(roomCode);
            } else {
                await this.roomManager.joinRoom(roomCode);
            }
            
            // Initialize round system
            this.roundManager.init(roomCode);
            
            // Get a reference to Firebase database for aim synchronization
            this.database = this.roomManager.database;
            
            // Initialize default weapon for local player
            this.combatManager.initializeDefaultWeapon(this.localPlayer);
            
            // If host, start the first round after a short delay
            if (isHost) {
                setTimeout(() => {
                    this.roundManager.startFirstRound();
                }, 3000); // Give players 3 seconds to join
            }

            this.isRunning = true;
            this.gameLoop();
        } catch (error) {
            console.error('Failed to start game:', error);
            this.stopGame();
            throw error;
        }
    }

    stopGame() {
        this.isRunning = false;
        
        // Remove bomb state listener
        if (this.roomManager && this.roomManager.activeRoom) {
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).off();
        }
        
        // Stop checking win conditions
        this.stopWinConditionChecker();
        
        if (this.roundManager) {
            this.roundManager.cleanUp();
        }
        
        if (this.roomManager) {
            this.roomManager.leaveRoom();
        }
        
        // Reset the game state
        this.localPlayer = null;
        this.players.clear();
        this.map = null;
        this.raycastEngine = null;
        this.combatManager = null;
    }

    gameLoop() {
        if (!this.isRunning) return;
        
        const currentTime = performance.now();
        this.deltaTime = (currentTime - (this.lastFrameTime || currentTime)) / 1000; // Convert to seconds
        this.lastFrameTime = currentTime;
        
        // Limit deltaTime to prevent huge jumps after tab switch or lag
        this.deltaTime = Math.min(this.deltaTime, 0.1);
        
        this.update(this.deltaTime);
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }

    updateBomb() {
        // Only host should check for bomb state changes
        if (!this.isHost || !this.roomManager || !this.roomManager.activeRoom) return;

        try {
            const now = Date.now();
            const roomRef = this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}`);

            // Get current bomb state from the room
            roomRef.child('bomb').once('value', (snapshot) => {
                try {
                    const bombData = snapshot.val();
                    if (!bombData) return;

                    // Check if bomb is planted and not yet exploded or defused
                    if (bombData.planted && !bombData.exploded && !bombData.defused) {
                        // Make sure timer data exists
                        if (!bombData.plantedTime || !this.BOMB_EXPLOSION_TIME) return;
                    
                        // Check if bomb has exceeded explosion time
                        if (now >= bombData.plantedTime + this.BOMB_EXPLOSION_TIME) {
                            // Update bomb state with complete reset
                            roomRef.child('bomb').update({
                                planted: false,
                                exploded: true,
                                explodedTime: now,
                                plantedPosition: null,
                                plantedTime: 0,
                                explodeTime: 0,
                                timerDuration: 0,
                                position: null,
                                carrierId: null
                            });

                            // End round with attackers (red team) winning
                            if (this.roundManager) {
                                this.roundManager.endRound('red', 'bomb_exploded');
                            }
                        }
                    }

                    // Check if bomb was defused
                    if (bombData.defused && !bombData.exploded) {
                        // Update bomb state with complete reset
                        roomRef.child('bomb').update({
                            planted: false,
                            defused: true,
                            defusedTime: now,
                            plantedPosition: null,
                            plantedTime: 0,
                            explodeTime: 0,
                            timerDuration: 0,
                            position: null,
                            carrierId: null
                        });

                        // End round with defenders (blue team) winning
                        if (this.roundManager) {
                            this.roundManager.endRound('blue', 'bomb_defused');
                        }
                    }
                } catch (innerError) {
                    console.error('Error checking bomb state:', innerError);
                }
            });

            // Set up a listener for bomb state changes (do this outside the once() callback)
            const bombListener = (bombSnapshot) => {
                try {
                    const currentBombData = bombSnapshot.val();
                    if (!currentBombData) return;

                    // If bomb is no longer planted (either exploded or defused)
                    if (!currentBombData.planted) {
                        // Clean up local bomb state
                        this.plantedBombPosition = null;
                        this.bombPlantedTime = 0;
                        this.bombExplodeTime = 0;
                        this.bombPosition = null;
                        this.bombExplodeTimeRemaining = 0;

                        // Hide bomb timer UI
                        if (this.ui) {
                            this.ui.showBombTimer(false);
                        }
                    } else if (currentBombData.planted && currentBombData.explodeTime) {
                        // Don't update if the bomb is about to be defused or exploded
                        if (this.bombDefused || this.bombExploded) return;
                        
                        // Only update if the bomb state is valid
                        if (currentBombData.explodeTime > Date.now()) {
                            // Update UI with server time
                            if (this.ui) {
                                this.ui.showBombTimer(true, currentBombData.explodeTime);
                            }
                            
                            // Update local state to match server
                            this.bombPlantedTime = currentBombData.plantedTime || 0;
                            this.bombExplodeTime = currentBombData.explodeTime || 0;
                            
                            // Calculate remaining time for local timer
                            if (this.bombExplodeTime > 0) {
                                const remainingSecs = Math.max(0, (this.bombExplodeTime - Date.now()) / 1000);
                                this.bombExplodeTimeRemaining = remainingSecs;
                            }
                        }
                    }
                } catch (listenerError) {
                    console.error('Error in bomb listener:', listenerError);
                }
            };
            
            // Only set listener once
            if (!this._bombListenerSet) {
                // Remove any existing listener first to avoid duplicates
                roomRef.child('bomb').off('value');
                roomRef.child('bomb').on('value', bombListener);
                this._bombListenerSet = true;
            }
        } catch (error) {
            console.error('Error in updateBomb:', error);
        }
    }

    update(deltaTime) {
        try {
            // Add this line near the start of the update method
            this.updateBomb();

            // Only update player movement if not locked
            if (!this.lockPlayerMovement && this.localPlayer && this.localPlayer.isAlive) {
                this.localPlayer.update(this.keys, this.map, deltaTime);
                
                // Check for bomb pickup if E key is pressed
                if (this.keys.e) {
                    if (this.bombPosition && !this.localPlayer.hasBomb && 
                        this.localPlayer.team === 'red') { // Only red team can pick up
                        const bombDistance = Math.sqrt(
                            Math.pow(this.localPlayer.x - this.bombPosition.x, 2) + 
                            Math.pow(this.localPlayer.y - this.bombPosition.y, 2)
                        );
                        
                        // If player is close to bomb (within pickup range)
                        if (bombDistance < 50) {
                            this.pickupBomb();
                        }
                    } else if (this.localPlayer.hasBomb && 
                               this.roundManager.currentState === this.roundManager.STATES.ACTIVE) {
                        // Start planting bomb if in active phase and has bomb
                        this.startPlantingBomb();
                    } else if (!this.localPlayer.hasBomb && this.localPlayer.team === 'blue' &&
                              this.plantedBombPosition && this.roundManager.currentState === this.roundManager.STATES.ACTIVE) {
                        // Start defusing if defender near planted bomb
                        const bombDistance = Math.sqrt(
                            Math.pow(this.localPlayer.x - this.plantedBombPosition.x, 2) + 
                            Math.pow(this.localPlayer.y - this.plantedBombPosition.y, 2)
                        );
                        
                        // If player is close to bomb (within defuse range)
                        if (bombDistance < this.map.tileSize * 1.5) {
                            this.startDefusingBomb();
                        }
                    }
                }
                
                // Stop planting/defusing if E key is released
                if (!this.keys.e) {
                    if (this.localPlayer.isPlanting) {
                        this.stopPlantingBomb();
                    }
                    if (this.localPlayer.isDefusing) {
                        this.stopDefusingBomb();
                    }
                }
                
                // Update planting progress using deltaTime
                if (this.localPlayer.isPlanting) {
                    this.localPlayer.plantingProgress += (deltaTime * 1000) / this.PLANTING_TIME;
                    
                    if (this.localPlayer.plantingProgress >= 1) {
                        this.finishPlantingBomb();
                    }
                }
                
                // Update defusing progress using deltaTime
                if (this.localPlayer.isDefusing) {
                    this.localPlayer.defusingProgress += (deltaTime * 1000) / this.DEFUSING_TIME;
                    
                    if (this.localPlayer.defusingProgress >= 1) {
                        this.finishDefusingBomb();
                    }
                }
            }
            
            // Update bomb timer if it's active
            if (this.bombExplodeTimeRemaining > 0) {
                this.bombExplodeTimeRemaining -= deltaTime;
                
                // Update UI with remaining time
                if (this.ui) {
                    const remainingMs = this.bombExplodeTimeRemaining * 1000;
                    this.ui.updateBombTimer(Date.now() + remainingMs);
                }
                
                // Check if bomb should explode
                if (this.bombExplodeTimeRemaining <= 0 && this.isHost) {
                    this.handleBombExplosion();
                }
            }
            
            // Check if player is near the bomb for UI indicator
            this.checkBombProximity();
            
            // Update player aim based on mouse position
            if (this.localPlayer && this.localPlayer.isAlive) {
                const aimChanged = this.localPlayer.updateAim(
                    this.mousePosition.x, 
                    this.mousePosition.y, 
                    this.camera
                );
                
                // If aim changed significantly, sync it with other players
                if (aimChanged && this.roomManager && this.roomManager.activeRoom) {
                    // Check if the method exists before calling it
                    if (typeof this.roomManager.synchronizeAim === 'function') {
                        this.roomManager.synchronizeAim();
                    } else {
                        console.warn('synchronizeAim method not found on roomManager');
                    }
                }
            }
            
            // Update combat manager
            if (this.combatManager) {
                this.combatManager.update();
            }
        } catch (error) {
            console.error('Error in game update:', error);
        }
    }

    // Check if player is near the bomb to show pickup indicator
    checkBombProximity() {
        if (!this.bombPosition || !this.localPlayer || !this.localPlayer.isAlive || 
            this.localPlayer.hasBomb || this.localPlayer.team !== 'red') {
            // Hide indicator if no bomb, player is dead, already has bomb, or not on red team
            if (this.ui) this.ui.showBombIndicator(false);
            return;
        }

        const bombDistance = Math.sqrt(
            Math.pow(this.localPlayer.x - this.bombPosition.x, 2) + 
            Math.pow(this.localPlayer.y - this.bombPosition.y, 2)
        );
        
        // Show indicator if player is close to bomb
        if (this.ui) {
            this.ui.showBombIndicator(bombDistance < 50);
        }
    }

    // Handle bomb pickup
    pickupBomb() {
        if (!this.bombPosition || this.localPlayer.hasBomb || this.localPlayer.team !== 'red') return;
        
        // Set bomb carrier
        this.localPlayer.hasBomb = true;
        
        // Update UI to show player has bomb
        if (this.ui) {
            this.ui.showBombIndicator(false);
            this.ui.showBombCarrierStatus(true);
        }
        
        // Clear bomb from ground
        this.bombPosition = null;
        
        // Sync with network
        if (this.roomManager && this.roomManager.activeRoom) {
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).update({
                carrierId: this.localPlayer.id,
                position: null,
                onGround: false,
                planted: false
            });
        }
        
        console.log('Bomb picked up by', this.localPlayer.id);
    }

    // Drop bomb (called when player dies)
    dropBomb(player) {
        if (!player.hasBomb) return;
        
        // Set bomb position to player position
        this.bombPosition = { x: player.x, y: player.y };
        
        // Player no longer has bomb
        player.hasBomb = false;
        
        // Update UI if it was local player
        if (player.id === this.localPlayer.id && this.ui) {
            this.ui.showBombCarrierStatus(false);
        }
        
        // Sync with network
        if (this.roomManager && this.roomManager.activeRoom) {
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).update({
                carrierId: null,
                position: this.bombPosition,
                onGround: true,
                planted: false
            });
        }
        
        console.log('Bomb dropped at', this.bombPosition);
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render game world through the renderer
        this.renderer.render();
        
        // Render combat visuals (bullet trails, hit markers)
        if (this.combatManager) {
            this.combatManager.render(this.ctx, this.camera);
        }
        
        // Render the bomb if it's on the ground
        if (this.bombPosition) {
            const bombX = this.bombPosition.x - this.camera.x;
            const bombY = this.bombPosition.y - this.camera.y;
            
            // Draw bomb
            this.ctx.fillStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.arc(bombX, bombY, 10, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw bomb outline
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(bombX, bombY, 12, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        // Render planted bomb
        if (this.plantedBombPosition) {
            const bombX = this.plantedBombPosition.x - this.camera.x;
            const bombY = this.plantedBombPosition.y - this.camera.y;
            
            // Draw planted bomb (larger and more visible)
            this.ctx.fillStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.arc(bombX, bombY, 15, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Animated pulsing effect
            const pulseSize = 20 + Math.sin(Date.now() / 200) * 5;
            this.ctx.strokeStyle = '#ff5500';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(bombX, bombY, pulseSize, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // Draw second pulsing circle
            const pulseSize2 = 30 + Math.sin(Date.now() / 200 + Math.PI) * 5;
            this.ctx.strokeStyle = 'rgba(255, 85, 0, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(bombX, bombY, pulseSize2, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        // Render planting/defusing progress if active
        if (this.localPlayer) {
            if (this.localPlayer.isPlanting) {
                this.renderProgressBar(
                    this.ctx.canvas.width / 2, 
                    this.ctx.canvas.height - 100,
                    200, 20, 
                    this.localPlayer.plantingProgress,
                    '#ff5500'
                );
            } else if (this.localPlayer.isDefusing) {
                this.renderProgressBar(
                    this.ctx.canvas.width / 2, 
                    this.ctx.canvas.height - 100,
                    200, 20, 
                    this.localPlayer.defusingProgress,
                    '#00aaff'
                );
            }
        }
    }
    
    // Reset player for new round
    resetPlayerForNewRound(player) {
        if (!player) return;
        
        // Skip if the player has already been reset in this round
        if (player._resetForCurrentRound) return;
        player._resetForCurrentRound = true;
        
        // Reset player state - keep weapons
        player.resetForNewRound(this.map);
        
        // Reset bomb state
        player.hasBomb = false;
        player.isPlanting = false;
        player.isDefusing = false;
        player.plantingProgress = 0;
        player.defusingProgress = 0;
        
        // Clear bomb timers
        if (this.bombTimer) {
            clearTimeout(this.bombTimer);
            this.bombTimer = null;
        }
        
        // Reset bomb positions
        this.bombPosition = null;
        this.plantedBombPosition = null;
        this.bombExplodeTimeRemaining = 0;
        
        // Check if player has any weapons, if not, give them the starter pistol
        this.ensurePlayerHasDefaultWeapon(player);
        
        // Reset bomb flags
        this.bombDefused = false;
        this.bombExploded = false;
    }
    
    // Handle round state changes
    handleRoundStateChange(newState) {
        if (newState === this.roundManager.STATES.PREP) {
            // Reset the reset flag for all players
            this.players.forEach(player => {
                player._resetForCurrentRound = false;
            });
            if (this.localPlayer) {
                this.localPlayer._resetForCurrentRound = false;
            }
            
            // Reset all players for new round
            this.players.forEach(player => {
                this.resetPlayerForNewRound(player);
            });
            
            // Reset local player
            this.resetPlayerForNewRound(this.localPlayer);
            
            // Reset bomb state when entering prep phase (new round)
            if (this.isHost && this.roomManager && this.roomManager.activeRoom) {
                // Reset bomb state in Firebase to ensure all clients have clean state
                this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).update({
                    planted: false,
                    defused: false,
                    exploded: false,
                    plantedPosition: null,
                    plantedTime: 0,
                    explodeTime: 0,
                    timerDuration: 0,
                    position: null,
                    carrierId: null
                });
            }
            
            // Always reset local bomb state
            this.plantedBombPosition = null;
            this.bombPlantedTime = 0;
            this.bombExplodeTime = 0;
            this.bombPosition = null;
            this.bombDefused = false;
            this.bombExploded = false;
            this.bombExplodeTimeRemaining = 0;
            
            // Clear any bomb timers
            if (this.bombTimer) {
                clearTimeout(this.bombTimer);
                this.bombTimer = null;
            }
            
            // Clear the bomb listener flag to ensure a fresh listener setup
            this._bombListenerSet = false;
            
            // Reset bomb UI
            if (this.ui) {
                this.ui.showBombTimer(false);
                this.ui.showBombCarrierStatus(false);
                this.ui.showPlantingProgress(false);
                this.ui.showDefusingProgress(false);
            }
            
            // Hide round end UI if it's showing
            if (this.ui) {
                this.ui.hideRoundEnd();
            }
            
            // Update match status UI
            if (this.ui) {
                this.ui.updateMatchStatus(
                    this.roundManager.teams,
                    this.roundManager.matchHistory
                );
            }
        } else if (newState === this.roundManager.STATES.ACTIVE) {
            // Start active phase - enable movement, hide buy menu
            console.log("Starting win condition checker in active phase");
            this.startWinConditionChecker();
        } else if (newState === this.roundManager.STATES.END) {
            console.log("Stopping win condition checker in end phase");
            // Stop checking win conditions
            this.stopWinConditionChecker();
            
            // Also reset bomb state at the end of a round (in case it wasn't reset by a win condition)
            if (this.isHost && this.roomManager && this.roomManager.activeRoom) {
                // Clean up bomb state in Firebase
                this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).update({
                    planted: false,
                    defused: false,
                    exploded: false,
                    plantedPosition: null,
                    plantedTime: 0,
                    explodeTime: 0,
                    position: null,
                    carrierId: null
                });
            }
            
            // Always clean up local bomb state
            this.plantedBombPosition = null;
            this.bombPlantedTime = 0;
            this.bombExplodeTime = 0;
            this.bombPosition = null;
            
            // Clear any bomb timers
            if (this.bombTimer) {
                clearTimeout(this.bombTimer);
                this.bombTimer = null;
            }
            
            // Reset bomb UI
            if (this.ui) {
                this.ui.showBombTimer(false);
            }
        }
    }

    // Start periodic win condition checking
    startWinConditionChecker() {
        // Clear any existing interval
        this.stopWinConditionChecker();
        
        // Check every 250ms for more responsive win detection
        this.winConditionInterval = setInterval(() => {
            if (this.roundManager) {
                this.roundManager.checkRoundWinConditions();
            }
        }, 250);
        
        console.log("Win condition checker started");
    }

    // Stop win condition checking
    stopWinConditionChecker() {
        if (this.winConditionInterval) {
            clearInterval(this.winConditionInterval);
            this.winConditionInterval = null;
        }
    }

    // Start planting the bomb
    startPlantingBomb() {
        if (!this.localPlayer.hasBomb || 
            this.localPlayer.isPlanting || 
            this.localPlayer.team !== 'red' ||
            this.roundManager.currentState !== this.roundManager.STATES.ACTIVE) {
            return;
        }
        
        // Start planting process
        this.localPlayer.isPlanting = true;
        this.localPlayer.plantingProgress = 0;
        
        // Sync with network
        if (this.roomManager && this.roomManager.activeRoom) {
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/players/${this.localPlayer.id}`).update({
                isPlanting: true
            });
        }
        
        // Update UI
        if (this.ui) {
            this.ui.showPlantingProgress(true);
        }
        
        console.log('Started planting bomb');
    }

    // Stop planting the bomb (called when interrupted)
    stopPlantingBomb() {
        if (!this.localPlayer.isPlanting) return;
        
        // Stop planting process
        this.localPlayer.isPlanting = false;
        this.localPlayer.plantingProgress = 0;
        
        // Sync with network
        if (this.roomManager && this.roomManager.activeRoom) {
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/players/${this.localPlayer.id}`).update({
                isPlanting: false
            });
        }
        
        // Update UI
        if (this.ui) {
            this.ui.showPlantingProgress(false);
        }
        
        console.log('Stopped planting bomb');
    }

    // Finish planting the bomb
    finishPlantingBomb() {
        if (!this.localPlayer.isPlanting) return;
        
        // Complete planting process
        this.localPlayer.isPlanting = false;
        this.localPlayer.hasBomb = false;
        this.plantedBombPosition = { x: this.localPlayer.x, y: this.localPlayer.y };
        
        // Only host sets the timer values directly to avoid conflicts
        if (this.isHost) {
            this.bombPlantedTime = Date.now();
            this.bombExplodeTime = this.bombPlantedTime + this.BOMB_EXPLOSION_TIME;
        }
        
        // Update UI
        if (this.ui) {
            this.ui.showPlantingProgress(false);
            this.ui.showBombCarrierStatus(false);
        }
        
        // Award planting bonus
        if (this.roundManager) {
            this.roundManager.awardMoneyToPlayer(this.localPlayer.id, 100, "Bomb Plant");
        }
        
        // Sync with network
        if (this.roomManager && this.roomManager.activeRoom) {
            // Update bomb data
            const bombUpdate = {
                carrierId: null,
                position: null,
                planted: true,
                plantedPosition: this.plantedBombPosition,
                plantedBy: this.localPlayer.id
            };
            
            // Only host adds time values
            if (this.isHost) {
                bombUpdate.plantedTime = this.bombPlantedTime;
                bombUpdate.explodeTime = this.bombExplodeTime;
            }
            
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).update(bombUpdate);
            
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/players/${this.localPlayer.id}`).update({
                isPlanting: false,
                hasBomb: false
            });
        }
        
        console.log('Bomb planted at', this.plantedBombPosition);
        
        // Start explosion timer - only call once to avoid double timer issues
        this.startBombTimer();
    }

    // Start the bomb explosion timer
    startBombTimer() {
        // Clear any existing timer first
        if (this.bombTimer) {
            clearTimeout(this.bombTimer);
            this.bombTimer = null;
        }
        
        // Calculate time until explosion
        const BOMB_TIMER_DURATION = this.BOMB_EXPLOSION_TIME || 45000; // 45 seconds default
        
        // Only the host should set the bomb timer to avoid conflicts
        if (this.isHost) {
            // Set these values on host
            this.bombPlantedTime = Date.now();
            this.bombExplodeTime = this.bombPlantedTime + BOMB_TIMER_DURATION;
            
            // Sync bomb state with network
            if (this.roomManager && this.roomManager.activeRoom) {
                const bombUpdate = {
                    planted: true,
                    plantedTime: this.bombPlantedTime,
                    explodeTime: this.bombExplodeTime,
                    timerDuration: BOMB_TIMER_DURATION,
                    exploded: false,
                    defused: false
                };
                
                // Make sure we have the planted position
                if (this.plantedBombPosition) {
                    bombUpdate.plantedPosition = this.plantedBombPosition;
                }
                
                this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).update(bombUpdate);
            }
            
            // Also set the remaining time for the host
            this.bombExplodeTimeRemaining = BOMB_TIMER_DURATION / 1000; // Convert to seconds
        } else {
            // For client, we'll wait for the Firebase update to get the host values
            // But we can preset the UI to avoid a flash of no timer
            if (this.ui) {
                this.ui.showBombTimer(true, Date.now() + BOMB_TIMER_DURATION);
            }
        }
    }

    // Start defusing the bomb
    startDefusingBomb() {
        if (!this.plantedBombPosition || 
            this.localPlayer.isDefusing || 
            this.localPlayer.team !== 'blue' ||
            this.roundManager.currentState !== this.roundManager.STATES.ACTIVE) {
            return;
        }
        
        // Check if player is close enough to the bomb
        const bombDistance = Math.sqrt(
            Math.pow(this.localPlayer.x - this.plantedBombPosition.x, 2) + 
            Math.pow(this.localPlayer.y - this.plantedBombPosition.y, 2)
        );
        
        if (bombDistance > this.map.tileSize * 1.5) {
            return;
        }
        
        // Start defusing process
        this.localPlayer.isDefusing = true;
        this.localPlayer.defusingProgress = 0;
        
        // Sync with network
        if (this.roomManager && this.roomManager.activeRoom) {
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/players/${this.localPlayer.id}`).update({
                isDefusing: true
            });
        }
        
        // Update UI
        if (this.ui) {
            this.ui.showDefusingProgress(true);
        }
        
        console.log('Started defusing bomb');
    }

    // Stop defusing the bomb (called when interrupted)
    stopDefusingBomb() {
        if (!this.localPlayer.isDefusing) return;
        
        // Stop defusing process
        this.localPlayer.isDefusing = false;
        this.localPlayer.defusingProgress = 0;
        
        // Sync with network
        if (this.roomManager && this.roomManager.activeRoom) {
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/players/${this.localPlayer.id}`).update({
                isDefusing: false
            });
        }
        
        // Update UI
        if (this.ui) {
            this.ui.showDefusingProgress(false);
        }
        
        console.log('Stopped defusing bomb');
    }

    // Finish defusing the bomb
    finishDefusingBomb() {
        // Clear the interval
        if (this.defusingInterval) {
            clearInterval(this.defusingInterval);
            this.defusingInterval = null;
        }
        
        // Check if the local player exists and is defusing
        if (!this.localPlayer || !this.localPlayer.isDefusing) return;
        
        console.log("Bomb defused");
        
        // Award defuse bonus
        if (this.roundManager) {
            this.roundManager.awardMoneyToPlayer(this.localPlayer.id, 300, "Bomb Defuse");
        }
        
        // Update local player state
        this.localPlayer.isDefusing = false;
        
        // Hide defusing UI
        if (this.ui) {
            this.ui.showDefusingProgress(false);
        }
        
        // Stop the bomb timer
        if (this.bombTimer) {
            clearTimeout(this.bombTimer);
            this.bombTimer = null;
        }
        
        // Update bomb state
        this.plantedBombPosition = null;
        this.bombPlantedTime = 0;
        this.bombExplodeTime = 0;
        this.bombExplodeTimeRemaining = 0;
        
        // Hide the timer
        if (this.ui) {
            this.ui.showBombTimer(false);
        }
        
        // Set a flag to indicate the bomb was defused
        this.bombDefused = true;
        this.bombExploded = false;
        
        // Update bomb state in Firebase to ensure all clients know it was defused
        if (this.roomManager && this.roomManager.activeRoom) {
            // First update the bomb state
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).update({
                planted: false,
                defused: true,
                defusedBy: this.localPlayer.id,
                defusedTime: Date.now(),
                // Make sure timer values are reset to prevent timer desync
                plantedTime: 0,
                explodeTime: 0,
                timerDuration: 0
            });
            
            // Update round state to end the round with defenders winning
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/round`).update({
                state: this.roundManager.STATES.END,
                winningTeam: "blue", // Since defenders (blue team) win when bomb is defused
                winCondition: "bomb_defused",
                stateEndTime: Date.now() + this.roomManager.TIMER.END
            });
        }
        
        // End the round in favor of defenders
        if (this.roundManager) {
            this.roundManager.endRound('blue', 'bomb_defused');
        }
    }

    // Add a method to handle the BOMB_DEFUSED event from other players
    handleBombDefusedEvent(data) {
        // Stop any bomb timers
        if (this.bombTimer) {
            clearTimeout(this.bombTimer);
            this.bombTimer = null;
        }
        
        // Update bomb state
        this.plantedBombPosition = null;
        this.bombPlantedTime = 0;
        this.bombExplodeTime = 0;
        
        // Hide the timer
        if (this.ui) {
            this.ui.showBombTimer(false);
        }
        
        // End the round if we're the host
        if (this.isHost && this.roundManager) {
            this.roundManager.endRound('blue', 'bomb_defused');
        }
    }

    // Helper to render progress bars
    renderProgressBar(x, y, width, height, progress, color) {
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(x - width/2, y - height/2, width, height);
        
        // Progress fill
        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            x - width/2, 
            y - height/2, 
            width * Math.min(1, progress), 
            height
        );
        
        // Border
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - width/2, y - height/2, width, height);
    }

    // Add a method to show temporary messages
    showTemporaryMessage(message, duration = 2000) {
        if (!this.ui) return;
        
        // Create or get the message element
        if (!this.ui.tempMessage) {
            this.ui.tempMessage = document.createElement('div');
            this.ui.tempMessage.className = 'temp-message';
            this.ui.tempMessage.style.cssText = `
                position: absolute;
                top: 100px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                font-weight: bold;
                z-index: 200;
                display: none;
            `;
            document.body.appendChild(this.ui.tempMessage);
        }
        
        // Set message and show
        this.ui.tempMessage.textContent = message;
        this.ui.tempMessage.style.display = 'block';
        
        // Clear any existing timeout
        if (this.ui.tempMessageTimeout) {
            clearTimeout(this.ui.tempMessageTimeout);
        }
        
        // Hide after duration
        this.ui.tempMessageTimeout = setTimeout(() => {
            this.ui.tempMessage.style.display = 'none';
        }, duration);
    }

    // Add this method to handle bomb explosion
    handleBombExplosion() {
        console.log("Bomb exploded!");
        
        // Clear the bomb timer
        if (this.bombTimer) {
            clearTimeout(this.bombTimer);
            this.bombTimer = null;
        }
        
        // Clear bomb state
        this.bombPosition = null;
        this.plantedBombPosition = null;
        this.bombPlantedTime = 0;
        this.bombExplodeTime = 0;
        this.bombDefused = false;
        this.bombExploded = true;
        
        // Hide bomb timer UI
        if (this.ui) {
            this.ui.showBombTimer(false);
        }
        
        // Update bomb state in Firebase
        if (this.roomManager && this.roomManager.activeRoom) {
            // First update the bomb state
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/bomb`).update({
                planted: false,
                exploded: true,
                explodedTime: Date.now(),
                position: null,
                plantedTime: 0,
                explodeTime: 0
            });
            
            // Then update the round state to end the round
            this.roomManager.database.ref(`rooms/${this.roomManager.activeRoom}/round`).update({
                state: this.roundManager.STATES.END,
                winningTeam: "red", // Attackers win when bomb explodes
                winCondition: "bomb_exploded",
                stateEndTime: Date.now() + this.roundManager.TIMER.END
            });
        }
        
        // End the round in favor of attackers
        if (this.roundManager) {
            this.roundManager.endRound('red', 'bomb_exploded');
        }
    }

    // New method to apply user settings
    applyUserSettings() {
        if (!this.userManager || !this.raycastEngine) return;
        
        // Get performance settings
        const perfSettings = this.userManager.getPerformanceSettings();
        if (perfSettings) {
            this.raycastEngine.maxDistance = perfSettings.maxDistance;
            this.raycastEngine.rayCount = perfSettings.rayCount;
            
            const settings = this.userManager.getSettings();
            this.raycastEngine.setAdaptiveRayCount(settings.adaptiveRayCount);
        }
    }

    // Listen for money changes
    setupRoomListeners() {
        // Listen for money changes
        const moneyRef = this.database.ref(`rooms/${this.roomManager.activeRoom}/moneyEvents`);
        moneyRef.on('child_added', (snapshot) => {
            const moneyEvent = snapshot.val();
            if (!moneyEvent || moneyEvent.playerId !== this.localPlayer.id) return;
            
            // Show notification for the money change
            if (this.ui) {
                this.ui.showMoneyChangeNotification(moneyEvent.amount, moneyEvent.reason);
            }
            
            // Remove the event after processing
            snapshot.ref.remove();
        });
    }

    // New method to ensure player always has a weapon
    ensurePlayerHasDefaultWeapon(player) {
        if (!player) return;
        
        // Check if player has any equipment
        if (!player.equipment || player.equipment.length === 0) {
            // Give them the starter pistol
            if (this.combatManager) {
                this.combatManager.giveWeapon(player, 'STARTER_PISTOL');
            }
        }
    }
}

// Make Game globally available
window.Game = Game; 
