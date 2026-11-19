!macro customInstall
  ; Create hidden shared Vault directory structure under C:\ProgramData\WorkMesh_Vault
  CreateDirectory "$COMMONAPPDATA\WorkMesh_Vault"
  CreateDirectory "$COMMONAPPDATA\WorkMesh_Vault\files"
  CreateDirectory "$COMMONAPPDATA\WorkMesh_Vault\.trash"
  CreateDirectory "$COMMONAPPDATA\WorkMesh_Vault\.chat_blobs"
  CreateDirectory "$COMMONAPPDATA\WorkMesh_Vault\.meta"
  CreateDirectory "$COMMONAPPDATA\WorkMesh_Vault\.meta\staging"

  ; Apply hidden (+h) and system (+s) attributes to root Vault and internal metadata folders
  nsExec::ExecToLog 'cmd /c attrib +h +s "$COMMONAPPDATA\WorkMesh_Vault"'
  nsExec::ExecToLog 'cmd /c attrib +h +s "$COMMONAPPDATA\WorkMesh_Vault\.trash"'
  nsExec::ExecToLog 'cmd /c attrib +h +s "$COMMONAPPDATA\WorkMesh_Vault\.chat_blobs"'
  nsExec::ExecToLog 'cmd /c attrib +h +s "$COMMONAPPDATA\WorkMesh_Vault\.meta"'

  ; Grant locale-independent BUILTIN\Users Modify permissions so WorkMesh.exe (asInvoker) can read/write Vault
  nsExec::ExecToLog 'icacls "$COMMONAPPDATA\WorkMesh_Vault" /grant "*S-1-5-32-545:(OI)(CI)M" /T /C /Q'

  ; Allow LAN inbound traffic for UDP Discovery, WebSocket Mesh, and Mobile QR Companion
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="WorkMesh LAN" dir=in action=allow program="$INSTDIR\WorkMesh.exe" enable=yes profile=private,domain'

  ; Register Auto-Start in HKLM (perMachine installer with admin elevation)
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "WorkMesh" '"$INSTDIR\WorkMesh.exe" --hidden'
!macroend

!macro customUnInstall
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "WorkMesh"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WorkMesh"
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="WorkMesh LAN"'
!macroend
