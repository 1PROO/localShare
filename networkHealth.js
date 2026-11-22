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

const VIRTUAL_ADAPTER_RE =
  /vmware|vmnet|virtualbox|vbox|vethernet|hyper-v|wsl|docker|br-|virbr|veth|podman|kube|cni|flannel|hamachi|npcap|loopback|teredo|isatap|bluetooth/i;

const EXCLUDE_PROFILE_RE =
  'Loopback|VMware|VMnet|VirtualBox|VBox|vEthernet|Hyper-V|WSL|Docker|Tailscale|ZeroTier|WireGuard|Bluetooth|Hamachi|Npcap|Teredo|isatap|br-|virbr|veth|podman';

function isVirtualAdapterName(name) {
  return VIRTUAL_ADAPTER_RE.test(String(name || ''));
}

function formatRuleList(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return '';
  return rules
    .map((r) => (typeof r === 'string' ? r : (r && r.name) || ''))
    .filter(Boolean)
    .join(', ');
}

function parseRegistryFirewallRules(valuesArray, expectedRuleNames = FIREWALL_RULES) {
  const presentSet = new Set();
  if (!Array.isArray(valuesArray) || valuesArray.length === 0) {
    return presentSet;
  }
  const expectedSet = new Set((expectedRuleNames || []).map((n) => String(n).trim()).filter(Boolean));
  if (expectedSet.size === 0) return presentSet;

  for (const entry of valuesArray) {
    if (typeof entry !== 'string' || !entry) continue;
    const parts = entry.split('|');
    let action = '';
    let active = '';
    let dir = '';
    let ruleName = '';

    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim().toLowerCase();
      const val = part.slice(eqIdx + 1).trim();
      if (key === 'action') action = val.toLowerCase();
      else if (key === 'active') active = val.toLowerCase();
      else if (key === 'dir') dir = val.toLowerCase();
      else if (key === 'name') ruleName = val;
    }

    if (active === 'true' && action === 'allow' && dir === 'in' && expectedSet.has(ruleName)) {
      presentSet.add(ruleName);
    }
  }

  return presentSet;
}

