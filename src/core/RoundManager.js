export class RoundManager {
    constructor(game) {
        this.game = game;
        this.database = game.roomManager.database;
        this.activeRoom = null;
        
        // Round states
        this.STATES = {
            WAITING: 'waiting',   // Waiting for players
            PREP: 'prep',         // Preparation/buy phase
            ACTIVE: 'active',     // Active gameplay
            END: 'end'            // Round end
        };
        
        // Timer constants (in milliseconds)
        this.TIMER = {
            PREP: 10000,          // 10 seconds prep phase
            ACTIVE: 120000,       // 2 minutes active phase
            END: 5000,            // 5 seconds end phase
            PLANT: 3000,          // 3 seconds to plant
            DEFUSE: 5000,         // 5 seconds to defuse
            EXPLOSION: 40000      // 40 seconds until explosion
        };
        
        // Team roles
        this.TEAMS = {
            ATTACKERS: 'red',     // Red team are attackers (with bomb)
            DEFENDERS: 'blue'     // Blue team are defenders
        };
        
        // Current round data
        this.currentState = this.STATES.WAITING;
        this.roundNumber = 0;
        this.roundStartTime = 0;
        this.stateEndTime = 0;
        this.teams = {
            [this.TEAMS.ATTACKERS]: { score: 0 },
            [this.TEAMS.DEFENDERS]: { score: 0 }
        };
        this.bombState = {
            planted: false,
            position: null,
            plantTime: 0,
            timeLeft: 0
        };
        
        // Listeners
        this.stateTimer = null;
        this.roundListeners = new Map();
        
        // Match settings
        this.MATCH_SETTINGS = {
            ROUNDS_TO_WIN: 7,         // First team to win 7 rounds wins the match
            MAX_ROUNDS: 12,           // Maximum of 12 rounds before match ends
            TEAM_SWITCH_ROUNDS: 6,    // Switch teams after 6 rounds
            OVERTIME_ROUNDS: 2        // Play overtime rounds in sets of 2
        };
        
        // Match tracking
        this.matchHistory = [];       // Array of round results: {winner: 'red', score: {red: 3, blue: 2}}
        this.matchWinner = null;      // 'red', 'blue', or null if match ongoing
        
        // Round win conditions
        this.WIN_CONDITIONS = {
            ELIMINATION: 'elimination',      // All enemies eliminated
            BOMB_EXPLODED: 'bomb_exploded',  // Bomb successfully detonated  
            BOMB_DEFUSED: 'bomb_defused',    // Bomb successfully defused
            TIME_EXPIRED: 'time_expired'     // Time ran out (defenders win)
        };
    }
    
    // Initialize round system when room is created/joined
    init(roomCode) {
        this.activeRoom = roomCode;
        
        // If we're the host, initialize round data in Firebase
        if (this.game.isHost) {
            this.initializeRoundData();
        }
        
        // Set up listeners for round state changes
        this.setupRoundListeners();
    }
    
    // Set up initial round data in Firebase
    async initializeRoundData() {
        const roomRef = this.database.ref(`rooms/${this.activeRoom}`);
        
        try {
            await roomRef.child('round').set({
                state: this.STATES.WAITING,
                number: 0,
                stateEndTime: 0,
                teams: {
                    [this.TEAMS.ATTACKERS]: { score: 0 },
                    [this.TEAMS.DEFENDERS]: { score: 0 }
                },
                bombState: {
                    planted: false,
                    position: null,
                    plantTime: 0,
                    timeLeft: 0
                },
                matchHistory: [],
                matchWinner: null
            });
            
            console.log('Initialized round data in Firebase');
        } catch (error) {
            console.error('Error initializing round data:', error);
        }
    }
    
    // Listen for round state changes
    setupRoundListeners() {
        if (!this.activeRoom) return;
        
        const roundRef = this.database.ref(`rooms/${this.activeRoom}/round`);
        
        // Listen for state changes
        const stateListener = roundRef.on('value', (snapshot) => {
            const roundData = snapshot.val();
            if (!roundData) return;
            
            // Prevent processing the same state multiple times
            if (this.currentState === roundData.state && 
                this.roundNumber === roundData.number &&
                this.stateEndTime === roundData.stateEndTime) {
                return; // Skip if nothing meaningful has changed
            }
            
            // Update local round state
            this.currentState = roundData.state;
            this.roundNumber = roundData.number;
            this.stateEndTime = roundData.stateEndTime;
            
            // Update teams and match history if available
            if (roundData.teams) {
                this.teams = roundData.teams;
            }
            
            if (roundData.matchHistory) {
                this.matchHistory = roundData.matchHistory;
            }
            
            if (roundData.matchWinner !== undefined) {
                this.matchWinner = roundData.matchWinner;
            }
            
            // Update bomb state
            if (roundData.bombState) {
                this.bombState = roundData.bombState;
            }
            
            // Handle state change
            this.handleStateChange(this.currentState);
            
            console.log(`Round state updated: ${this.currentState}`);
            
            // If we entered END state, show the round end UI
            if (this.currentState === this.STATES.END && 
                this.matchHistory && 
                this.matchHistory.length > 0) {
                setTimeout(() => {
                    // Show round end UI with a slight delay
                    this.showRoundEndUI();
                }, 1000);
            }
        });
        
        this.roundListeners.set('state', stateListener);
        
        // Add bomb state listener
        if (this.activeRoom) {
            const bombRef = this.database.ref(`rooms/${this.activeRoom}/bomb`);
            const bombListener = bombRef.on('value', (snapshot) => {
                const bombData = snapshot.val();
                if (!bombData) return;
                
                // Update local bomb state
                if (bombData.onGround && bombData.position) {
                    // Bomb is on the ground
                    this.game.bombPosition = bombData.position;
                    this.game.plantedBombPosition = null;
                    
                    // Make sure no players think they have the bomb
                    this.game.players.forEach(player => player.hasBomb = false);
                    if (this.game.localPlayer) this.game.localPlayer.hasBomb = false;
                    
                    // Update UI
                    if (this.game.ui) {
                        this.game.ui.showBombCarrierStatus(false);
                        this.game.ui.showBombTimer(false);
                    }
                } else if (bombData.carrierId) {
                    // Someone has the bomb
                    this.game.bombPosition = null;
                    this.game.plantedBombPosition = null;
                    
                    // Update player states
                    let localPlayerHasBomb = false;
                    this.game.players.forEach(player => {
                        player.hasBomb = (player.id === bombData.carrierId);
                    });
                    
                    // Check if local player has bomb
                    if (this.game.localPlayer && this.game.localPlayer.id === bombData.carrierId) {
                        this.game.localPlayer.hasBomb = true;
                        localPlayerHasBomb = true;
                    }
                    
                    // Update UI for local player
                    if (this.game.ui) {
                        this.game.ui.showBombCarrierStatus(localPlayerHasBomb);
                        this.game.ui.showBombTimer(false);
                    }
                } else if (bombData.planted && bombData.plantedPosition) {
                    // Bomb is planted
                    this.game.bombPosition = null;
                    this.game.plantedBombPosition = bombData.plantedPosition;
                    this.game.bombPlantedTime = bombData.plantedTime;
                    this.game.bombExplodeTime = bombData.explodeTime;
                    
                    // Make sure no players think they have the bomb
                    this.game.players.forEach(player => player.hasBomb = false);
                    if (this.game.localPlayer) this.game.localPlayer.hasBomb = false;
                    
                    // Update UI
                    if (this.game.ui) {
                        this.game.ui.showBombCarrierStatus(false);
                        this.game.ui.showBombTimer(true, bombData.explodeTime);
                    }
                    
                    // Start explosion timer if not already running
                    if (!this.game.bombTimer) {
                        this.game.startBombTimer();
                    }
                } else {
                    // No bomb or reset
                    this.game.bombPosition = null;
                    this.game.plantedBombPosition = null;
                    
                    // Clear UI
                    if (this.game.ui) {
                        this.game.ui.showBombCarrierStatus(false);
                        this.game.ui.showBombTimer(false);
                    }
                    
                    // Clear bomb timer
                    if (this.game.bombTimer) {
                        clearTimeout(this.game.bombTimer);
                        this.game.bombTimer = null;
                    }
                }
            });
            
            this.roundListeners.set('bomb', bombListener);
        }
        
        // Listen for bomb carrier changes
        const bombCarrierRef = window.database.ref(`games/${this.activeRoom}/round/bombCarrier`);
        bombCarrierRef.on('value', (snapshot) => {
            const bombCarrierId = snapshot.val();
            
            if (bombCarrierId) {
                console.log('Bomb carrier updated via Firebase:', bombCarrierId);
                
                // Update the bomb carrier status for all players
                this.game.players.forEach(player => {
                    // Reset bomb status for all players
                    player.hasBomb = false;
                    
                    // Set it to true only for the carrier
                    if (player.id === bombCarrierId) {
                        player.hasBomb = true;
                        
                        // Update UI if this is the local player
                        if (this.game.localPlayer && player.id === this.game.localPlayer.id) {
                            console.log('Local player is now the bomb carrier');
                            if (this.game.ui) {
                                this.game.ui.showBombCarrierStatus(true);
                            }
                        }
                    }
                });
            }
        });
    }
    
    // Handle state transitions
    handleStateChange(newState) {
        // Clear any existing timers
        if (this.stateTimer) {
            clearTimeout(this.stateTimer);
            this.stateTimer = null;
        }
        
        switch (newState) {
            case this.STATES.WAITING:
                // Nothing special to do in waiting state
                break;
                
            case this.STATES.PREP:
                // Start prep phase - disable movement, show buy menu
                this.handlePrepPhase();
                break;
                
            case this.STATES.ACTIVE:
                // Start active phase - enable movement, hide buy menu
                this.handleActivePhase();
                break;
                
            case this.STATES.END:
                // End of round - show results, prepare for next round
                this.handleEndPhase();
                break;
        }
        
        // If we're the host, set up the next state transition timer
        if (this.game.isHost && newState !== this.STATES.WAITING) {
            this.setupNextStateTransition(newState);
        }
    }
    
    // Handle prep phase - disable movement, show buy menu
    handlePrepPhase() {
        // Disable player movement
        this.game.lockPlayerMovement = true;
        
        // Reset players for new round
        if (this.game.handleRoundStateChange) {
            this.game.handleRoundStateChange(this.STATES.PREP);
        }
        
        // Assign bomb to a random red team player
        this.assignBomb();
        
        console.log('Prep phase started - movement locked, buy menu should show');
    }
    
    // Assign bomb to a random player on the red team
    assignBomb() {
        // Find an alive attacker to receive the bomb
        const attackers = [];
        
        // Convert Map to array for filtering
        this.game.players.forEach(player => {
            if (player.team === 'red' && player.isAlive) {
                attackers.push(player);
            }
        });
        
        if (attackers.length === 0) {
            console.warn('No alive attackers to assign bomb to');
            return;
        }
        
        // Choose a random attacker to get the bomb
        const bombCarrier = attackers[Math.floor(Math.random() * attackers.length)];
        console.log('Assigned bomb to player:', bombCarrier.id);
        
        // Set the hasBomb property
        bombCarrier.hasBomb = true;
        
        // If this is the local player, update the UI
        if (this.game.localPlayer && bombCarrier.id === this.game.localPlayer.id) {
            console.log('Local player received the bomb');
            if (this.game.ui) {
                this.game.ui.showBombCarrierStatus(true);
            }
        }
        
        // Sync this change to Firebase directly instead of using sendGameEvent
        this.syncBombAssignment(bombCarrier.id);
    }
    
    // Add a new method to sync bomb assignment
    syncBombAssignment(playerId) {
        try {
            // Check if we have access to the database and roomCode
            if (window.database && this.activeRoom) {
                console.log('Syncing bomb assignment to player:', playerId);
                
                // Update the bomb carrier in the round data
                const gameRef = window.database.ref(`games/${this.activeRoom}/round`);
                gameRef.child('bombCarrier').set(playerId);
            } else {
                console.warn('Cannot sync bomb assignment - missing database or room code');
            }
        } catch (error) {
            console.error('Error syncing bomb assignment:', error);
        }
    }
    
    // Handle active phase - enable movement, hide buy menu
    handleActivePhase() {
        // Enable player movement
        this.game.lockPlayerMovement = false;
        
        // Hide buy menu (to be implemented)
        // this.game.ui.hideBuyMenu();
        
        console.log('Active phase started - movement enabled, buy menu should hide');
    }
    
    // Handle end phase - show results, prepare for next round
    handleEndPhase() {
        // Disable player movement
        this.game.lockPlayerMovement = true;
        
        // Show round end UI with results
        this.showRoundEndUI();
        
        console.log('End phase started - movement locked, showing results');
    }
    
    // Set up the next state transition (only called by host)
    setupNextStateTransition(currentState) {
        if (!this.game.isHost) return;
        
        const now = Date.now();
        let nextState;
        let stateDuration;
        
        switch (currentState) {
            case this.STATES.PREP:
                nextState = this.STATES.ACTIVE;
                stateDuration = this.TIMER.PREP;
                break;
                
            case this.STATES.ACTIVE:
                nextState = this.STATES.END;
                stateDuration = this.TIMER.ACTIVE;
                break;
                
            case this.STATES.END:
                nextState = this.STATES.PREP;
                stateDuration = this.TIMER.END;
                break;
                
            default:
                return;
        }
        
        // Calculate when the current state should end
        const stateEndTime = now + stateDuration;
        
        // Update the state end time in Firebase
        this.database.ref(`rooms/${this.activeRoom}/round/stateEndTime`)
            .set(stateEndTime);
        
        // Set up local timer for state transition
        this.stateTimer = setTimeout(() => {
            this.transitionToNextState(nextState);
        }, stateDuration);
        
        console.log(`Next state transition (${nextState}) scheduled in ${stateDuration}ms`);
    }
    
    // Transition to the next state (only called by host)
    async transitionToNextState(nextState) {
        if (!this.game.isHost) return;
        
        const roomRef = this.database.ref(`rooms/${this.activeRoom}/round`);
        
        try {
            // If transitioning from END to PREP, increment round number
            if (this.currentState === this.STATES.END && nextState === this.STATES.PREP) {
                await roomRef.update({
                    state: nextState,
                    number: this.roundNumber + 1
                });
                
                console.log(`Round ${this.roundNumber + 1} started`);
            } else {
                await roomRef.update({
                    state: nextState
                });
                
                console.log(`Transitioned to ${nextState} state`);
            }
        } catch (error) {
            console.error('Error transitioning to next state:', error);
        }
    }
    
    // Start the first round (called by host when game starts)
    startFirstRound() {
        if (!this.game.isHost) return;
        
        this.transitionToNextState(this.STATES.PREP);
        console.log('First round started');
    }
    
    // Enhanced debug method to debug player status
    debugPlayerStatus() {
        console.log("===== PLAYER STATUS DEBUG =====");
        
        // Check local player
        const localPlayer = this.game.localPlayer;
        if (localPlayer) {
            console.log(`Local Player: ID=${localPlayer.id}, Team=${localPlayer.team}, Health=${localPlayer.health}, Alive=${localPlayer.isAlive}`);
        } else {
            console.log("No local player found!");
        }
        
        // Check all remote players
        console.log("Remote Players:");
        let remoteCount = 0;
        
        this.game.players.forEach(player => {
            if (player !== localPlayer) {
                console.log(`- Player: ID=${player.id}, Team=${player.team}, Health=${player.health}, Alive=${player.isAlive}`);
                remoteCount++;
            }
        });
        
        if (remoteCount === 0) {
            console.log("No remote players found!");
        }
        
        // Log team counts
        const redCount = this.countAlivePlayers(this.TEAMS.ATTACKERS);
        const blueCount = this.countAlivePlayers(this.TEAMS.DEFENDERS);
        console.log(`Alive Players: Red=${redCount}, Blue=${blueCount}`);
        
        // Current round state
        console.log(`Current round state: ${this.currentState}`);
        
        console.log("===============================");
    }
    
    // Update checkRoundWinConditions to use our debugging
    checkRoundWinConditions() {
        // If round is not in ACTIVE state, don't check
        if (this.currentState !== this.STATES.ACTIVE) {
            return null;
        }
        
        this.debugPlayerStatus();
        
        // Check for team elimination
        const redTeamAlive = this.countAlivePlayers(this.TEAMS.ATTACKERS);
        const blueTeamAlive = this.countAlivePlayers(this.TEAMS.DEFENDERS);
        
        console.log(`Teams alive check - Attackers: ${redTeamAlive}, Defenders: ${blueTeamAlive}`);
        
        // If all attackers eliminated, defenders win
        if (redTeamAlive === 0 && blueTeamAlive > 0) {
            console.log("All attackers eliminated! Defenders win.");
            return this.endRound(this.TEAMS.DEFENDERS, this.WIN_CONDITIONS.ELIMINATION);
        }
        
        // If all defenders eliminated, attackers win
        if (blueTeamAlive === 0 && redTeamAlive > 0) {
            console.log("All defenders eliminated! Attackers win.");
            return this.endRound(this.TEAMS.ATTACKERS, this.WIN_CONDITIONS.ELIMINATION);
        }
        
        // Add bomb explosion check
        if (this.game.bombExplodeTime && Date.now() >= this.game.bombExplodeTime) {
            console.log("Bomb exploded! Attackers win.");
            return this.endRound(this.TEAMS.ATTACKERS, this.WIN_CONDITIONS.BOMB_EXPLODED);
        }
        
        // Add bomb defused check
        if (this.game.bombDefused) {
            console.log("Bomb defused! Defenders win.");
            return this.endRound(this.TEAMS.DEFENDERS, this.WIN_CONDITIONS.BOMB_DEFUSED);
        }
        
        // Check for time expiration if bomb is not planted
        if (!this.game.plantedBombPosition) {
            const now = Date.now();
            if (this.stateEndTime > 0 && now >= this.stateEndTime) {
                console.log("Round time expired! Defenders win.");
                return this.endRound(this.TEAMS.DEFENDERS, this.WIN_CONDITIONS.TIME_EXPIRED);
            }
        }
        
        // No win condition met yet
        return null;
    }
    
    // Count alive players on a team
    countAlivePlayers(team) {
        let count = 0;
        let playerList = [];
        
        // Count remote players
        this.game.players.forEach(player => {
            if (player.team === team) {
                if (player.isAlive) {
                    count++;
                    playerList.push(player.id + " (alive)");
                } else {
                    playerList.push(player.id + " (dead)");
                }
            }
        });
        
        // Check local player
        if (this.game.localPlayer && this.game.localPlayer.team === team) {
            if (this.game.localPlayer.isAlive) {
                count++;
                playerList.push(this.game.localPlayer.id + " (alive, local)");
            } else {
                playerList.push(this.game.localPlayer.id + " (dead, local)");
            }
        }
        
        console.log(`Team ${team} has ${count} alive players: ${playerList.join(', ')}`);
        return count;
    }
    
    // Handle round end
    endRound(winningTeam, winCondition) {
        // Only end the round if it's active
        if (this.currentState !== this.STATES.ACTIVE) return null;
        
        console.log(`Round ended: ${winningTeam} won by ${winCondition}`);
        
        // Clean up any bomb timers
        if (this.game.bombTimer) {
            clearTimeout(this.game.bombTimer);
            this.game.bombTimer = null;
        }
        
        // Update team scores
        this.teams[winningTeam].score += 1;
        
        // Record round history
        this.matchHistory.push({
            winner: winningTeam,
            condition: winCondition,
            score: {
                [this.TEAMS.ATTACKERS]: this.teams[this.TEAMS.ATTACKERS].score,
                [this.TEAMS.DEFENDERS]: this.teams[this.TEAMS.DEFENDERS].score
            }
        });
        
        // Check if match is over
        this.checkMatchEnd();
        
        // If host, sync data and transition to end state
        if (this.game.isHost) {
            this.syncRoundData();
            
            // Force transition to end state
            this.transitionToNextState(this.STATES.END);
        }
        
        // Return the winner info
        return {
            team: winningTeam,
            condition: winCondition
        };
    }
    
    // Check if match has ended
    checkMatchEnd() {
        const attackerScore = this.teams[this.TEAMS.ATTACKERS].score;
        const defenderScore = this.teams[this.TEAMS.DEFENDERS].score;
        
        // Check if either team has reached the win threshold
        if (attackerScore >= this.MATCH_SETTINGS.ROUNDS_TO_WIN) {
            this.matchWinner = this.TEAMS.ATTACKERS;
            return true;
        }
        
        if (defenderScore >= this.MATCH_SETTINGS.ROUNDS_TO_WIN) {
            this.matchWinner = this.TEAMS.DEFENDERS;
            return true;
        }
        
        // Check if max rounds reached and determine winner
        if (this.roundNumber >= this.MATCH_SETTINGS.MAX_ROUNDS) {
            if (attackerScore > defenderScore) {
                this.matchWinner = this.TEAMS.ATTACKERS;
            } else if (defenderScore > attackerScore) {
                this.matchWinner = this.TEAMS.DEFENDERS;
            } else {
                // It's a tie - implement overtime if desired
                this.matchWinner = 'tie';
            }
            return true;
        }
        
        return false;
    }
    
    // Sync round data to Firebase
    syncRoundData() {
        if (!this.activeRoom || !this.game.isHost) return;
        
        const roundRef = this.database.ref(`rooms/${this.activeRoom}/round`);
        
        roundRef.update({
            teams: this.teams,
            matchHistory: this.matchHistory,
            matchWinner: this.matchWinner
        });
    }
    
    // Show round end UI
    showRoundEndUI() {
        // Check if game and UI are available
        if (!this.game || !this.game.ui) {
            console.error('Cannot show round end UI - game or UI manager not available');
            return;
        }
        
        // Format teams object to include both attackers/defenders and red/blue references
        const formattedTeams = {
            red: this.teams.red || this.teams.attackers,
            blue: this.teams.blue || this.teams.defenders,
            attackers: this.teams.red || this.teams.attackers,
            defenders: this.teams.blue || this.teams.defenders
        };
        
        console.log('Showing round end UI:', {
            winningTeam: this.matchWinner,
            winCondition: this.WIN_CONDITIONS.ELIMINATION,
            teams: formattedTeams,
            matchWinner: this.matchWinner
        });
        
        // Get the last round's win condition
        let winCondition = this.WIN_CONDITIONS.ELIMINATION;
        if (this.matchHistory && this.matchHistory.length > 0) {
            const lastRound = this.matchHistory[this.matchHistory.length - 1];
            winCondition = lastRound.condition;
        }
        
        // Call UI manager to show round end screen with correct win condition
        this.game.ui.showRoundEnd(
            this.matchHistory[this.matchHistory.length - 1].winner,
            winCondition,
            formattedTeams,
            this.matchWinner
        );
    }
    
    // Clean up listeners when game ends
    cleanUp() {
        // Clear any timers
        if (this.stateTimer) {
            clearTimeout(this.stateTimer);
            this.stateTimer = null;
        }
        
        // Remove all listeners
        if (this.activeRoom) {
            const roundRef = this.database.ref(`rooms/${this.activeRoom}/round`);
            
            this.roundListeners.forEach((listener, key) => {
                roundRef.off('value', listener);
            });
            
            this.roundListeners.clear();
            
            // Make sure to remove bomb listeners too
            const bombRef = this.database.ref(`rooms/${this.activeRoom}/bomb`);
            if (this.roundListeners.has('bomb')) {
                bombRef.off('value', this.roundListeners.get('bomb'));
            }
        }
        
        this.activeRoom = null;
    }
}

// Make RoundManager globally available
window.RoundManager = RoundManager; 