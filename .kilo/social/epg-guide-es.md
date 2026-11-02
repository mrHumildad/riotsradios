# EPG Maker - Guía para emitir

## ¿Qué es EPG Maker?

Una herramienta para crear y mantener guías de programación (EPG) en formato JSON para tu radio. Los oyentes de RIOTSRADIOS podrán ver qué programa están escuchando en tiempo real.

## URL de la herramienta
https://mrhumildad.github.io/epg_maker/

## Formato del archivo JSON

```json
{
  "version": "2.0",
  "station": "NOMBRE DE TU RADIO",
  "station_id": 1,
  "schedule_type": "weekly",
  "timezone": "Europe/Madrid",
  "last_updated": "2026-01-15",
  "source": "https://tu-radio.org/programacion",
  "contact": "programacion@tu-radio.org",
  "notes": "Notas sobre programación (ej: programas quincenales marcados con *)",

  "metadata": {
    "categories": {
      "musica": "Música",
      "podcast": "Podcast / Reemisión",
      "directo": "En vivo",
      "especial": "Especial",
      "taller": "Taller"
    },
    "default_filler": {
      "title": "Música",
      "category": "musica"
    }
  },

  "shows": {
    "programa-ejemplo": {
      "title": "Nombre del Programa",
      "category": "directo",
      "url": "https://tu-radio.org/programa/ejemplo/",
      "description": "Descripción opcional",
      "hosts": "Nombres de presentadores",
      "recurrence_note": "* Quincenal (cada dos semanas)"
    }
  },

  "days": [
    {
      "day": "monday",
      "label": "Lunes",
      "programs": [
        { "start": "00:00", "end": "02:00", "show_id": "programa-ejemplo", "live": true },
        { "start": "02:00", "end": "02:30", "title": "Música", "category": "musica" }
      ]
    }
  ]
}
```

## Pasos para crear tu EPG

### 1. Usa el template
Copia el archivo `dist/EPGs/template.json` como base.

### 2. Completa los metadatos
- `station`: Nombre oficial de tu radio
- `station_id`: Tu ID en RIOTSRADIOS (ver `stations.csv`)
- `timezone`: Zona horaria (ej: Europe/Madrid, Europe/Berlin)
- `source`: URL de tu página de programación
- `contact`: Email de contacto para la programación

### 3. Define las categorías
Personaliza los nombres según tu radio (español, euskera, italiano, etc.)

### 4. Registra tus programas
En el objeto `shows`, crea una entrada por cada programa:
```json
"shows": {
  "identificador-unico": {
    "title": "Nombre del Programa",
    "category": "directo",
    "url": "https://tu-radio.org/programa/url/",
    "hosts": "Presentador/a"
  }
}
```

### 5. Programa la semana
En `days`, lista los horarios. Usa `show_id` para vincular a un programa existente, o usa `title`/`category` directamente para bloques automáticos de música.

### 6. Publica el archivo
Sube el JSON a tu web (ej: `https://tu-radio.org/epg.json`)

### 7. Notifícame
Envíame un email a `riotsradios@proton.me` con la URL para incluirla en RIOTSRADIOS.

## Campos importantes

| Campo | Descripción |
|-------|-------------|
| `live: true` | El programa está emitiéndose en vivo ahora |
| `crosses_midnight: true` | El programa cruza la medianoche (ej: 23:00-01:00) |
| `recurrence_note` | Notas sobre periodicidad (quincenal, mensual) |

## Preguntas frecuentes

**¿Puedo usar otro formato de hora?**
Solo el formato 24h HH:MM es soportado.

**¿Qué pasa si no tengo todos los horarios?**
Puedes crear entradas parciales. Lo importante es tener la información básica.

**¿Cómo actualizo la programación?**
Simplemente reemplaza el archivo JSON en tu web y actualiza `last_updated`.