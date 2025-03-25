export class Renderer {
    constructor(game) {
        this.game = game;
        this.ctx = game.ctx;
        this.camera = null;
    }

    setCamera(camera) {
        this.camera = camera;
    }

    render() {
        const { map, players, localPlayer } = this.game;
        
        // Update camera position
        this.camera.follow(localPlayer);

        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        // Render visible map tiles
        const tileSize = map.tileSize;
        const startCol = Math.floor(this.camera.x / tileSize);
        const endCol = Math.ceil((this.camera.x + this.ctx.canvas.width) / tileSize);
        const startRow = Math.floor(this.camera.y / tileSize);
        const endRow = Math.ceil((this.camera.y + this.ctx.canvas.height) / tileSize);

        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
                const tile = map.getTile(col, row);
                if (tile === 1) {
                    this.ctx.fillStyle = '#666';
                    this.ctx.fillRect(
                        col * tileSize - this.camera.x,
                        row * tileSize - this.camera.y,
                        tileSize,
                        tileSize
                    );
                }
            }
        }

        // Render players
        players.forEach(player => {
            if (this.camera.isVisible(player.x, player.y, player.size, player.size)) {
                this.ctx.fillStyle = player === localPlayer ? '#0f0' : '#f00';
                this.ctx.fillRect(
                    player.x - player.size/2 - this.camera.x,
                    player.y - player.size/2 - this.camera.y,
                    player.size,
                    player.size
                );
            }
        });
    }
} 