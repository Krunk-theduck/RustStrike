export class Renderer {
    constructor(game) {
        this.game = game;
        this.ctx = game.ctx;
        this.camera = null;
        
        // Define decoration colors and styles
        this.decorationStyles = {
            red: 'rgba(255, 0, 0, 0.2)',
            blue: 'rgba(0, 0, 255, 0.2)',
            bombsite: 'rgba(255, 165, 0, 0.5)' // Make bomb site more visible (bright orange)
        };
        
        // For FOV rendering
        this.fogOfWar = true; // Enable/disable fog of war
        this.visibilityResults = null; // Store latest visibility calculation
    }

    setCamera(camera) {
        this.camera = camera;
    }

    render() {
        if (!this.game.map || !this.game.localPlayer) return;
        
        const { map, players, localPlayer, roundManager, raycastEngine } = this.game;
        
        // Update camera position
        this.camera.follow(localPlayer);

        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        // Update visibility
        const visibility = this.fogOfWar && raycastEngine ? raycastEngine.update() : null;
        const hasVisibility = visibility && visibility.visibleTiles && visibility.visiblePlayers;

        // Calculate visible area
        const tileSize = map.tileSize;
        const startCol = Math.max(0, Math.floor(this.camera.x / tileSize));
        const endCol = Math.min(map.tiles[0].length, Math.ceil((this.camera.x + this.ctx.canvas.width) / tileSize));
        const startRow = Math.max(0, Math.floor(this.camera.y / tileSize));
        const endRow = Math.min(map.tiles.length, Math.ceil((this.camera.y + this.ctx.canvas.height) / tileSize));

        // Draw all tiles in dark (fog of war)
        if (this.fogOfWar) {
            for (let row = startRow; row < endRow; row++) {
                for (let col = startCol; col < endCol; col++) {
                    const tile = map.getTile(col, row);
                    
                    if (tile === 1) {
                        // Draw walls in dark gray
                        this.ctx.fillStyle = '#333';
                    } else {
                        // Draw floors in dark
                        this.ctx.fillStyle = '#111';
                    }
                    
                    this.ctx.fillRect(
                        col * tileSize - this.camera.x,
                        row * tileSize - this.camera.y,
                        tileSize,
                        tileSize
                    );
                }
            }
        }

        // Then render visible tiles
        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
                // Skip if tile is not visible
                if (hasVisibility && !visibility.visibleTiles.has(`${col},${row}`)) {
                    continue;
                }
                
                const tile = map.getTile(col, row);
                const decoration = map.getDecoration(col, row);
                
                // Draw floor or wall
                if (tile === 1) {
                    this.ctx.fillStyle = '#666';
                    this.ctx.fillRect(
                        col * tileSize - this.camera.x,
                        row * tileSize - this.camera.y,
                        tileSize,
                        tileSize
                    );
                } else {
                    // Draw floor
                    this.ctx.fillStyle = '#1a1a1a'; // Floor color
                    this.ctx.fillRect(
                        col * tileSize - this.camera.x,
                        row * tileSize - this.camera.y,
                        tileSize,
                        tileSize
                    );
                    
                    // Draw decoration overlay if present
                    if (decoration && this.decorationStyles[decoration]) {
                        this.ctx.fillStyle = this.decorationStyles[decoration];
                        this.ctx.fillRect(
                            col * tileSize - this.camera.x,
                            row * tileSize - this.camera.y,
                            tileSize,
                            tileSize
                        );
                    }
                }
            }
        }

        // Render players
        players.forEach(player => {
            // Skip rendering players that aren't visible
            if (hasVisibility && 
                player !== localPlayer && 
                !visibility.visiblePlayers.has(player.id)) {
                return;
            }
            
            if (this.camera.isVisible(player.x, player.y, player.size, player.size)) {
                // Set color based on team and whether it's the local player
                if (player === localPlayer) {
                    this.ctx.fillStyle = '#0f0'; // Local player is green
                } else if (player.team === 'red') {
                    this.ctx.fillStyle = '#f00'; // Red team
                } else if (player.team === 'blue') {
                    this.ctx.fillStyle = '#00f'; // Blue team
                } else {
                    this.ctx.fillStyle = '#aaa'; // Neutral/unknown team
                }
                
                this.ctx.fillRect(
                    player.x - player.size/2 - this.camera.x,
                    player.y - player.size/2 - this.camera.y,
                    player.size,
                    player.size
                );
                
                // Draw player aim direction
                if (player.aim && typeof player.aim.angle === 'number') {
                    const length = 20; // Line length
                    const endX = player.x + Math.cos(player.aim.angle) * length;
                    const endY = player.y + Math.sin(player.aim.angle) * length;
                    
                    this.ctx.strokeStyle = '#fff';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(player.x - this.camera.x, player.y - this.camera.y);
                    this.ctx.lineTo(endX - this.camera.x, endY - this.camera.y);
                    this.ctx.stroke();
                }
                
                // Draw player health bar
                this.drawHealthBar(player);
            }
        });

        // Render player information
        this.renderPlayerInfo();

        // Render debug information
        this.renderDebugInfo(visibility);

        // Render round info
        this.renderRoundInfo();
    }

    // Add a method to draw health bars
    drawHealthBar(player) {
        const barWidth = player.size;
        const barHeight = 5;
        const x = player.x - player.size/2 - this.camera.x;
        const y = player.y - player.size/2 - this.camera.y - 10;
        
        // Background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, barWidth, barHeight);
        
        // Health fill
        const healthPercent = player.health / 100;
        let fillColor = '#0f0'; // Green for high health
        
        if (healthPercent < 0.3) {
            fillColor = '#f00'; // Red for low health
        } else if (healthPercent < 0.6) {
            fillColor = '#ff0'; // Yellow for medium health
        }
        
        this.ctx.fillStyle = fillColor;
        this.ctx.fillRect(x, y, barWidth * healthPercent, barHeight);
    }

    renderRoundInfo() {
        const { roundManager } = this.game;
        if (!roundManager || !roundManager.currentState) return;
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        
        // Only show state text, remove round number display
        let stateText = '';
        switch (roundManager.currentState) {
            case roundManager.STATES.WAITING:
                stateText = 'Waiting for players';
                break;
            case roundManager.STATES.PREP:
                stateText = 'Preparation Phase';
                break;
            case roundManager.STATES.ACTIVE:
                stateText = 'Combat Phase';
                break;
            case roundManager.STATES.END:
                stateText = 'Round End';
                break;
        }
        this.ctx.fillText(stateText, this.ctx.canvas.width / 2, 30);
        
        // Show timer if applicable
        if (roundManager.stateEndTime > 0) {
            const timeLeft = Math.max(0, Math.floor((roundManager.stateEndTime - Date.now()) / 1000));
            this.ctx.fillText(`${timeLeft}s`, this.ctx.canvas.width / 2, 50);
        }
        
        // Show team scores in top corners instead (optional if you want to keep these)
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#f55';
        this.ctx.fillText(`Attackers: ${roundManager.teams[roundManager.TEAMS.ATTACKERS].score || 0}`, 20, 30);
        
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = '#55f';
        this.ctx.fillText(`Defenders: ${roundManager.teams[roundManager.TEAMS.DEFENDERS].score || 0}`, this.ctx.canvas.width - 20, 30);
    }

    // Show debug information about the raycasting
    renderDebugInfo(visibility) {
        if (!visibility || !visibility.performance) return;
        
        const { frameTime, avgFrameTime } = visibility.performance;
        const rayCount = visibility.rayCount || 0;
        
        this.ctx.font = '12px monospace';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'left';
        
        this.ctx.fillText(`Rays: ${rayCount}`, 10, this.ctx.canvas.height - 40);
        this.ctx.fillText(`Ray Time: ${avgFrameTime.toFixed(2)}ms`, 10, this.ctx.canvas.height - 20);
    }

    // Add this method to the Renderer class to include player health and weapon info
    renderPlayerInfo() {
        const player = this.game.localPlayer;
        if (!player) return;
        
        // Draw health bar at the bottom left corner
        const healthBarWidth = 200;
        const healthBarHeight = 20;
        const x = 20;
        const y = this.ctx.canvas.height - 30;
        
        // Health background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, healthBarWidth, healthBarHeight);
        
        // Health fill
        const healthPercent = player.health / 100;
        let fillColor = '#0f0'; // Green for high health
        
        if (healthPercent < 0.3) {
            fillColor = '#f00'; // Red for low health
        } else if (healthPercent < 0.6) {
            fillColor = '#ff0'; // Yellow for medium health
        }
        
        this.ctx.fillStyle = fillColor;
        this.ctx.fillRect(x, y, healthBarWidth * healthPercent, healthBarHeight);
        
        // Health text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${player.health}`, x + healthBarWidth / 2, y + 15);
        
        // Money display
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#0f0';
        this.ctx.fillText(`$${player.money}`, x, y - 10);
        
        // If the combat manager is initialized, let it handle weapon UI
        if (this.game.combatManager) {
            // Weapon info is rendered by the combat manager
        }
    }
} 