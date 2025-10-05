// start.js - Production startup script
const { spawn } = require('child_process');

console.log('🚀 Starting Partnerkin Bot in production mode...');

// Start web server
const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
});

// Start bot
const bot = spawn('node', ['app.js'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
});

// Handle server crash
server.on('exit', (code) => {
    console.error(`❌ Server exited with code ${code}`);
    if (code !== 0) {
        console.log('🔄 Restarting server...');
        // Auto-restart logic could go here
    }
});

// Handle bot crash
bot.on('exit', (code) => {
    console.error(`❌ Bot exited with code ${code}`);
    if (code !== 0) {
        console.log('🔄 Restarting bot...');
        // Auto-restart logic could go here
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    server.kill('SIGTERM');
    bot.kill('SIGTERM');
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    server.kill('SIGINT');
    bot.kill('SIGINT');
});