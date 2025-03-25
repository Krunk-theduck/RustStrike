export class Player {
    constructor(x = 100, y = 100, map = null, team = null) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.size = 20; // Player size in pixels
        this.speed = 5;
        this.direction = 0;
        this.team = team; // 'red', 'blue', or null for spectator/neutral

        // If map is provided, find a safe spawn point
        if (map) {
            const safePosition = this.findSafeSpawnPosition(map);
            this.x = safePosition.x;
            this.y = safePosition.y;
        } else {
            this.x = x;
            this.y = y;
        }
    }

    findSafeSpawnPosition(map) {
        // If player has a team, use team spawn point
        if (this.team && (this.team === 'red' || this.team === 'blue')) {
            const spawnPoint = map.getSpawnPoint(this.team);
            
            // Check if spawn point is safe
            if (this.canMove(spawnPoint.x, spawnPoint.y, map)) {
                return spawnPoint;
            }
            
            // If not safe, try nearby positions
            for (let offsetX = -2; offsetX <= 2; offsetX++) {
                for (let offsetY = -2; offsetY <= 2; offsetY++) {
                    const x = spawnPoint.x + offsetX * map.tileSize;
                    const y = spawnPoint.y + offsetY * map.tileSize;
                    if (this.canMove(x, y, map)) {
                        return { x, y };
                    }
                }
            }
        }

        // Fallback to random position if team spawn isn't available
        const maxAttempts = 100; // Prevent infinite loops
        let attempts = 0;

        while (attempts < maxAttempts) {
            // Generate random position within map bounds
            const x = Math.floor(Math.random() * (map.tiles[0].length - 2) + 1) * map.tileSize;
            const y = Math.floor(Math.random() * (map.tiles.length - 2) + 1) * map.tileSize;

            // Check if position is safe
            if (this.canMove(x, y, map)) {
                return { x, y };
            }
            attempts++;
        }

        // Fallback: scan map systematically for first safe position
        for (let y = 1; y < map.tiles.length - 1; y++) {
            for (let x = 1; x < map.tiles[0].length - 1; x++) {
                const worldX = x * map.tileSize;
                const worldY = y * map.tileSize;
                if (this.canMove(worldX, worldY, map)) {
                    return { x: worldX, y: worldY };
                }
            }
        }

        // If all else fails, return center of map
        return {
            x: (map.tiles[0].length / 2) * map.tileSize,
            y: (map.tiles.length / 2) * map.tileSize
        };
    }

    update(keys, map) {
        let newX = this.x;
        let newY = this.y;

        if (keys.ArrowUp || keys.w) newY -= this.speed;
        if (keys.ArrowDown || keys.s) newY += this.speed;
        if (keys.ArrowLeft || keys.a) newX -= this.speed;
        if (keys.ArrowRight || keys.d) newX += this.speed;

        // Check collision before applying movement
        if (this.canMove(newX, this.y, map)) this.x = newX;
        if (this.canMove(this.x, newY, map)) this.y = newY;
    }

    canMove(newX, newY, map) {
        // Check corners of player hitbox
        const points = [
            { x: newX - this.size/2, y: newY - this.size/2 },
            { x: newX + this.size/2, y: newY - this.size/2 },
            { x: newX - this.size/2, y: newY + this.size/2 },
            { x: newX + this.size/2, y: newY + this.size/2 }
        ];

        return points.every(point => map.isWalkable(point.x, point.y));
    }
}

// Make Player globally available
window.Player = Player; 
