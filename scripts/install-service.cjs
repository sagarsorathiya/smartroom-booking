/**
 * install-service.cjs — Install/Uninstall ConferenceHub as a Windows Service
 * Uses 'node-windows' (npm package, no external tools needed)
 *
 * Run as Administrator!
 *
 * Setup (one-time):
 *   npm install -g node-windows
 *
 * Usage (from the production folder):
 *   node scripts/install-service.cjs install     # Install & start service
 *   node scripts/install-service.cjs uninstall   # Remove service
 *   node scripts/install-service.cjs status      # Check status
 *
 * After install, manage via PowerShell:
 *   Start-Service ConferenceHub
 *   Stop-Service ConferenceHub
 *   Restart-Service ConferenceHub
 *   Get-Service ConferenceHub
 */

const { Service } = require('node-windows');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

// ─── Configuration ────────────────────────────────────────
const SERVICE_NAME = 'ConferenceHub';
const DESCRIPTION  = 'ConferenceHub - Conference room booking portal (Express API + Vite frontend)';
const SCRIPT_PATH  = path.join(projectRoot, 'dist-server', 'server', 'index.js');

// ─── Load .env as environment variables for the service ───
function loadEnvVars() {
  const envFile = path.join(projectRoot, '.env');
  const envPairs = [];
  try {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const eqIdx = trimmed.indexOf('=');
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        // Remove surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        envPairs.push({ name: key, value: val });
      }
    }
  } catch {
    // No .env file
  }
  return envPairs;
}

// ─── Create service instance ──────────────────────────────
const svc = new Service({
  name: SERVICE_NAME,
  description: DESCRIPTION,
  script: SCRIPT_PATH,
  workingDirectory: projectRoot,
  // Restart on crash — wait 1s, then grow by 0.5x, max 50 restarts
  wait: 1,
  grow: 0.5,
  maxRestarts: 50,
  env: loadEnvVars(),
});

// ─── Command handling ─────────────────────────────────────
const command = process.argv[2] || 'help';

if (command === 'install') {
  console.log('');
  console.log('=== Installing ConferenceHub Service ===');
  console.log('  Name  : ' + SERVICE_NAME);
  console.log('  Script: ' + SCRIPT_PATH);
  console.log('  CWD   : ' + projectRoot);
  console.log('');

  svc.on('install', function () {
    console.log('Service installed successfully!');
    console.log('Starting service...');
    svc.start();
  });

  svc.on('start', function () {
    console.log('');
    console.log('Service is RUNNING.');
    console.log('');
    console.log('Manage with PowerShell:');
    console.log('  Start-Service ' + SERVICE_NAME);
    console.log('  Stop-Service ' + SERVICE_NAME);
    console.log('  Restart-Service ' + SERVICE_NAME);
    console.log('  Get-Service ' + SERVICE_NAME);
    console.log('');
    console.log('Logs at: ' + path.join(projectRoot, 'daemon'));
    console.log('');
  });

  svc.on('alreadyinstalled', function () {
    console.log('Service is already installed.');
    console.log('Run "node scripts/install-service.cjs uninstall" first to reinstall.');
  });

  svc.on('error', function (err) {
    console.error('Error:', err);
  });

  svc.install();

} else if (command === 'uninstall') {
  console.log('');
  console.log('=== Uninstalling ConferenceHub Service ===');

  svc.on('uninstall', function () {
    console.log('Service removed successfully.');
  });

  svc.on('stop', function () {
    console.log('Service stopped.');
  });

  svc.stop();
  setTimeout(function () { svc.uninstall(); }, 2000);

} else if (command === 'status') {
  try {
    const output = execSync(
      'powershell -Command "Get-Service \'' + SERVICE_NAME + '\' | Format-List Name,Status,StartType"',
      { encoding: 'utf-8' }
    );
    console.log(output.trim());
  } catch {
    console.log('Service \'' + SERVICE_NAME + '\' is not installed.');
  }

} else {
  console.log('ConferenceHub Windows Service Manager');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/install-service.cjs install     Install & start service');
  console.log('  node scripts/install-service.cjs uninstall   Remove service');
  console.log('  node scripts/install-service.cjs status      Check status');
}