function runPowerShellEncoded(script, { timeout = 6000 } = {}) {
  const encoded = Buffer.from(String(script || ''), 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024 },
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
      activeProfiles: [],
      firewallOk: true,
      missingFirewallRules: []
    };
  }

  const psScript = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$activeProfiles = @()',
    'if (Get-Command Get-NetConnectionProfile -ErrorAction SilentlyContinue) {',
    `  $activeProfiles = @(Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -notmatch '${EXCLUDE_PROFILE_RE}' } | Select-Object Name,InterfaceAlias,InterfaceIndex,@{Name='NetworkCategory';Expression={[string]$_.NetworkCategory}})`,
    '}',
    '$regValues = @()',
    '$regTotalCount = 0',
    'try {',
    "  $fwKey = Get-Item -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy\\FirewallRules' -ErrorAction SilentlyContinue",
    '  if ($fwKey) {',
    '    $valNames = @($fwKey.GetValueNames())',
    '    $regTotalCount = $valNames.Count',
    '    foreach ($vn in $valNames) {',
    '      $val = $fwKey.GetValue($vn)',
    "      if ($val -is [string] -and ($val -like '*TwinSync*')) {",
    '        $regValues += $val',
    '      }',
    '    }',
    '  }',
    '} catch {}',
    `$ruleNames = @(${FIREWALL_RULES.map((r) => `'${escapePsSingleQuoted(r)}'`).join(',')})`,
    '$fallbackPresent = @()',
    'if ($regTotalCount -eq 0) {',
    '  foreach ($rn in $ruleNames) {',
    '    & netsh.exe advfirewall firewall show rule "name=$rn" > $null 2>&1',
    '    if ($LASTEXITCODE -eq 0) { $fallbackPresent += $rn }',
    '  }',
    '}',
    '@{ activeProfiles = $activeProfiles; regValues = $regValues; regTotalCount = $regTotalCount; fallbackPresent = $fallbackPresent } | ConvertTo-Json -Compress -Depth 4'
  ].join('\n');

  try {
    const { stdout } = await runPowerShellEncoded(psScript, { timeout: 6000 });
    const parsed = parseJsonSafe(stdout);
    if (!parsed) {
      throw new Error('Empty or invalid network health JSON output');
    }
    const activeProfiles = normalizeArray(parsed.activeProfiles).filter(Boolean);
    const publicProfiles = activeProfiles.filter(
      (p) => String(p.NetworkCategory || '').toLowerCase() === 'public'
    );

    const regTotalCount = Number(parsed.regTotalCount || 0);
    const presentSet =
      regTotalCount > 0
        ? parseRegistryFirewallRules(normalizeArray(parsed.regValues), FIREWALL_RULES)
        : new Set(normalizeArray(parsed.fallbackPresent).map(String));

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
      activeProfiles,
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
      activeProfiles: [],
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

  const safeExe = escapePsSingleQuoted(resolvedExe);
  const scriptLines = [
    "$ErrorActionPreference = 'Continue'",
    `$exe = '${safeExe}'`,
    'if (Get-Command Get-NetConnectionProfile -ErrorAction SilentlyContinue) {',
    `  Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' -and $_.InterfaceAlias -notmatch '${EXCLUDE_PROFILE_RE}' } | ForEach-Object {`,
    '    Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private -ErrorAction SilentlyContinue',
    '  }',
    '}',
    '$netshFailed = $false',
    '& netsh.exe advfirewall firewall delete rule "name=WorkMesh LAN" > $null 2>&1',
    '& netsh.exe advfirewall firewall delete rule "name=TwinSync Pro LAN" > $null 2>&1',
    hasExe
      ? '& netsh.exe advfirewall firewall add rule "name=TwinSync Pro LAN" dir=in action=allow "program=$exe" enable=yes profile=any > $null 2>&1'
      : '& netsh.exe advfirewall firewall add rule "name=TwinSync Pro LAN" dir=in action=allow protocol=TCP localport=41235,41236 enable=yes profile=any > $null 2>&1',
    'if ($LASTEXITCODE -ne 0) { $netshFailed = $true }',
    '& netsh.exe advfirewall firewall delete rule "name=TwinSync Pro Mesh TCP 41235" > $null 2>&1',
    '& netsh.exe advfirewall firewall add rule "name=TwinSync Pro Mesh TCP 41235" dir=in action=allow protocol=TCP localport=41235 enable=yes profile=any > $null 2>&1',
    'if ($LASTEXITCODE -ne 0) { $netshFailed = $true }',
    '& netsh.exe advfirewall firewall delete rule "name=TwinSync Pro Portal TCP 41236" > $null 2>&1',
    '& netsh.exe advfirewall firewall add rule "name=TwinSync Pro Portal TCP 41236" dir=in action=allow protocol=TCP localport=41236 enable=yes profile=any > $null 2>&1',
    'if ($LASTEXITCODE -ne 0) { $netshFailed = $true }',
    '& netsh.exe advfirewall firewall delete rule "name=TwinSync Pro Discovery UDP 41234" > $null 2>&1',
    '& netsh.exe advfirewall firewall add rule "name=TwinSync Pro Discovery UDP 41234" dir=in action=allow protocol=UDP localport=41234 enable=yes profile=any > $null 2>&1',
    'if ($LASTEXITCODE -ne 0) { $netshFailed = $true }',
    `$expected = @(${FIREWALL_RULES.map((r) => `'${escapePsSingleQuoted(r)}'`).join(',')})`,
    '$foundInReg = New-Object System.Collections.Generic.HashSet[string]',
    'try {',
    "  $fwKey = Get-Item -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy\\FirewallRules' -ErrorAction SilentlyContinue",
    '  if ($fwKey) {',
    '    foreach ($vn in $fwKey.GetValueNames()) {',
    '      $val = $fwKey.GetValue($vn)',
    "      if ($val -is [string] -and ($val -like '*Active=TRUE*') -and ($val -like '*Action=Allow*') -and ($val -like '*Dir=In*')) {",
    '        foreach ($rn in $expected) {',
    '          if ($val -like "*Name=$rn|*" -or $val.EndsWith("Name=$rn")) { [void]$foundInReg.Add($rn) }',
    '        }',
    '      }',
    '    }',
    '  }',
    '} catch {}',
    'if (($netshFailed -or ($foundInReg.Count -lt $expected.Count)) -and (Get-Command New-NetFirewallRule -ErrorAction SilentlyContinue)) {',
    '  if (-not $foundInReg.Contains(\'TwinSync Pro LAN\')) {',
    '    Remove-NetFirewallRule -DisplayName \'TwinSync Pro LAN\' -ErrorAction SilentlyContinue',
    hasExe
      ? '    New-NetFirewallRule -DisplayName \'TwinSync Pro LAN\' -Direction Inbound -Action Allow -Program $exe -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null'
      : '    New-NetFirewallRule -DisplayName \'TwinSync Pro LAN\' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 41235,41236 -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null',
    '  }',
    '  if (-not $foundInReg.Contains(\'TwinSync Pro Mesh TCP 41235\')) {',
    '    Remove-NetFirewallRule -DisplayName \'TwinSync Pro Mesh TCP 41235\' -ErrorAction SilentlyContinue',
    '    New-NetFirewallRule -DisplayName \'TwinSync Pro Mesh TCP 41235\' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 41235 -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null',
    '  }',
    '  if (-not $foundInReg.Contains(\'TwinSync Pro Portal TCP 41236\')) {',
    '    Remove-NetFirewallRule -DisplayName \'TwinSync Pro Portal TCP 41236\' -ErrorAction SilentlyContinue',
    '    New-NetFirewallRule -DisplayName \'TwinSync Pro Portal TCP 41236\' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 41236 -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null',
    '  }',
    '  if (-not $foundInReg.Contains(\'TwinSync Pro Discovery UDP 41234\')) {',
    '    Remove-NetFirewallRule -DisplayName \'TwinSync Pro Discovery UDP 41234\' -ErrorAction SilentlyContinue',
    '    New-NetFirewallRule -DisplayName \'TwinSync Pro Discovery UDP 41234\' -Direction Inbound -Action Allow -Protocol UDP -LocalPort 41234 -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null',
    '  }',
    '}'
  ];

  // UTF-8 BOM ensures Windows PowerShell 5.1 parses non-ASCII executable paths safely
  fs.writeFileSync(tempScriptPath, '\uFEFF' + scriptLines.join('\r\n'), 'utf8');

  try {
    const escapedPath = escapePsSingleQuoted(tempScriptPath);
    const elevateCmd = [
      "$ErrorActionPreference = 'Stop'",
      `$quotedFile = '"' + '${escapedPath}' + '"'`,
      "$p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$quotedFile)",
      'if ($p -and $p.ExitCode -ne 0) { exit $p.ExitCode }'
    ].join('\n');

    try {
      await runPowerShellEncoded(elevateCmd, { timeout: 45000 });
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
  formatRuleList,
  isVirtualAdapterName,
  parseRegistryFirewallRules
};
