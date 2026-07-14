#define AppName "StarFile"
#ifndef AppVersion
  #error AppVersion must be provided by packaging/build-installer.ps1
#endif
#define AppPublisher "StarFile"
#define AppExeName "MusicPlayer.exe"
#define WebView2RuntimeAppId "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

[Setup]
AppId={{B9AB3A81-1457-4816-A86B-1C4146F39718}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\StarFile
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=StarFileSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
SetupIconFile=assets\StarFile.ico
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "..\dist\MusicPlayer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dependencies\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft Edge WebView2 Runtime..."; Flags: waituntilterminated runhidden; Check: NeedsWebView2Runtime
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[Code]
function NeedsWebView2Runtime: Boolean;
var
  Version: String;
begin
  Result := not RegQueryStringValue(HKLM64, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{#WebView2RuntimeAppId}', 'pv', Version);
  if Result then
    Result := not RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{#WebView2RuntimeAppId}', 'pv', Version);
end;
