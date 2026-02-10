!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "StrFunc.nsh"

!insertmacro StrStr

Var DcsPath
Var DcsPathInput
Var DcsPathFound
Var DcsPathDefault

!define CHECKRIDE_REG_KEY "Software\\CheckrideClient"
!define CHECKRIDE_DCS_PATH_VALUE "DcsPath"
!define CHECKRIDE_DCS_PATH_LIST_VALUE "DcsKnownPaths"

Page custom DcsPathPage DcsPathPageLeave

Function IsLikelyDcsPath
  Exch $0
  StrCpy $1 ""

  ${If} ${FileExists} "$0\Config\options.lua"
    StrCpy $1 "1"
  ${ElseIf} ${FileExists} "$0\Config\autoexec.cfg"
    StrCpy $1 "1"
  ${ElseIf} ${FileExists} "$0\Scripts\Hooks"
    StrCpy $1 "1"
  ${ElseIf} ${FileExists} "$0\Mods"
    StrCpy $1 "1"
  ${EndIf}

  Exch $1
FunctionEnd

Function FindDcsPath
  StrCpy $DcsPathFound ""

  ReadRegStr $0 HKCU "${CHECKRIDE_REG_KEY}" "${CHECKRIDE_DCS_PATH_VALUE}"
  ${If} $0 != ""
    Push $0
    Call IsLikelyDcsPath
    Pop $1
    ${If} $1 == "1"
      StrCpy $DcsPathFound $0
      Return
    ${EndIf}
  ${EndIf}

  StrCpy $2 "$PROFILE\Saved Games\DCS"
  Push $2
  Call IsLikelyDcsPath
  Pop $1
  ${If} $1 == "1"
    StrCpy $DcsPathFound $2
    Return
  ${EndIf}

  StrCpy $2 "$PROFILE\Saved Games\DCS.openbeta"
  Push $2
  Call IsLikelyDcsPath
  Pop $1
  ${If} $1 == "1"
    StrCpy $DcsPathFound $2
    Return
  ${EndIf}

  StrCpy $2 "$PROFILE\Saved Games\DCS.openbeta_server"
  Push $2
  Call IsLikelyDcsPath
  Pop $1
  ${If} $1 == "1"
    StrCpy $DcsPathFound $2
    Return
  ${EndIf}

  StrCpy $2 "$PROFILE\Saved Games\DCS Server"
  Push $2
  Call IsLikelyDcsPath
  Pop $1
  ${If} $1 == "1"
    StrCpy $DcsPathFound $2
    Return
  ${EndIf}
FunctionEnd

Function RememberDcsPath
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  ${If} $0 == ""
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
    Return
  ${EndIf}

  WriteRegStr HKCU "${CHECKRIDE_REG_KEY}" "${CHECKRIDE_DCS_PATH_VALUE}" "$0"

  ReadRegStr $1 HKCU "${CHECKRIDE_REG_KEY}" "${CHECKRIDE_DCS_PATH_LIST_VALUE}"
  ${If} $1 == ""
    StrCpy $1 "|$0|"
    WriteRegStr HKCU "${CHECKRIDE_REG_KEY}" "${CHECKRIDE_DCS_PATH_LIST_VALUE}" "$1"
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
    Return
  ${EndIf}

  StrCpy $2 $1 1 0
  ${If} $2 != "|"
    StrCpy $1 "|$1"
  ${EndIf}

  StrLen $3 $1
  IntOp $3 $3 - 1
  StrCpy $2 $1 1 $3
  ${If} $2 != "|"
    StrCpy $1 "$1|"
  ${EndIf}

  ${StrStr} $4 $1 "|$0|"
  ${If} $4 == ""
    StrCpy $1 "$1$0|"
    WriteRegStr HKCU "${CHECKRIDE_REG_KEY}" "${CHECKRIDE_DCS_PATH_LIST_VALUE}" "$1"
  ${Else}
    WriteRegStr HKCU "${CHECKRIDE_REG_KEY}" "${CHECKRIDE_DCS_PATH_LIST_VALUE}" "$1"
  ${EndIf}
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function DcsPathPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Select your DCS Saved Games folder (e.g. C:\\Users\\<you>\\Saved Games\\DCS)"
  Pop $1

  Call FindDcsPath
  StrCpy $DcsPathDefault "$PROFILE\Saved Games\DCS"
  ${If} $DcsPathFound != ""
    StrCpy $DcsPathDefault $DcsPathFound
  ${EndIf}

  ${NSD_CreateDirRequest} 0 22u 100% 12u "$DcsPathDefault"
  Pop $DcsPathInput

  nsDialogs::Show
FunctionEnd

Function DcsPathPageLeave
  ${NSD_GetText} $DcsPathInput $DcsPath
  ${If} $DcsPath == ""
    MessageBox MB_ICONEXCLAMATION "Please select a folder."
    Abort
  ${EndIf}

  Push $DcsPath
  Call RememberDcsPath
FunctionEnd

!macro customInstall
  CreateDirectory "$DcsPath\Scripts\Hooks"
  CreateDirectory "$DcsPath\Mods\Services\DCS-Checkride\Scripts"

  CopyFiles /SILENT "$INSTDIR\resources\dcs\Scripts\Hooks\DCS-Checkride-hook.lua" "$DcsPath\Scripts\Hooks"
  CopyFiles /SILENT "$INSTDIR\resources\dcs\Mods\Services\DCS-Checkride\Scripts\DCS-CheckrideGameGUI.lua" "$DcsPath\Mods\Services\DCS-Checkride\Scripts"
!macroend
