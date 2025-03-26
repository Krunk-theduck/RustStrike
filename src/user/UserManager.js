export class UserManager {
    constructor() {
        // Default settings
        this.defaultSettings = {
            username: 'Player' + Math.floor(Math.random() * 10000),
            volume: 100,
            sensitivity: 5,
            performance: 'medium', // low, medium, high, ultra
            performanceProfiles: {
                low: { maxDistance: 500, rayCount: 50 },
                medium: { maxDistance: 700, rayCount: 80 },
                high: { maxDistance: 700, rayCount: 120 },
                ultra: { maxDistance: 1000, rayCount: 200 }
            },
            showFps: true,
            adaptiveRayCount: true,
            lastLogin: Date.now()
        };
        
        this.currentUser = null;
        this.loadUser();
    }
    
    // Load user data from localStorage
    loadUser() {
        const userData = localStorage.getItem('rustStrikeUser');
        if (userData) {
            try {
                this.currentUser = JSON.parse(userData);
                console.log('User loaded:', this.currentUser.username);
                
                // Make sure we have all expected settings
                this.currentUser = { ...this.defaultSettings, ...this.currentUser };
                
                // Make sure performanceProfiles are updated with any new values
                this.currentUser.performanceProfiles = { 
                    ...this.defaultSettings.performanceProfiles, 
                    ...this.currentUser.performanceProfiles 
                };
                
            } catch (e) {
                console.error('Failed to parse user data, creating new user', e);
                this.currentUser = { ...this.defaultSettings };
            }
        } else {
            // No existing user, create default
            this.currentUser = { ...this.defaultSettings };
        }
        
        // Always save after loading to ensure data format is current
        this.saveUser();
    }
    
    // Save current user data to localStorage
    saveUser() {
        if (this.currentUser) {
            // Update last login time
            this.currentUser.lastLogin = Date.now();
            localStorage.setItem('rustStrikeUser', JSON.stringify(this.currentUser));
        }
    }
    
    // Log in with username
    login(username) {
        if (!username || username.trim() === '') {
            return false;
        }
        
        // If already logged in with different name, save settings
        const previousSettings = this.currentUser ? { ...this.currentUser } : null;
        delete previousSettings?.username;
        
        // Check if this username already exists
        const existingUserData = localStorage.getItem(`rustStrike_${username}`);
        if (existingUserData) {
            try {
                this.currentUser = JSON.parse(existingUserData);
            } catch (e) {
                this.currentUser = { 
                    ...this.defaultSettings,
                    username
                };
            }
        } else {
            // New user with default settings
            this.currentUser = { 
                ...this.defaultSettings,
                username
            };
        }
        
        // Save to localStorage
        this.saveUser();
        return true;
    }
    
    // Log out current user
    logout() {
        this.currentUser = null;
        localStorage.removeItem('rustStrikeUser');
    }
    
    // Get current user settings
    getSettings() {
        return this.currentUser || this.defaultSettings;
    }
    
    // Update user settings
    updateSettings(newSettings) {
        if (!this.currentUser) {
            this.currentUser = { ...this.defaultSettings };
        }
        
        // Update settings
        this.currentUser = { ...this.currentUser, ...newSettings };
        
        // Save to localStorage
        this.saveUser();
        
        return this.currentUser;
    }
    
    // Get performance settings based on current profile
    getPerformanceSettings() {
        const settings = this.getSettings();
        const profile = settings.performance || 'medium';
        return settings.performanceProfiles[profile];
    }
    
    // Check if user is logged in
    isLoggedIn() {
        return this.currentUser !== null;
    }
} 
