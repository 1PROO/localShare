!macro customInstall
  ; Switch shell folder context to All Users so $APPDATA resolves to C:\ProgramData on Windows 7/10/11
  SetShellVarContext all

  ; Create hidden shared Vault directory structure under C:\ProgramData\TwinSync_Vault
  CreateDirectory "$APPDATA\TwinSync_Vault"
  CreateDirectory "$APPDATA\TwinSync_Vault\files"
  CreateDirectory "$APPDATA\TwinSync_Vault\.trash"
  CreateDirectory "$APPDATA\TwinSync_Vault\.chat_blobs"
  CreateDirectory "$APPDATA\TwinSync_Vault\.meta"
  CreateDirectory "$APPDATA\TwinSync_Vault\.meta\staging"
  CreateDirectory "$APPDATA\TwinSync_Vault\.installers"

  ; Apply hidden (+h) and system (+s) attributes to root Vault and internal metadata folders
  nsExec::ExecToLog 'cmd /c attrib +h +s "$APPDATA\TwinSync_Vault"'
  nsExec::ExecToLog 'cmd /c attrib +h +s "$APPDATA\TwinSync_Vault\.trash"'
  nsExec::ExecToLog 'cmd /c attrib +h +s "$APPDATA\TwinSync_Vault\.chat_blobs"'
  nsExec::ExecToLog 'cmd /c attrib +h +s "$APPDATA\TwinSync_Vault\.meta"'
  nsExec::ExecToLog 'cmd /c attrib +h +s "$APPDATA\TwinSync_Vault\.installers"'

  ; Grant locale-independent BUILTIN\Users Modify permissions so TwinSync Pro.exe (asInvoker) can read/write Vault
  nsExec::ExecToLog 'icacls "$APPDATA\TwinSync_Vault" /grant "*S-1-5-32-545:(OI)(CI)M" /T /C /Q'

  ; Cache offline LAN installer inside hidden .installers folder for zero-internet peer distribution
  Delete "$APPDATA\TwinSync_Vault\.installers\TwinSync-Pro-Setup*.exe"
  CopyFiles /SILENT "$EXEPATH" "$APPDATA\TwinSync_Vault\.installers\TwinSync-Pro-Setup.exe"

  ; Allow LAN inbound traffic across ALL network profiles (including Public/Unidentified offline LANs)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="WorkMesh LAN"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TwinSync Pro LAN"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="TwinSync Pro LAN" dir=in action=allow program="$INSTDIR\TwinSync Pro.exe" enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TwinSync Pro Mesh TCP 41235"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="TwinSync Pro Mesh TCP 41235" dir=in action=allow protocol=TCP localport=41235 enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TwinSync Pro Portal TCP 41236"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="TwinSync Pro Portal TCP 41236" dir=in action=allow protocol=TCP localport=41236 enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TwinSync Pro Discovery UDP 41234"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="TwinSync Pro Discovery UDP 41234" dir=in action=allow protocol=UDP localport=41234 enable=yes profile=any'

  ; Clean legacy WorkMesh Run keys and register TwinSync Pro Auto-Start in HKLM (perMachine installer with admin elevation)
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "WorkMesh"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WorkMesh"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "TwinSync Pro" '"$INSTDIR\TwinSync Pro.exe" --hidden'
!macroend

!macro customUnInstall
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "TwinSync Pro"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TwinSync Pro"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "WorkMesh"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WorkMesh"
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TwinSync Pro LAN"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TwinSync Pro Mesh TCP 41235"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TwinSync Pro Portal TCP 41236"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TwinSync Pro Discovery UDP 41234"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="WorkMesh LAN"'
!macroend
