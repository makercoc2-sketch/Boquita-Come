Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
desktopPath = WshShell.SpecialFolders("Desktop")
startupPath = WshShell.SpecialFolders("Startup")

' Limpiar accesos directos anteriores con caracteres corruptos o emojis
On Error Resume Next
fso.DeleteFile desktopPath & "\*Iniciar Boquita Come*.lnk", True
fso.DeleteFile desktopPath & "\*Detener Boquita Come*.lnk", True
fso.DeleteFile startupPath & "\BoquitaComePOS_AutoStart.lnk", True
On Error GoTo 0

' 1. Acceso Directo Iniciar en Escritorio (Nombre limpio ASCII)
Set shortcut1 = WshShell.CreateShortcut(desktopPath & "\Iniciar Boquita Come POS.lnk")
shortcut1.TargetPath = scriptDir & "\INICIAR_SILENCIOSO.vbs"
shortcut1.WorkingDirectory = scriptDir
shortcut1.Description = "Iniciar Servidor y POS Boquita Come"
shortcut1.Save

' 2. Acceso Directo Detener en Escritorio
Set shortcut2 = WshShell.CreateShortcut(desktopPath & "\Detener Boquita Come POS.lnk")
shortcut2.TargetPath = scriptDir & "\DETENER_SISTEMA.bat"
shortcut2.WorkingDirectory = scriptDir
shortcut2.Description = "Detener Servidor Boquita Come POS"
shortcut2.Save

' 3. Acceso Directo Auto-Inicio con Windows
Set shortcut3 = WshShell.CreateShortcut(startupPath & "\BoquitaComePOS_AutoStart.lnk")
shortcut3.TargetPath = scriptDir & "\INICIAR_SILENCIOSO.vbs"
shortcut3.WorkingDirectory = scriptDir
shortcut3.Description = "Arranque automatico de Boquita Come POS al encender la PC"
shortcut3.Save

' 4. Acceso Directo Actualizar en Escritorio
Set shortcut4 = WshShell.CreateShortcut(desktopPath & "\Actualizar Boquita Come POS.lnk")
shortcut4.TargetPath = scriptDir & "\ACTUALIZAR_SISTEMA.bat"
shortcut4.WorkingDirectory = scriptDir
shortcut4.Description = "Descargar y aplicar la ultima version de Boquita Come POS"
shortcut4.Save

WScript.Echo "✅ Accesos directos creados correctamente en el Escritorio (Iniciar, Detener, Actualizar) y en Inicio de Windows."
