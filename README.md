# Quarter-Hour Reminders

Playful reminders at every quarter-hour mark (local time):

- **:00 and :30** — "Time to race!"
- **:15 and :45** — "Go catch some butterflies!"

The schedule is anchored to the clock, so it stays accurate after sleep or a clock change.

## Run

```bash
npm install
npm run desktop     # desktop app: centred, always-on-top alert + tray icon
npm start           # web version at http://localhost:5173
npm run check       # syntax checks + unit tests
npm run package:mac # build dist/Quarter-Hour Reminders.app (macOS)
```

The packaged app is ad-hoc signed for local use only. On another Mac, right-click it and choose **Open**.
