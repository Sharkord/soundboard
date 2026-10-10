# Soundboard

Short sounds for everyone in a voice channel. Nothing streams through voice:
the server tells everyone in the channel which sound to play, and each browser
plays it on the user's own output device, at their own volume, and not at all
while they are deafened.

- **Play:** the soundboard button beside the camera and screen share buttons.
  Heart a sound to keep it at the top. The + button there adds a sound.
- **Upload:** from that + button or the plugin's entry in user settings. Pick a
  file, trim it on its waveform, preview it, name it. Requires `POST /sounds`
  access, which defaults to Upload Files.
- **Manage:** the Sounds tab in the plugin's server settings lists every sound
  for deletion. Users can delete their own from their settings.

Settings: maximum length, sounds per user, and the cooldown between plays.

# Screenshot

![Soundboard Screenshot](https://i.imgur.com/39afLWU.png)

## Development

```bash
bun install
bun run build
bun test
```

Set `SHARKORD_PLUGINS_PATH` in `.env` and the build is copied into your server.
