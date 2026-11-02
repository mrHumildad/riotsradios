# EPG Maker - Guide for Broadcasters

## What is EPG Maker?

A tool to create and maintain program guides (EPG) in JSON format for your radio. Listeners of RIOTSRADIOS will be able to see what program they're listening to in real time.

## Tool URL
https://mrhumildad.github.io/epg_maker/

## JSON File Format

```json
{
  "version": "2.0",
  "station": "YOUR RADIO NAME",
  "station_id": 1,
  "schedule_type": "weekly",
  "timezone": "Europe/Madrid",
  "last_updated": "2026-01-15",
  "source": "https://your-radio.org/schedule",
  "contact": "schedule@your-radio.org",
  "notes": "Schedule notes (e.g., biweekly shows marked with *)",

  "metadata": {
    "categories": {
      "music": "Music",
      "podcast": "Podcast / Rerun",
      "live": "Live",
      "special": "Special",
      "workshop": "Workshop"
    },
    "default_filler": {
      "title": "Music",
      "category": "music"
    }
  },

  "shows": {
    "show-example": {
      "title": "Show Name",
      "category": "live",
      "url": "https://your-radio.org/show/example/",
      "description": "Optional description",
      "hosts": "Host names",
      "recurrence_note": "* Biweekly (every two weeks)"
    }
  },

  "days": [
    {
      "day": "monday",
      "label": "Monday",
      "programs": [
        { "start": "00:00", "end": "02:00", "show_id": "show-example", "live": true },
        { "start": "02:00", "end": "02:30", "title": "Music", "category": "music" }
      ]
    }
  ]
}
```

## Steps to Create Your EPG

### 1. Use the Template
Copy the `dist/EPGs/template.json` file as your base.

### 2. Fill Metadata
- `station`: Official name of your radio
- `station_id`: Your ID in RIOTSRADIOS (see `stations.csv`)
- `timezone`: Timezone (e.g., Europe/Madrid, Europe/Berlin)
- `source`: URL of your schedule page
- `contact`: Contact email for scheduling

### 3. Define Categories
Customize names to your language (Spanish, Basque, Italian, etc.)

### 4. Register Your Shows
In the `shows` object, create one entry per program:
```json
"shows": {
  "unique-identifier": {
    "title": "Show Name",
    "category": "live",
    "url": "https://your-radio.org/show/url/",
    "hosts": "Host name"
  }
}
```

### 5. Schedule the Week
In `days`, list time slots. Use `show_id` to link to an existing show, or use `title`/`category` directly for automatic music blocks.

### 6. Publish the File
Upload the JSON to your website (e.g., `https://your-radio.org/epg.json`)

### 7. Notify Me
Email `riotsradios@proton.me` with the URL to include it in RIOTSRADIOS.

## Important Fields

| Field | Description |
|-------|-------------|
| `live: true` | The show is broadcasting live now |
| `crosses_midnight: true` | Show crosses midnight (e.g., 23:00-01:00) |
| `recurrence_note` | Notes about periodicity (biweekly, monthly) |

## FAQ

**Can I use another time format?**
Only 24h HH:MM format is supported.

**What if I don't have all the schedules?**
You can create partial entries. The important part is having basic information.

**How do I update the schedule?**
Simply replace the JSON file on your website and update `last_updated`.