# AmneziaWG toggle

A Windows Stream Deck plugin for starting and stopping an AmneziaWG tunnel. The key displays the tunnel service state and shows an animation while connecting.

The project is maintained by **rodeka**. It is an independent project and is not an official Amnezia or Elgato product.

## Requirements

- Windows 10 or later and Stream Deck software 7.1 or later.
- A Stream Deck device and an existing AmneziaWG `.conf` configuration.
- AmneziaWG for Windows installed at `C:\Program Files\AmneziaWG\amneziawg.exe`.
- Administrator approval for the first connection with each configuration.

## Install the plugin

1. Open `build\com.amneziawg.toggle.streamDeckPlugin` and confirm installation in Stream Deck. If the installer is not available, build it as described below.
2. In Stream Deck, add the **VPN tunnel** action from the **AmneziaWG** category to a key.

## Prepare a tunnel

1. Keep your `.conf` file in a private location. It contains sensitive VPN credentials; never commit or share it.
2. In the action settings, enter the full path to the `.conf` file in **Configuration**. Check that **AmneziaWG** points to `C:\Program Files\AmneziaWG\amneziawg.exe`. Settings are saved automatically.
3. Press the key and approve the Windows administrator prompt. The plugin prepares the tunnel and starts it. Later presses connect or disconnect without another prompt.

The plugin creates a protected copy of the configuration during setup. Subsequent edits to the original file do not update that copy automatically.

## Build the installer

To build the installer from the project files, install Node.js 24 or later with npm, or install the Elgato Stream Deck CLI. Open PowerShell in the project directory and run:

```powershell
.\build-plugin.ps1
```

The installer is created in the `build` folder. The script uses the installed Stream Deck CLI if available; otherwise, it uses npm's `npx` to obtain the CLI, which requires internet access. Building validates the plugin and overwrites an existing installer with the same name.

## Troubleshooting

- Check the action settings for an error message and verify both paths.
- If preparation fails, check that AmneziaWG is installed in its default location, the configuration is readable, and administrator approval was granted.
- A connected service does not guarantee a successful VPN handshake or working internet access. Check the AmneziaWG configuration, server, routes, DNS, and Windows service logs if traffic fails.
- This plugin controls a tunnel service; it does not provide a VPN server or create a configuration.

