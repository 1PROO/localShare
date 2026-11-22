'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const FIREWALL_RULES = [
  'TwinSync Pro LAN',
  'TwinSync Pro Mesh TCP 41235',
  'TwinSync Pro Portal TCP 41236',
  'TwinSync Pro Discovery UDP 41234'
];

function formatRuleList(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return '';
  return rules
    .map((r) => (typeof r === 'string' ? r : (r && r.name) || ''))
    .filter(Boolean)
    .join(', ');
}

function runPowerShell(args, { timeout = 6000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || err.message || 'PowerShell command failed').trim();
          const wrapped = new Error(msg);
          wrapped.cause = err;
          return reject(wrapped);
        }
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      }
    );
  });
}

function parseJsonSafe(raw) {
  const cleaned = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

function normalizeArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function escapePsSingleQuoted(str) {
  return String(str || '').replace(/'/g, "''");
}

async function checkWindowsNetworkHealth({ exePath } = {}) {
  if (process.platform !== 'win32') {
    return {
      ok: true,
      supported: false,
      platform: process.platform,
      needsAction: false,
      publicProfiles: [],
      firewallOk: true,
      missingFirewallRules: []
    };
  }

  const psScript = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$profiles = @()',
    'if (Get-Command Get-NetConnectionProfile -ErrorAction SilentlyContinue) {',
    "  $profiles = @(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' -and $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object Name,InterfaceAlias,InterfaceIndex,@{Name='NetworkCategory';Expression={[string]$_.NetworkCategory}})",
    '}',
    `$ruleNames = @(${FIREWALL_RULES.map((r) => `'${escapePsSingleQuoted(r)}'`).join(',')})`,
    '$present = @()',
    'if (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) {',
    '  foreach ($rn in $ruleNames) {',
    "    $found = Get-NetFirewallRule -DisplayName $rn -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' }",
    '    if ($found) { $present += $rn }',
    '  }',
    '} else {',
    '  foreach ($rn in $ruleNames) {',
    '    $out = netsh advfirewall firewall show rule name="$rn" 2>$null',
    "    if ($LASTEXITCODE -eq 0 -and ($out -join \"`n\") -match 'Allow') { $present += $rn }",
    '  }',
    '}',
    '@{ publicProfiles = $profiles; presentRules = $present } | ConvertTo-Json -Compress -Depth 4'
  ].join('\n');

  try {
    const { stdout } = await runPowerShell(['-Command', psScript], { timeout: 6000 });
    const parsed = parseJsonSafe(stdout) || {};
    const publicProfiles = normalizeArray(parsed.publicProfiles).filter(Boolean);
    const presentSet = new Set(normalizeArray(parsed.presentRules).map(String));
    const missingFirewallRules = FIREWALL_RULES.filter((name) => !presentSet.has(name));
    const firewallOk = missingFirewallRules.length === 0;
    const needsAction = publicProfiles.length > 0 || !firewallOk;

    return {
      ok: true,
      supported: true,
      platform: 'win32',
      exePath: exePath || process.execPath || '',
      needsAction,
      publicProfiles,
      firewallOk,
      missingFirewallRules
    };
  } catch (err) {
    return {
      ok: true,
      supported: true,
      platform: 'win32',
      exePath: exePath || process.execPath || '',
      needsAction: false,
      publicProfiles: [],
      firewallOk: true,
      missingFirewallRules: [],
      error: err.message
    };
  }
}

async function fixWindowsNetworkHealth({ exePath } = {}) {
  if (process.platform !== 'win32') {
    return checkWindowsNetworkHealth({ exePath });
  }

  const resolvedExe = String(exePath || process.execPath || '').trim();
  const hasExe = /\.exe$/i.test(resolvedExe);
  const tempScriptPath = path.join(
    os.tmpdir(),
    `ts_netfix_${crypto.randomBytes(6).toString('hex')}.ps1`
  );

  const lanRuleArgs = hasExe
    ? `advfirewall firewall add rule name="TwinSync Pro LAN" dir=in action=allow program="${escapePsSingleQuoted(resolvedExe)}" enable=yes profile=any`
    : 'advfirewall firewall add rule name="TwinSync Pro LAN" dir=in action=allow protocol=TCP localport=41235,41236 enable=yes profile=any';

  const netshCmds = [
    'advfirewall firewall delete rule name="WorkMesh LAN"',
    'advfirewall firewall delete rule name="TwinSync Pro LAN"',
    lanRuleArgs,
    'advfirewall firewall delete rule name="TwinSync Pro Mesh TCP 41235"',
    'advfirewall firewall add rule name="TwinSync Pro Mesh TCP 41235" dir=in action=allow protocol=TCP localport=41235 enable=yes profile=any',
    'advfirewall firewall delete rule name="TwinSync Pro Portal TCP 41236"',
    'advfirewall firewall add rule name="TwinSync Pro Portal TCP 41236" dir=in action=allow protocol=TCP localport=41236 enable=yes profile=any',
    'advfirewall firewall delete rule name="TwinSync Pro Discovery UDP 41234"',
    'advfirewall firewall add rule name="TwinSync Pro Discovery UDP 41234" dir=in action=allow protocol=UDP localport=41234 enable=yes profile=any'
  ];

  const scriptLines = [
    "$ErrorActionPreference = 'Continue'",
    'if (Get-Command Get-NetConnectionProfile -ErrorAction SilentlyContinue) {',
    "  Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' -and $_.InterfaceAlias -notmatch 'Loopback' } | ForEach-Object {",
    '    Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private -ErrorAction SilentlyContinue',
    '  }',
    '}',
    ...netshCmds.map(
      (args) => `Start-Process -FilePath 'netsh.exe' -Wait -WindowStyle Hidden -ArgumentList '${args}'`
    )
  ];

  fs.writeFileSync(tempScriptPath, scriptLines.join('\r\n'), 'utf8');

  try {
    const escapedPath = escapePsSingleQuoted(tempScriptPath);
    const elevateCmd = [
      "$ErrorActionPreference = 'Stop'",
      `$p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','"${escapedPath}"')`,
      'if ($p -and $p.ExitCode -ne 0) { exit $p.ExitCode }'
    ].join('; ');

    try {
      await runPowerShell(['-Command', elevateCmd], { timeout: 45000 });
    } catch (err) {
      throw new Error(
        `Administrator approval (UAC) is required to update Windows network profile & firewall rules: ${err.message}`
      );
    }

    return await checkWindowsNetworkHealth({ exePath: resolvedExe });
  } finally {
    try {
      if (fs.existsSync(tempScriptPath)) {
        fs.unlinkSync(tempScriptPath);
      }
    } catch (_) {}
  }
}

function scanInstallerDir(dirPath, regex) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const matches = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!regex.test(ent.name)) continue;
    const full = path.join(dirPath, ent.name);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && st.size > 0) {
        matches.push({ fileName: ent.name, filePath: full, size: st.size, mtimeMs: st.mtimeMs });
      }
    } catch (_) {}
  }
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches;
}

