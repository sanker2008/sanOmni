const { networkInterfaces } = require('os');
const { spawn } = require('child_process');

function getLanIps() {
  const interfaces = networkInterfaces();
  const ips = [];

  for (const key of Object.keys(interfaces)) {
    const list = interfaces[key] || [];
    for (const item of list) {
      if (!item || item.family !== 'IPv4' || item.internal) continue;
      ips.push(item.address);
    }
  }

  const uniqIps = [...new Set(ips)];
  const preferred = uniqIps.find((ip) =>
    ip.startsWith('192.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  );
  return preferred ? [preferred, ...uniqIps.filter((ip) => ip !== preferred)] : uniqIps;
}

const preferredPort = process.env.PORT || '3000';
const args = process.argv.slice(2);
const nextArgs = ['dev', '--hostname', '0.0.0.0', '--port', preferredPort, ...args];

const ips = getLanIps();
if (ips.length > 0) {
  console.log(`Local:   http://localhost:${preferredPort}`);
  for (const ip of ips) {
    console.log(`Network: http://${ip}:${preferredPort}`);
  }
} else {
  console.log('No LAN IPv4 address found. Server still running on 0.0.0.0.');
}

const child = spawn('next', nextArgs, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
