!macro customInstall
  DetailPrint "正在初始化用户配置目录..."
  ReadEnvStr $R0 APPDATA
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\post-install.ps1" -UserData "$R0\patent-assistant" -SeedDir "$INSTDIR\resources\install-seed" -Version "${VERSION}"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "用户配置初始化未完成（错误码 $0）。$\r$\n首次启动时应用将自动重试。$\r$\n配置目录：$R0\patent-assistant"
  ${EndIf}

  DetailPrint "正在创建桌面与开始菜单快捷方式..."
  ${If} ${FileExists} "$INSTDIR\resources\app-icon.ico"
    CreateShortCut "$DESKTOP\专利撰写助手.lnk" "$INSTDIR\patent-assistant.exe" "" "$INSTDIR\resources\app-icon.ico" 0 SW_SHOWNORMAL "" "专利撰写助手"
    CreateDirectory "$SMPROGRAMS\专利撰写助手"
    CreateShortCut "$SMPROGRAMS\专利撰写助手\专利撰写助手.lnk" "$INSTDIR\patent-assistant.exe" "" "$INSTDIR\resources\app-icon.ico" 0 SW_SHOWNORMAL "" "专利撰写助手"
  ${Else}
    CreateShortCut "$DESKTOP\专利撰写助手.lnk" "$INSTDIR\patent-assistant.exe" "" "$INSTDIR\patent-assistant.exe" 0 SW_SHOWNORMAL "" "专利撰写助手"
    CreateDirectory "$SMPROGRAMS\专利撰写助手"
    CreateShortCut "$SMPROGRAMS\专利撰写助手\专利撰写助手.lnk" "$INSTDIR\patent-assistant.exe" "" "$INSTDIR\patent-assistant.exe" 0 SW_SHOWNORMAL "" "专利撰写助手"
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$DESKTOP\专利撰写助手.lnk"
  RMDir /r "$SMPROGRAMS\专利撰写助手"
!macroend
