Set shell = CreateObject("WScript.Shell")
' 将 "窗口标题" 替换为你实际要查找的名称（支持部分匹配）
success = shell.AppActivate("My Environment")
if success then
else
    WScript.Echo "Cannot find the window."
end if
