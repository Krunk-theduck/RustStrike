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
} 
