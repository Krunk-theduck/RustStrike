import { Player } from './player.js';
import { Map as GameMap } from './map.js';
import { Renderer } from '../rendering/renderer.js';
import { Camera } from '../rendering/camera.js';
import { RoomManager } from '../networking/RoomManager.js';

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
        
        this.setupCanvas();
        this.roomManager = new RoomManager(this);
    }

    setupCanvas() {
        // Set canvas size to window size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
    }

    init() {
        this.keys = {};
        this.map = new GameMap();
        this.localPlayer = new Player(undefined, undefined, this.map);
        this.players = new Map();
        this.players.set(this.localPlayer.id, this.localPlayer);
        this.camera = new Camera(this.canvas, this.map);
        this.renderer.setCamera(this.camera);
        
        this.setupInputHandlers();
        this.gameLoop();
    }

    setupInputHandlers() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
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
        this.roomManager.leaveRoom();
        // Cleanup code here (remove event listeners, clear intervals, etc.)
    }

    gameLoop() {
        if (!this.isRunning) return;
        
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        this.localPlayer.update(this.keys, this.map);
        // Other players would be updated from Firebase
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render game
        this.renderer.render();
    }
} 