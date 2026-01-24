!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

Var DcsPath

Page custom DcsPathPage DcsPathPageLeave

Function DcsPathPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Select your DCS Saved Games folder (e.g. C:\\Users\\<you>\\Saved Games\\DCS)"
  Pop $1

  ${NSD_CreateDirRequest} 0 22u 100% 12u "$PROFILE\Saved Games\DCS"
  Pop $DcsPath

  nsDialogs::Show
FunctionEnd

Function DcsPathPageLeave
  ${NSD_GetText} $DcsPath $DcsPath
  ${If} $DcsPath == ""
    MessageBox MB_ICONEXCLAMATION "Please select a folder."
    Abort
  ${EndIf}
FunctionEnd

!macro customInstall
  CreateDirectory "$DcsPath\Scripts\Hooks"
  CreateDirectory "$DcsPath\Mods\Services\Checkride\Scripts"

  CopyFiles /SILENT "$INSTDIR\resources\dcs\Scripts\Hooks\DCS-Checkride-hook.lua" "$DcsPath\Scripts\Hooks"
  CopyFiles /SILENT "$INSTDIR\resources\dcs\Mods\Services\Checkride\Scripts\DCS-CheckrideGameGUI.lua" "$DcsPath\Mods\Services\Checkride\Scripts"
!macroend
