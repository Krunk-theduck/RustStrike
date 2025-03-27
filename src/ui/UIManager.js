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
        
        // Buy menu
        this.buyMenuActive = false;
        this.buyMenuCategories = ['primary', 'secondary', 'equipment'];
        this.activeBuyCategory = 'primary';
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
        
        // Check if user is already logged in
        if (this.game.userManager.isLoggedIn() && localStorage.getItem('rustStrikeAutoLogin') === 'true') {
            // Apply user settings
            this.applyUserSettings();
            
            // Update settings UI with current values
            this.enhanceSettingsMenu();
            
            // Show main menu
            this.showScreen('main');
        } else {
            // Show login screen
            this.createLoginUI();
        }
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
            // Show creating game notification
            this.showNotification('Creating game...', 'info');
            
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await this.game.startGame(roomCode, true);
            this.showScreen('game');
            
            // Copy room code to clipboard and show success notification
            await navigator.clipboard.writeText(roomCode);
            this.showNotification(`Room code ${roomCode} copied to clipboard!`, 'success');
        } catch (error) {
            // Show error notification
            this.showNotification('Failed to create room: ' + error.message, 'error');
            this.showScreen('main');
        }
    }

    async joinRoom(roomCode) {
        try {
            // Show joining notification
            this.showNotification('Joining game...', 'info');
            
            await this.game.startGame(roomCode, false);
            this.showScreen('game');
        } catch (error) {
            // Show error notification
            this.showNotification('Failed to join room: ' + error.message, 'error');
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
            top: 120px;
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
                top: 170px;
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
        if (this.bombTimer.style.display == 'block' && show) return;
        
        if (show && explodeTime) {
            this.bombTimer.style.display = 'block';
            this.bombExplodeTime = explodeTime;
            
            this.bombTimer.textContent = `BOMB: ${this.timeLeft}s`;
            this.bombTimer.style.backgroundColor = this.timeLeft % 2 === 0 ? 
                        'rgba(255, 0, 0, 0.9)' : 'rgba(255, 255, 0, 0.9)';
        } else {
            this.bombTimer.style.display = 'none';
        }
    }

    // Add new method for notifications
    showNotification(message, type = 'info') {
        // Remove existing notification if present
        const existingNotification = document.getElementById('game-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.id = 'game-notification';
        notification.className = `game-notification ${type}`;
        notification.textContent = message;
        
        // Style based on type
        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            error: '#F44336'
        };
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            background-color: ${colors[type]};
            color: white;
            border-radius: 4px;
            z-index: 1000;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    createLoginUI() {
        // Create login form container
        const loginContainer = document.createElement('div');
        loginContainer.id = 'login-container';
        loginContainer.className = 'login-container';
        loginContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;
        
        // Create login form
        const loginForm = document.createElement('div');
        loginForm.className = 'login-form';
        loginForm.style.cssText = `
            background-color: #222;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            width: 300px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        `;
        
        // Add title
        const loginTitle = document.createElement('h2');
        loginTitle.textContent = 'Welcome to Rust Strike';
        loginTitle.style.cssText = `
            color: white;
            margin-bottom: 20px;
        `;
        
        // Add username input
        const usernameInput = document.createElement('input');
        usernameInput.type = 'text';
        usernameInput.id = 'login-username';
        usernameInput.placeholder = 'Enter a username';
        usernameInput.maxLength = 15;
        usernameInput.style.cssText = `
            padding: 10px;
            width: 100%;
            margin-bottom: 15px;
            border: none;
            border-radius: 5px;
            background-color: #333;
            color: white;
            box-sizing: border-box;
        `;
        
        // Add login button
        const loginButton = document.createElement('button');
        loginButton.id = 'login-button';
        loginButton.textContent = 'Play Game';
        loginButton.style.cssText = `
            padding: 10px 20px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            width: 100%;
        `;
        
        // Add autologin checkbox
        const autologinContainer = document.createElement('div');
        autologinContainer.style.cssText = `
            display: flex;
            align-items: center;
            margin-top: 15px;
            color: white;
        `;
        
        const autologinCheckbox = document.createElement('input');
        autologinCheckbox.type = 'checkbox';
        autologinCheckbox.id = 'autologin-checkbox';
        autologinCheckbox.checked = true;
        
        const autologinLabel = document.createElement('label');
        autologinLabel.htmlFor = 'autologin-checkbox';
        autologinLabel.textContent = 'Remember me';
        autologinLabel.style.marginLeft = '5px';
        
        autologinContainer.appendChild(autologinCheckbox);
        autologinContainer.appendChild(autologinLabel);
        
        // Add event listener for login button
        loginButton.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            if (username) {
                const success = this.game.userManager.login(username);
                if (success) {
                    // Store remember me preference
                    if (autologinCheckbox.checked) {
                        localStorage.setItem('rustStrikeAutoLogin', 'true');
                    } else {
                        localStorage.removeItem('rustStrikeAutoLogin');
                    }
                    
                    // Close login screen
                    document.body.removeChild(loginContainer);
                    
                    // Apply user settings
                    this.applyUserSettings();
                    
                    // Update settings UI
                    this.updateSettingsUI();
                    
                    // Show main menu
                    this.showScreen('main');
                }
            } else {
                usernameInput.style.borderColor = 'red';
                setTimeout(() => {
                    usernameInput.style.borderColor = '';
                }, 2000);
            }
        });
        
        // Add components to form
        loginForm.appendChild(loginTitle);
        loginForm.appendChild(usernameInput);
        loginForm.appendChild(loginButton);
        loginForm.appendChild(autologinContainer);
        
        // Add form to container
        loginContainer.appendChild(loginForm);
        
        // Add to body
        document.body.appendChild(loginContainer);
        
        // Auto-focus username input
        setTimeout(() => {
            usernameInput.focus();
        }, 100);
    }

    updateSettingsUI() {
        const settings = this.game.userManager.getSettings();
        
        // Update volume slider
        const volumeSlider = document.getElementById('volume');
        if (volumeSlider) volumeSlider.value = settings.volume;
        
        // Update sensitivity slider
        const sensitivitySlider = document.getElementById('sensitivity');
        if (sensitivitySlider) sensitivitySlider.value = settings.sensitivity;
        
        // Update performance dropdown
        const performanceDropdown = document.getElementById('performance-setting');
        if (performanceDropdown) performanceDropdown.value = settings.performance;
        
        // Update FPS counter checkbox
        const fpsCheckbox = document.getElementById('show-fps');
        if (fpsCheckbox) fpsCheckbox.checked = settings.showFps;
        
        // Update adaptive raycast checkbox
        const adaptiveRaycastCheckbox = document.getElementById('adaptive-raycast');
        if (adaptiveRaycastCheckbox) adaptiveRaycastCheckbox.checked = settings.adaptiveRayCount;
    }

    enhanceSettingsMenu() {
        const settingsContainer = document.querySelector('#settings-menu .menu-container');
        if (!settingsContainer) return;
        
        // Add current username display
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        userInfo.style.cssText = `
            margin-bottom: 20px;
            color: white;
            text-align: center;
        `;
        
        const username = this.game.userManager.getSettings().username;
        userInfo.innerHTML = `<h3>Logged in as: <span style="color: #4CAF50;">${username}</span></h3>`;
        
        // Create logout button
        const logoutButton = document.createElement('button');
        logoutButton.id = 'logout-button';
        logoutButton.textContent = 'Log Out';
        logoutButton.className = 'menu-button';
        logoutButton.style.cssText = `
            background-color: #f44336;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
        `;
        
        logoutButton.addEventListener('click', () => {
            this.game.userManager.logout();
            document.body.removeChild(document.getElementById('settings-menu'));
            this.init();
        });
        
        userInfo.appendChild(logoutButton);
        
        // Add new settings controls
        
        // Performance profile setting
        const performanceContainer = document.createElement('div');
        performanceContainer.className = 'setting-item';
        
        const performanceLabel = document.createElement('label');
        performanceLabel.htmlFor = 'performance-setting';
        performanceLabel.textContent = 'Performance Profile';
        
        const performanceDropdown = document.createElement('select');
        performanceDropdown.id = 'performance-setting';
        performanceDropdown.style.cssText = `
            padding: 8px;
            border-radius: 4px;
            background-color: #333;
            color: white;
            border: 1px solid #555;
        `;
        
        // Add options to dropdown
        const performanceOptions = [
            { value: 'low', label: 'Low (Best Performance)' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High (Default)' },
            { value: 'ultra', label: 'Ultra (Best Quality)' }
        ];
        
        performanceOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            performanceDropdown.appendChild(optionElement);
        });
        
        performanceContainer.appendChild(performanceLabel);
        performanceContainer.appendChild(performanceDropdown);
        
        // Show FPS counter option
        const fpsContainer = document.createElement('div');
        fpsContainer.className = 'setting-item checkbox-setting';
        
        const fpsCheckbox = document.createElement('input');
        fpsCheckbox.type = 'checkbox';
        fpsCheckbox.id = 'show-fps';
        
        const fpsLabel = document.createElement('label');
        fpsLabel.htmlFor = 'show-fps';
        fpsLabel.textContent = 'Show FPS Counter';
        
        fpsContainer.appendChild(fpsCheckbox);
        fpsContainer.appendChild(fpsLabel);
        
        // Adaptive raycast option
        const adaptiveContainer = document.createElement('div');
        adaptiveContainer.className = 'setting-item checkbox-setting';
        
        const adaptiveCheckbox = document.createElement('input');
        adaptiveCheckbox.type = 'checkbox';
        adaptiveCheckbox.id = 'adaptive-raycast';
        
        const adaptiveLabel = document.createElement('label');
        adaptiveLabel.htmlFor = 'adaptive-raycast';
        adaptiveLabel.textContent = 'Adaptive Raycasting (Auto-adjusts for performance)';
        
        adaptiveContainer.appendChild(adaptiveCheckbox);
        adaptiveContainer.appendChild(adaptiveLabel);
        
        // Save settings button
        const saveButton = document.createElement('button');
        saveButton.id = 'save-settings';
        saveButton.textContent = 'Save Settings';
        saveButton.className = 'menu-button';
        saveButton.style.marginTop = '20px';
        
        saveButton.addEventListener('click', () => {
            // Collect settings values
            const newSettings = {
                volume: parseInt(document.getElementById('volume').value),
                sensitivity: parseInt(document.getElementById('sensitivity').value),
                performance: document.getElementById('performance-setting').value,
                showFps: document.getElementById('show-fps').checked,
                adaptiveRayCount: document.getElementById('adaptive-raycast').checked
            };
            
            // Save settings
            this.game.userManager.updateSettings(newSettings);
            
            // Apply settings to game
            this.applyUserSettings();
            
            // Show saved notification
            this.showNotification('Settings saved successfully', 'success');
        });
        
        // Insert user info at the top
        settingsContainer.insertBefore(userInfo, settingsContainer.firstChild);
        
        // Add performance dropdown after existing settings
        const backButton = settingsContainer.querySelector('.back-button');
        settingsContainer.insertBefore(performanceContainer, backButton);
        settingsContainer.insertBefore(fpsContainer, backButton);
        settingsContainer.insertBefore(adaptiveContainer, backButton);
        settingsContainer.insertBefore(saveButton, backButton);
        
        // Update settings UI with current values
        this.updateSettingsUI();
    }

    // Apply user settings to the game
    applyUserSettings() {
        if (!this.game || !this.game.userManager) return;
        
        const settings = this.game.userManager.getSettings();
        
        // Apply performance settings
        if (this.game.raycastEngine) {
            const perfSettings = this.game.userManager.getPerformanceSettings();
            this.game.raycastEngine.maxDistance = perfSettings.maxDistance;
            this.game.raycastEngine.rayCount = perfSettings.rayCount;
            this.game.raycastEngine.setAdaptiveRayCount(settings.adaptiveRayCount);
        }
        
        // Apply other settings as needed
        // e.g. FPS counter, sensitivity, etc.
        this.showFpsCounter(settings.showFps);
    }

    // Add FPS counter display
    createFpsCounter() {
        const fpsCounter = document.createElement('div');
        fpsCounter.id = 'fps-counter';
        fpsCounter.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            background-color: rgba(0, 0, 0, 0.5);
            color: white;
            padding: 5px 10px;
            border-radius: 5px;
            font-family: monospace;
            z-index: 1000;
            display: none;
        `;
        document.body.appendChild(fpsCounter);
        
        let frameCount = 0;
        let lastTime = performance.now();
        
        const updateFps = () => {
            const now = performance.now();
            frameCount++;
            
            if (now - lastTime >= 1000) {
                const fps = Math.round((frameCount * 1000) / (now - lastTime));
                fpsCounter.textContent = `${fps} FPS`;
                frameCount = 0;
                lastTime = now;
            }
            
            requestAnimationFrame(updateFps);
        };
        
        updateFps();
        return fpsCounter;
    }

    showFpsCounter(show) {
        if (!this.fpsCounter) {
            this.fpsCounter = this.createFpsCounter();
        }
        
        this.fpsCounter.style.display = show ? 'block' : 'none';
    }

    // Create and show the buy menu
    createBuyMenu() {
        // Remove existing buy menu if present
        this.removeBuyMenu();
        
        // Create container
        const buyMenu = document.createElement('div');
        buyMenu.id = 'buy-menu';
        buyMenu.className = 'buy-menu';
        buyMenu.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 800px;
            height: 600px;
            background-color: rgba(0, 0, 0, 0.85);
            border: 2px solid #444;
            border-radius: 10px;
            color: white;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            padding: 20px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        `;
        
        // Create header with title and close button
        const header = document.createElement('div');
        header.className = 'buy-menu-header';
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 10px;
            border-bottom: 1px solid #444;
            margin-bottom: 15px;
        `;
        
        const title = document.createElement('h2');
        title.textContent = 'Weapon Shop';
        title.style.margin = '0';
        
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0 10px;
        `;
        closeButton.addEventListener('click', () => {
            this.toggleBuyMenu();
        });
        
        header.appendChild(title);
        header.appendChild(closeButton);
        
        // Create player info section (money, team)
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        playerInfo.style.cssText = `
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            padding: 10px;
            background-color: rgba(50, 50, 50, 0.5);
            border-radius: 5px;
        `;
        
        const teamColor = this.game.localPlayer.team === 'red' ? '#ff5555' : '#5555ff';
        const teamName = this.game.localPlayer.team === 'red' ? 'ATTACKERS' : 'DEFENDERS';
        
        playerInfo.innerHTML = `
            <div>Team: <span style="color: ${teamColor};">${teamName}</span></div>
            <div>Money: <span style="color: #4CAF50;">$${this.game.localPlayer.money}</span></div>
        `;
        
        // Create category tabs
        const tabs = document.createElement('div');
        tabs.className = 'buy-menu-tabs';
        tabs.style.cssText = `
            display: flex;
            margin-bottom: 15px;
            border-bottom: 1px solid #333;
        `;
        
        // Tab for each weapon category
        this.buyMenuCategories.forEach(category => {
            const tab = document.createElement('div');
            tab.className = `buy-menu-tab ${category === this.activeBuyCategory ? 'active' : ''}`;
            tab.dataset.category = category;
            
            // Format category name for display
            let displayName = category.charAt(0).toUpperCase() + category.slice(1);
            
            tab.style.cssText = `
                padding: 10px 20px;
                cursor: pointer;
                text-transform: uppercase;
                font-weight: ${category === this.activeBuyCategory ? 'bold' : 'normal'};
                color: ${category === this.activeBuyCategory ? '#4CAF50' : '#aaa'};
                border-bottom: 2px solid ${category === this.activeBuyCategory ? '#4CAF50' : 'transparent'};
            `;
            tab.textContent = displayName;
            
            tab.addEventListener('click', () => {
                this.switchBuyCategory(category);
            });
            
            tabs.appendChild(tab);
        });
        
        // Create weapons container
        const weaponsContainer = document.createElement('div');
        weaponsContainer.id = 'weapons-container';
        weaponsContainer.className = 'weapons-container';
        weaponsContainer.style.cssText = `
            flex: 1;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            overflow-y: auto;
            padding: 10px;
        `;
        
        // Create equipped weapon section
        const equippedSection = document.createElement('div');
        equippedSection.className = 'equipped-weapons';
        equippedSection.style.cssText = `
            margin-top: 15px;
            padding: 15px;
            background-color: rgba(50, 50, 50, 0.5);
            border-radius: 5px;
        `;
        
        const equippedTitle = document.createElement('h3');
        equippedTitle.textContent = 'Current Loadout';
        equippedTitle.style.margin = '0 0 10px 0';
        
        equippedSection.appendChild(equippedTitle);
        
        // Display current weapons
        const currentLoadout = document.createElement('div');
        currentLoadout.style.cssText = `
            display: flex;
            justify-content: space-between;
        `;
        
        // Get current weapons
        let primaryWeapon = "None";
        let secondaryWeapon = "None";
        
        if (this.game.localPlayer.equipment) {
            this.game.localPlayer.equipment.forEach(weapon => {
                if (weapon.type === 'primary') {
                    primaryWeapon = weapon.name;
                } else if (weapon.type === 'secondary') {
                    secondaryWeapon = weapon.name;
                }
            });
        }
        
        currentLoadout.innerHTML = `
            <div><strong>Primary:</strong> ${primaryWeapon}</div>
            <div><strong>Secondary:</strong> ${secondaryWeapon}</div>
        `;
        
        equippedSection.appendChild(currentLoadout);
        
        // Populate weapons container with weapons of active category
        this.populateWeapons(weaponsContainer);
        
        // Assemble the menu
        buyMenu.appendChild(header);
        buyMenu.appendChild(playerInfo);
        buyMenu.appendChild(tabs);
        buyMenu.appendChild(weaponsContainer);
        buyMenu.appendChild(equippedSection);
        
        // Add to document
        document.body.appendChild(buyMenu);
        
        // Store reference
        this.buyMenu = buyMenu;
    }

    // Populate weapons container with items for the selected category
    populateWeapons(container) {
        // Clear container
        container.innerHTML = '';
        
        // Get weapons of selected category from weapon catalog
        let weapons = [];
        
        if (this.activeBuyCategory === 'primary' || this.activeBuyCategory === 'secondary') {
            weapons = window.WeaponCatalog.getWeaponsByType(this.activeBuyCategory);
        } else if (this.activeBuyCategory === 'equipment') {
            // For future equipment items
            return;
        }
        
        // Create weapon cards
        weapons.forEach(weapon => {
            // Skip starter pistol from display if looking at secondaries - it's always available
            if (weapon.id === 'STARTER_PISTOL' && this.activeBuyCategory === 'secondary') {
                return;
            }
            
            const card = document.createElement('div');
            card.className = 'weapon-card';
            card.dataset.weaponId = weapon.id;
            
            // Set background color based on affordability
            const isAffordable = this.game.localPlayer.money >= weapon.cost;
            
            card.style.cssText = `
                background-color: rgba(40, 40, 40, 0.8);
                border: 1px solid ${isAffordable ? '#4CAF50' : '#666'};
                border-radius: 5px;
                padding: 15px;
                cursor: ${isAffordable ? 'pointer' : 'not-allowed'};
                opacity: ${isAffordable ? '1' : '0.7'};
                transition: transform 0.2s, background-color 0.2s;
            `;
            
            if (isAffordable) {
                card.addEventListener('mouseover', () => {
                    card.style.transform = 'scale(1.02)';
                    card.style.backgroundColor = 'rgba(60, 60, 60, 0.8)';
                });
                
                card.addEventListener('mouseout', () => {
                    card.style.transform = 'scale(1)';
                    card.style.backgroundColor = 'rgba(40, 40, 40, 0.8)';
                });
            }
            
            // Add stats bars to display weapon properties visually
            const getStatBar = (value, max, label) => {
                const percentage = (value / max) * 100;
                return `
                    <div class="stat-item">
                        <div class="stat-label">${label}</div>
                        <div class="stat-bar-container">
                            <div class="stat-bar" style="width: ${percentage}%; background-color: ${isAffordable ? '#4CAF50' : '#666'};"></div>
                        </div>
                    </div>
                `;
            };
            
            // Format weapon info
            card.innerHTML = `
                <div class="weapon-header" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <h3 style="margin: 0; color: ${isAffordable ? 'white' : '#aaa'};">${weapon.name}</h3>
                    <div style="color: ${isAffordable ? '#4CAF50' : '#aaa'};">$${weapon.cost}</div>
                </div>
                <div class="weapon-stats" style="margin-bottom: 10px;">
                    ${getStatBar(weapon.damage, 100, 'Damage')}
                    ${getStatBar(weapon.fireRate, 15, 'Fire Rate')}
                    ${getStatBar(1 - weapon.accuracy, 1, 'Accuracy')}
                    ${getStatBar(weapon.range, 1500, 'Range')}
                </div>
                <div class="weapon-details" style="font-size: 12px; color: #aaa;">
                    <div>Magazine: ${weapon.magazineSize}</div>
                    <div>Reserve: ${weapon.reserveAmmo}</div>
                </div>
            `;
            
            // Add CSS for stat bars
            const style = document.createElement('style');
            style.textContent = `
                .stat-item {
                    margin-bottom: 5px;
                }
                .stat-label {
                    font-size: 12px;
                    margin-bottom: 2px;
                }
                .stat-bar-container {
                    width: 100%;
                    height: 5px;
                    background-color: #333;
                    border-radius: 2px;
                    overflow: hidden;
                }
                .stat-bar {
                    height: 100%;
                    border-radius: 2px;
                }
            `;
            document.head.appendChild(style);
            
            // Add purchase functionality
            if (isAffordable) {
                card.addEventListener('click', () => {
                    this.purchaseWeapon(weapon.id);
                });
            }
            
            container.appendChild(card);
        });
        
        // Handle empty category
        if (weapons.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No items available in this category';
            emptyMessage.style.cssText = `
                grid-column: 1 / -1;
                text-align: center;
                padding: 20px;
                color: #aaa;
            `;
            container.appendChild(emptyMessage);
        }
    }

    // Purchase weapon
    purchaseWeapon(weaponId) {
        // Find the weapon in the catalog
        let weapon;
        
        if (weaponId.toUpperCase) {
            weapon = window.WeaponCatalog[weaponId.toUpperCase()];
        }
        
        if (!weapon) {
            console.error(`Weapon with ID ${weaponId} not found!`);
            return;
        }
        
        // Check if player has enough money
        if (this.game.localPlayer.money < weapon.cost) {
            this.showNotification('Not enough money to purchase this weapon', 'error');
            return;
        }
        
        // Purchase the weapon
        this.game.localPlayer.money -= weapon.cost;
        
        // Give weapon to player through combat manager
        if (this.game.combatManager) {
            this.game.combatManager.giveWeapon(this.game.localPlayer, weaponId);
            
            // Play purchase sound effect (if we had one)
            
            // Show purchase confirmation
            this.showNotification(`Purchased ${weapon.name}`, 'success');
            
            // Update buy menu
            this.updateBuyMenu();
        }
    }

    // Update the buy menu with current player money and weapons
    updateBuyMenu() {
        if (!this.buyMenu) return;
        
        // Update money display
        const playerInfo = this.buyMenu.querySelector('.player-info');
        if (playerInfo) {
            const moneyDisplay = playerInfo.querySelector('div:last-child');
            if (moneyDisplay) {
                moneyDisplay.innerHTML = `Money: <span style="color: #4CAF50;">$${this.game.localPlayer.money}</span>`;
            }
        }
        
        // Update weapon affordability
        const weaponCards = this.buyMenu.querySelectorAll('.weapon-card');
        weaponCards.forEach(card => {
            const weaponId = card.dataset.weaponId;
            let weapon;
            
            if (weaponId.toUpperCase) {
                weapon = window.WeaponCatalog[weaponId.toUpperCase()];
            }
            
            if (!weapon) return;
            
            const isAffordable = this.game.localPlayer.money >= weapon.cost;
            
            // Update card styling based on affordability
            card.style.border = `1px solid ${isAffordable ? '#4CAF50' : '#666'}`;
            card.style.cursor = isAffordable ? 'pointer' : 'not-allowed';
            card.style.opacity = isAffordable ? '1' : '0.7';
            
            // Update cost color
            const costDisplay = card.querySelector('.weapon-header div');
            if (costDisplay) {
                costDisplay.style.color = isAffordable ? '#4CAF50' : '#aaa';
            }
            
            // Update stat bars
            const statBars = card.querySelectorAll('.stat-bar');
            statBars.forEach(bar => {
                bar.style.backgroundColor = isAffordable ? '#4CAF50' : '#666';
            });
            
            // Update click handler
            const existingHandler = card.onclick;
            if (existingHandler) {
                card.removeEventListener('click', existingHandler);
            }
            
            if (isAffordable) {
                card.addEventListener('click', () => {
                    this.purchaseWeapon(weaponId);
                });
            }
        });
        
        // Update equipped weapons
        const currentLoadout = this.buyMenu.querySelector('.equipped-weapons div');
        if (currentLoadout) {
            let primaryWeapon = "None";
            let secondaryWeapon = "None";
            
            if (this.game.localPlayer.equipment) {
                this.game.localPlayer.equipment.forEach(weapon => {
                    if (weapon.type === 'primary') {
                        primaryWeapon = weapon.name;
                    } else if (weapon.type === 'secondary') {
                        secondaryWeapon = weapon.name;
                    }
                });
            }
            
            currentLoadout.innerHTML = `
                <div><strong>Primary:</strong> ${primaryWeapon}</div>
                <div><strong>Secondary:</strong> ${secondaryWeapon}</div>
            `;
        }
    }

    // Switch between buy categories
    switchBuyCategory(category) {
        this.activeBuyCategory = category;
        
        // Update tab styling
        const tabs = document.querySelectorAll('.buy-menu-tab');
        tabs.forEach(tab => {
            const isActive = tab.dataset.category === category;
            tab.style.fontWeight = isActive ? 'bold' : 'normal';
            tab.style.color = isActive ? '#4CAF50' : '#aaa';
            tab.style.borderBottom = `2px solid ${isActive ? '#4CAF50' : 'transparent'}`;
        });
        
        // Update weapons display
        const weaponsContainer = document.getElementById('weapons-container');
        if (weaponsContainer) {
            this.populateWeapons(weaponsContainer);
        }
    }

    // Toggle buy menu visibility
    toggleBuyMenu() {
        if (this.buyMenuActive) {
            this.removeBuyMenu();
        } else {
            this.createBuyMenu();
        }
        this.buyMenuActive = !this.buyMenuActive;
    }

    // Remove buy menu from DOM
    removeBuyMenu() {
        if (this.buyMenu) {
            document.body.removeChild(this.buyMenu);
            this.buyMenu = null;
        }
    }

    // Add method to show money change notification
    showMoneyChangeNotification(amount, reason) {
        if (!amount) return;
        
        const notification = document.createElement('div');
        notification.className = 'money-notification';
        notification.style.cssText = `
            position: absolute;
            bottom: 150px;
            right: 20px;
            padding: 10px 15px;
            background-color: rgba(0, 0, 0, 0.7);
            color: ${amount > 0 ? '#4CAF50' : '#f44336'};
            border-radius: 5px;
            font-weight: bold;
            opacity: 1;
            transition: opacity 0.5s ease, transform 0.5s ease;
            transform: translateX(0);
            z-index: 1000;
        `;
        
        notification.innerHTML = `${amount > 0 ? '+' : ''}$${amount} ${reason ? `(${reason})` : ''}`;
        
        document.body.appendChild(notification);
        
        // Animate out after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(50px)';
            
            // Remove from DOM after animation
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 500);
        }, 2000);
    }

    // Update the bomb timer display with new time
    updateBombTimer(expiryTime) {
        if (!this.bombTimerElement) return;
        
        // Calculate time remaining
        const timeRemaining = Math.max(0, expiryTime - Date.now());
        
        // Format the time (MM:SS format)
        const seconds = Math.floor(timeRemaining / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        // Update the display
        this.bombTimerElement.textContent = 
            `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        
        // Update color based on time remaining (red when < 10 seconds)
        if (seconds < 10) {
            this.bombTimerElement.style.color = '#ff3333';
        } else {
            this.bombTimerElement.style.color = '#ffffff';
        }
    }
} 
