export class Camera {
    constructor(canvas, map) {
        this.canvas = canvas;
        this.map = map;
        this.x = 0;
        this.y = 0;
        this.scale = 1;
    }

    follow(player) {
        // Center the camera on the player
        this.x = player.x - this.canvas.width / 2;
        this.y = player.y - this.canvas.height / 2;

        // Clamp camera to map bounds
        const maxX = this.map.tiles[0].length * this.map.tileSize - this.canvas.width;
        const maxY = this.map.tiles.length * this.map.tileSize - this.canvas.height;
        
        this.x = Math.max(0, Math.min(this.x, maxX));
        this.y = Math.max(0, Math.min(this.y, maxY));
    }

    isVisible(x, y, width, height) {
        return (x + width >= this.x && 
                x <= this.x + this.canvas.width &&
                y + height >= this.y && 
                y <= this.y + this.canvas.height);
    }
} 