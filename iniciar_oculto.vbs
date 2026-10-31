' Inicia o Meus Gastos sem mostrar a janela preta do terminal.
' O servidor fica rodando em segundo plano; para parar, use o Gerenciador
' de Tarefas e encerre o processo "node.exe".
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = pasta
shell.Run """" & pasta & "\iniciar.bat""", 0, False
