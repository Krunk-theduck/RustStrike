export class UIManager {
    constructor(game) {
        this.game = game;
        this.currentScreen = null;
        this.screens = {
            main: document.getElementById('main-menu'),
            game: document.getElementById('game-container'),
            settings: document.getElementById('settings-menu'),
            roomJoin: document.getElementById('room-join')
        };
        
        // UI elements for round and match status
        this.roundIndicators = [];
        this.roundEndScreen = null;
        
        // Create match status UI
        this.createMatchStatusUI();
    }

    showScreen(screenName) {
        // Hide all screens
        Object.values(this.screens).forEach(screen => {
            if (screen) screen.classList.add('hidden');
        });

        // Show requested screen
        const screen = this.screens[screenName];
        if (screen) {
            screen.classList.remove('hidden');
            this.currentScreen = screenName;
        }
        
        // Update match status when showing game screen
        if (screenName === 'game' && this.game.roundManager) {
            this.updateMatchStatus(
                this.game.roundManager.teams,
                this.game.roundManager.matchHistory
            );
        }
    }

    init() {
        this.setupEventListeners();
        this.showScreen('main');
    }

    setupEventListeners() {
        // Host Game button
        document.getElementById('host-game').addEventListener('click', () => {
            this.createRoom();
        });

        // Join Game button
        document.getElementById('join-game').addEventListener('click', () => {
            this.showScreen('roomJoin');
        });

        // Settings button
        document.getElementById('settings-button').addEventListener('click', () => {
            this.showScreen('settings');
        });

        // Join Room form
        document.getElementById('join-room-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const code = document.getElementById('room-code').value;
            this.joinRoom(code);
        });

        // Exit Game button
        document.querySelectorAll('.back-button').forEach(button => {
            button.addEventListener('click', async () => {
                if (this.currentScreen === 'game') {
                    // If we're in game, properly leave the room first
                    await this.game.roomManager.leaveRoom();
                }
                this.showScreen('main');
            });
        });
    }

    async createRoom() {
        try {
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await this.game.startGame(roomCode, true);
            this.showScreen('game');
            
            // Show room code to host
            alert(`Your room code is: ${roomCode}`);
        } catch (error) {
            alert('Failed to create room: ' + error.message);
            this.showScreen('main');
        }
    }

    async joinRoom(roomCode) {
        try {
            await this.game.startGame(roomCode, false);
            this.showScreen('game');
        } catch (error) {
            alert('Failed to join room: ' + error.message);
            this.showScreen('main');
        }
    }

    // Create the match status UI elements
    createMatchStatusUI() {
        // Create container for round indicators
        const statusContainer = document.createElement('div');
        statusContainer.id = 'match-status';
        statusContainer.className = 'match-status-container';
        statusContainer.style.cssText = `
            position: absolute;
            top: 65px; /* Move down below the round phase display */
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            padding: 5px 15px;
            background-color: rgba(0, 0, 0, 0.7);
            border-radius: 20px;
            z-index: 100;
        `;
        
        // Create team score displays
        const redScore = document.createElement('div');
        redScore.id = 'red-team-score';
        redScore.className = 'team-score red';
        redScore.innerHTML = '0';
        redScore.style.cssText = `
            color: #ff5555;
            font-size: 24px;
            font-weight: bold;
            padding: 0 10px;
        `;
        
        const blueScore = document.createElement('div');
        blueScore.id = 'blue-team-score';
        blueScore.className = 'team-score blue';
        blueScore.innerHTML = '0';
        blueScore.style.cssText = `
            color: #5555ff;
            font-size: 24px;
            font-weight: bold;
            padding: 0 10px;
        `;
        
        // Create round indicators container
        const indicatorsContainer = document.createElement('div');
        indicatorsContainer.id = 'round-indicators';
        indicatorsContainer.className = 'round-indicators';
        indicatorsContainer.style.cssText = `
            display: flex;
            gap: 5px;
            padding: 0 10px;
        `;
        
        // Create indicators for each round
        const maxRounds = this.game.roundManager ? 
                          this.game.roundManager.MATCH_SETTINGS.MAX_ROUNDS : 12;
        
        for (let i = 0; i < maxRounds; i++) {
            const indicator = document.createElement('div');
            indicator.className = 'round-indicator';
            indicator.dataset.round = i + 1;
            indicator.style.cssText = `
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: #333;
                border: 2px solid #555;
            `;
            
            indicatorsContainer.appendChild(indicator);
            this.roundIndicators.push(indicator);
        }
        
        // Add elements to container
        statusContainer.appendChild(redScore);
        statusContainer.appendChild(indicatorsContainer);
        statusContainer.appendChild(blueScore);
        
        // Add to game screen
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            gameContainer.appendChild(statusContainer);
        }
        
        // Hide initially
        statusContainer.style.display = 'none';
        
        // Create bomb pickup indicator
        this.bombIndicator = document.createElement('div');
        this.bombIndicator.id = 'bomb-indicator';
        this.bombIndicator.className = 'bomb-indicator';
        this.bombIndicator.textContent = 'Press E to pick up the bomb';
        this.bombIndicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(255, 50, 50, 0.8);
            color: white;
            font-weight: bold;
            padding: 10px 20px;
            border-radius: 5px;
            display: none;
            z-index: 150;
        `;
        document.body.appendChild(this.bombIndicator);
        
        // Create bomb planted indicator and timer
        this.bombTimer = document.createElement('div');
        this.bombTimer.id = 'bomb-timer';
        this.bombTimer.className = 'bomb-timer';
        this.bombTimer.style.cssText = `
            position: absolute;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(255, 0, 0, 0.8);
            color: white;
            font-size: 24px;
            font-weight: bold;
            padding: 10px 20px;
            border-radius: 5px;
            display: none;
            z-index: 150;
        `;
        document.body.appendChild(this.bombTimer);
    }

    // Update match status UI
    updateMatchStatus(teams, matchHistory) {
        const statusContainer = document.getElementById('match-status');
        if (!statusContainer) return;
        
        // Show the status container
        statusContainer.style.display = 'flex';
        
        // Update team scores
        const redScore = document.getElementById('red-team-score');
        const blueScore = document.getElementById('blue-team-score');
        
        if (redScore && teams.red) redScore.innerHTML = teams.red.score || 0;
        if (blueScore && teams.blue) blueScore.innerHTML = teams.blue.score || 0;
        
        // Update round indicators
        if (matchHistory && matchHistory.length > 0) {
            matchHistory.forEach((round, index) => {
                if (index < this.roundIndicators.length) {
                    const indicator = this.roundIndicators[index];
                    
                    // Set color based on winner
                    if (round.winner === 'red') {
                        indicator.style.backgroundColor = '#ff5555';
                        indicator.style.borderColor = '#ff2222';
                    } else if (round.winner === 'blue') {
                        indicator.style.backgroundColor = '#5555ff';
                        indicator.style.borderColor = '#2222ff';
                    }
                }
            });
        }
    }

    // Show round end UI
    showRoundEnd(winningTeam, winCondition, teams, matchWinner) {
        // Remove existing if present
        this.hideRoundEnd();
        
        // Create round end screen
        const roundEnd = document.createElement('div');
        roundEnd.id = 'round-end-screen';
        roundEnd.className = 'round-end-screen';
        roundEnd.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 60%;
            padding: 20px;
            background-color: rgba(0, 0, 0, 0.85);
            border-radius: 10px;
            text-align: center;
            z-index: 200;
            color: white;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        `;
        
        // Header content based on whether it's a round or match end
        if (matchWinner) {
            // Match end
            const headerColor = matchWinner === 'red' ? '#ff5555' : '#5555ff';
            const matchEndHeader = document.createElement('h1');
            matchEndHeader.style.cssText = `
                font-size: 36px;
                margin-bottom: 20px;
                color: ${headerColor};
            `;
            
            matchEndHeader.innerHTML = matchWinner === 'red' ? 
                'ATTACKERS WIN THE MATCH!' : 'DEFENDERS WIN THE MATCH!';
            
            roundEnd.appendChild(matchEndHeader);
        } else {
            // Round end - Add a clear header for the round results
            const headerColor = winningTeam === 'red' ? '#ff5555' : '#5555ff';
            const roundEndHeader = document.createElement('h1');
            roundEndHeader.style.cssText = `
                font-size: 32px;
                margin-bottom: 20px;
                color: ${headerColor};
                text-shadow: 0 0 8px ${headerColor}40;
            `;
            
            // Use proper team names in header
            roundEndHeader.innerHTML = winningTeam === 'red' ? 
                'ATTACKERS WIN THE ROUND!' : 'DEFENDERS WIN THE ROUND!';
            
            roundEnd.appendChild(roundEndHeader);
            
            // Add win condition explanation
            const winConditionText = document.createElement('h2');
            winConditionText.style.cssText = `
                font-size: 24px;
                margin-bottom: 15px;
                color: #cccccc;
            `;
            
            // Map win condition to user-friendly text
            let conditionText = 'All enemies eliminated';
            if (winCondition === 'bomb_planted') {
                conditionText = 'Bomb successfully detonated';
            } else if (winCondition === 'bomb_defused') {
                conditionText = 'Bomb successfully defused';
            } else if (winCondition === 'time_expired') {
                conditionText = 'Time ran out - Defenders win';
            }
            
            winConditionText.innerHTML = `Win Condition: ${conditionText}`;
            roundEnd.appendChild(winConditionText);
        }
        
        // Show team scores
        const scoreContainer = document.createElement('div');
        scoreContainer.style.cssText = `
            display: flex;
            justify-content: space-around;
            margin: 20px 0;
            padding: 15px;
            background-color: rgba(40, 40, 40, 0.7);
            border-radius: 8px;
        `;
        
        // Make sure teams object exists before trying to access it
        if (teams) {
            // Get proper team names and scores based on the actual team structure
            const attackersTeam = teams.red || teams.attackers;
            const defendersTeam = teams.blue || teams.defenders;
            
            // Add scores for attackers
            const attackerScoreDiv = document.createElement('div');
            attackerScoreDiv.style.cssText = `
                font-size: 28px;
                font-weight: bold;
                color: #ff5555;
            `;
            attackerScoreDiv.innerHTML = `ATTACKERS: ${attackersTeam?.score || 0}`;
            
            // Add scores for defenders
            const defenderScoreDiv = document.createElement('div');
            defenderScoreDiv.style.cssText = `
                font-size: 28px;
                font-weight: bold;
                color: #5555ff;
            `;
            defenderScoreDiv.innerHTML = `DEFENDERS: ${defendersTeam?.score || 0}`;
            
            scoreContainer.appendChild(attackerScoreDiv);
            scoreContainer.appendChild(defenderScoreDiv);
            roundEnd.appendChild(scoreContainer);
        } else {
            console.error('Teams data missing in showRoundEnd');
        }
        
        // No continue button - will auto-hide when round phase ends
        
        // Store the reference to the element
        this.roundEndScreen = roundEnd;
        
        // Add to document
        document.body.appendChild(roundEnd);
        
        // Log for debugging
        console.log(`Round end screen shown: Winner=${winningTeam}, Condition=${winCondition}`, teams);
    }

    // Hide round end UI
    hideRoundEnd() {
        const existingScreen = document.getElementById('round-end-screen');
        if (existingScreen) {
            existingScreen.parentNode.removeChild(existingScreen);
        }
        this.roundEndScreen = null;
    }

    // Add a method to show/hide bomb indicator
    showBombIndicator(show) {
        if (this.bombIndicator) {
            this.bombIndicator.style.display = show ? 'block' : 'none';
        }
    }

    // Add method to show when player has bomb
    showBombCarrierStatus(show) {
        // Create the element if it doesn't exist
        if (!this.bombCarrierStatus) {
            this.bombCarrierStatus = document.createElement('div');
            this.bombCarrierStatus.id = 'bomb-carrier-status';
            this.bombCarrierStatus.className = 'bomb-carrier-status';
            this.bombCarrierStatus.textContent = 'YOU HAVE THE BOMB';
            this.bombCarrierStatus.style.cssText = `
                position: absolute;
                top: 80px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(255, 50, 50, 0.8);
                color: white;
                font-weight: bold;
                padding: 10px 20px;
                border-radius: 5px;
                z-index: 150;
            `;
            document.body.appendChild(this.bombCarrierStatus);
        }
        
        this.bombCarrierStatus.style.display = show ? 'block' : 'none';
    }

    // Show planting progress UI
    showPlantingProgress(show) {
        if (!this.plantingStatus) {
            this.plantingStatus = document.createElement('div');
            this.plantingStatus.id = 'planting-status';
            this.plantingStatus.className = 'action-status';
            this.plantingStatus.textContent = 'PLANTING BOMB...';
            this.plantingStatus.style.cssText = `
                position: absolute;
                bottom: 120px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(255, 85, 0, 0.8);
                color: white;
                font-weight: bold;
                padding: 10px 20px;
                border-radius: 5px;
                z-index: 150;
            `;
            document.body.appendChild(this.plantingStatus);
        }
        
        this.plantingStatus.style.display = show ? 'block' : 'none';
    }

    // Show defusing progress UI
    showDefusingProgress(show) {
        if (!this.defusingStatus) {
            this.defusingStatus = document.createElement('div');
            this.defusingStatus.id = 'defusing-status';
            this.defusingStatus.className = 'action-status';
            this.defusingStatus.textContent = 'DEFUSING BOMB...';
            this.defusingStatus.style.cssText = `
                position: absolute;
                bottom: 120px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(0, 170, 255, 0.8);
                color: white;
                font-weight: bold;
                padding: 10px 20px;
                border-radius: 5px;
                z-index: 150;
            `;
            document.body.appendChild(this.defusingStatus);
        }
        
        this.defusingStatus.style.display = show ? 'block' : 'none';
    }

    // Show bomb timer
    showBombTimer(show, explodeTime) {
        if (!this.bombTimer) return;
        
        if (show && explodeTime) {
            this.bombTimer.style.display = 'block';
            
            // Start updating the timer
            this.bombTimerInterval = setInterval(() => {
                const timeLeft = Math.max(0, Math.ceil((explodeTime - Date.now()) / 1000));
                this.bombTimer.textContent = `BOMB: ${timeLeft}s`;
                
                // Make it flash faster as time runs out
                if (timeLeft <= 10) {
                    this.bombTimer.style.backgroundColor = timeLeft % 2 === 0 ? 
                        'rgba(255, 0, 0, 0.9)' : 'rgba(255, 255, 0, 0.9)';
                }
                
                // Stop when timer reaches zero
                if (timeLeft <= 0) {
                    clearInterval(this.bombTimerInterval);
                }
            }, 100);
        } else {
            this.bombTimer.style.display = 'none';
            
            // Clear the timer interval
            if (this.bombTimerInterval) {
                clearInterval(this.bombTimerInterval);
                this.bombTimerInterval = null;
            }
        }
    }
} 
