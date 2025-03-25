import { Game } from './core/game.js';
import { UIManager } from './ui/UIManager.js';

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    // Get canvas element
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }

    // Initialize game
    const game = new Game(canvas);
    
    // Initialize UI Manager
    const ui = new UIManager(game);
    ui.init();

    // Make UI accessible to game
    game.ui = ui;

    // Make game accessible for debugging
    window.game = game;
}); 
