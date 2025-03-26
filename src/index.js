import { Game } from './core/game.js';
import { UIManager } from './ui/UIManager.js';

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize game
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas);
    
    // Initialize UI manager with game reference
    const ui = new UIManager(game);
    game.ui = ui; // Make UI accessible from game
    
    // Initialize UI
    ui.init();
    
    // Make both accessible globally for debugging
    window.game = game;
    window.ui = ui;
}); 