function extractVersionFromName(fileName, fallbackVersion) {
  const m = /(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?)/.exec(String(fileName || ''));
  return m ? m[1] : String(fallbackVersion || '2.0.0');
}

function findCachedInstaller(vaultPaths, appVersion = '2.0.0') {
  const verFallback = String(appVersion || '2.0.0');
  const installersDir =
    vaultPaths?.installersDir ||
    (vaultPaths?.vaultRoot ? path.join(vaultPaths.vaultRoot, '.installers') : '');

  const cachedMatches = scanInstallerDir(installersDir, /^.*twinsync.*\.exe$/i);
  if (cachedMatches.length > 0) {
    const best = cachedMatches[0];
    return {
      available: true,
      fileName: best.fileName,
      filePath: best.filePath,
      size: best.size,
      version: extractVersionFromName(best.fileName, verFallback)
    };
  }

  const releaseDir = path.join(__dirname, 'release');
  const releaseMatches = scanInstallerDir(releaseDir, /^TwinSync-Pro-Setup.*\.exe$/i);
  if (releaseMatches.length > 0) {
    const best = releaseMatches[0];
    return {
      available: true,
      fileName: best.fileName,
      filePath: best.filePath,
      size: best.size,
      version: extractVersionFromName(best.fileName, verFallback)
    };
  }

  return {
    available: false,
    fileName: '',
    filePath: '',
    size: 0,
    version: verFallback
  };
}

function importInstallerFile(sourcePath, vaultPaths, appVersion = '2.0.0') {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('Installer file does not exist');
  }
  const st = fs.statSync(sourcePath);
  if (!st.isFile()) {
    throw new Error('Selected path is not a file');
  }
  const rawBase = path.basename(sourcePath);
  if (!/\.exe$/i.test(rawBase)) {
    throw new Error('Installer file must be a Windows .exe executable');
  }

  const installersDir =
    vaultPaths?.installersDir ||
    (vaultPaths?.vaultRoot ? path.join(vaultPaths.vaultRoot, '.installers') : '');
  if (!installersDir) {
    throw new Error('Vault installers directory is not configured');
  }

  fs.mkdirSync(installersDir, { recursive: true });

  // Remove prior cached TwinSync installers so the newly attached one is served
  try {
    for (const ent of fs.readdirSync(installersDir, { withFileTypes: true })) {
      if (ent.isFile() && (/^TwinSync-Pro-Setup.*\.exe$/i.test(ent.name) || /twinsync.*\.exe$/i.test(ent.name))) {
        fs.unlinkSync(path.join(installersDir, ent.name));
      }
    }
  } catch (_) {}

  let cleanBase = rawBase.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  if (!/twinsync/i.test(cleanBase)) {
    cleanBase = `TwinSync-Pro-Setup-${cleanBase}`;
  }
  const destPath = path.join(installersDir, cleanBase);
  fs.copyFileSync(sourcePath, destPath);

  if (process.platform === 'win32') {
    try {
      execFile('attrib', ['+h', '+s', installersDir], { windowsHide: true }, () => {});
    } catch (_) {}
  }

  return findCachedInstaller(vaultPaths, appVersion);
}

module.exports = {
  checkWindowsNetworkHealth,
  fixWindowsNetworkHealth,
  findCachedInstaller,
  importInstallerFile,
  formatRuleList
};
