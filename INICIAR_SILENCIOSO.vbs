Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = scriptDir

' 1. Iniciar servidor Python/FastAPI via cmd.exe /c en segundo plano (Oculto)
batPath = scriptDir & "\INICIAR_SISTEMA.bat"
WshShell.Run "cmd.exe /c """ & batPath & """", 0, False

' 2. Esperar 3 segundos para garantizar que Uvicorn esté listo
WScript.Sleep 3000

' 3. Abrir el navegador de manera VISIBLE en el escritorio del usuario
Set ShellApp = CreateObject("Shell.Application")
ShellApp.Open "http://localhost:8000"
