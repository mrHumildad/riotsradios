import React, { useEffect, useRef, useState } from 'react'
import { STATION_FIELDS, STATION_FIELD_SECTIONS, stationField } from '../lib/stationFields.js'

const API_URL = `${import.meta.env.BASE_URL}__catalog/stations`

/* Fields the parsed station carries for tooling, not for the CSV. */
const HIDDEN_KEYS = new Set(['_line', '_fieldCount', 'health'])

function catalogValues(station) {
  const values = {}
  for (const [key, value] of Object.entries(station)) {
    if (HIDDEN_KEYS.has(key)) continue
    values[key] = value == null ? '' : String(value)
  }
  return values
}

function blankValues(nextId) {
  const values = {}
  for (const field of STATION_FIELDS) {
    values[field.key] = field.key === 'id' ? String(nextId ?? '') : ''
  }
  return values
}

/*
 * Live preview of the icon URL being typed.
 *
 * The list already hides a station icon that fails to load, which makes a dead
 * URL invisible there — this shows the failure while the URL is still editable.
 */
function IconPreview({ url }) {
  const value = String(url || '').trim()
  const [state, setState] = useState('idle')   /* idle | ok | bad */

  useEffect(() => {
    setState('idle')
  }, [value])

  const label =
    value === ''
      ? 'No icon URL yet'
      : state === 'ok'
        ? 'Icon loads'
        : state === 'bad'
          ? 'Image could not be loaded'
          : 'Loading preview…'

  return (
    <div className="station-edit-icon-preview">
      <div className="station-edit-icon-frame">
        {value === '' || state === 'bad' ? (
          <span className="station-edit-icon-empty" aria-hidden="true">
            {value === '' ? '—' : '!'}
          </span>
        ) : (
          <img
            key={value}
            src={value}
            alt=""
            referrerPolicy="no-referrer"
            onLoad={() => setState('ok')}
            onError={() => setState('bad')}
          />
        )}
      </div>
      <span className={`station-edit-icon-status${state === 'ok' ? ' ok' : ''}${state === 'bad' ? ' bad' : ''}`}>
        {label}
      </span>
    </div>
  )
}

/* Rebuild the form sections for the current values, keeping unknown CSV
   columns visible at the end instead of dropping them. */
function buildSections(values) {
  const known = new Set(STATION_FIELD_SECTIONS.flatMap((section) => section.keys))
  const sections = STATION_FIELD_SECTIONS
    .map((section) => ({
      title: section.title,
      columns: section.keys.filter((key) => key in values).map(stationField),
    }))
    .filter((section) => section.columns.length > 0)

  const extra = Object.keys(values).filter((key) => !known.has(key))
  if (extra.length > 0) sections.push({ title: 'Other columns', columns: extra.map(stationField) })
  return sections
}

/**
 * Development-only modal that edits, adds and deletes stations.csv rows.
 *
 * Opened with a station → edit mode; opened with `null` → create mode (new row
 * appended with the next free id). Saves, deletions and the catalog validator's
 * verdict are shown in place, and `onSaved` / `onDeleted` refresh the app's
 * station list so the change is playable straight away.
 */
function StationEditModal({ station, nextId, onClose, onSaved, onDeleted }) {
  /* The row this modal is bound to; null while creating. A successful create
     switches the modal to editing that new row without remounting. */
  const [line, setLine] = useState(station ? station._line : null)
  const [values, setValues] = useState(() => (station ? catalogValues(station) : blankValues(nextId)))
  const [original, setOriginal] = useState(() => (station ? catalogValues(station) : blankValues(nextId)))
  const [validation, setValidation] = useState(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef(null)

  const creating = line == null

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty = Object.keys(values).some((key) => values[key] !== original[key])
  const sections = buildSections(values)

  const setField = (key, value) => setValues((prev) => ({ ...prev, [key]: value }))

  async function send(method, body) {
    const response = await fetch(API_URL, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    return data
  }

  async function save(event) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setStatus({ tone: '', text: creating ? 'Adding…' : 'Saving…' })

    try {
      const data = creating ? await send('POST', { values }) : await send('PUT', { line, edits: values })

      if (creating) setLine(data.row.line)

      const stored = {}
      for (const key of Object.keys(values)) stored[key] = data.row.values[key] ?? ''
      setValues(stored)
      setOriginal(stored)
      setValidation(data.validation)

      if (onSaved) await onSaved(data)

      if (data.created) {
        setStatus(
          data.validation.ok
            ? { tone: 'ok', text: `Added as id ${data.row.values.id} on line ${data.row.line}` }
            : { tone: 'bad', text: 'Added — catalog check found errors' }
        )
      } else if (!data.saved) {
        setStatus({ tone: '', text: 'No changes to save.' })
      } else if (!data.validation.ok) {
        setStatus({ tone: 'bad', text: 'Saved — catalog check found errors' })
      } else {
        setStatus({ tone: 'ok', text: `Saved line ${data.row.line} · ${data.changes.length} field(s)` })
      }
    } catch (error) {
      setStatus({ tone: 'bad', text: `Could not save: ${error.message}` })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (creating || busy) return
    const label = values.name || 'this station'
    const confirmed = window.confirm(
      `Delete "${label}" from stations.csv?\n\n` +
        'Its row, its id and its health history are removed, and later rows shift up one line. ' +
        'If the station might come back, tick "Hidden (stream broken)" instead.'
    )
    if (!confirmed) return

    setBusy(true)
    setStatus({ tone: '', text: 'Deleting…' })

    try {
      const data = await send('DELETE', { line })
      if (onDeleted) await onDeleted(data)
    } catch (error) {
      setStatus({ tone: 'bad', text: `Could not delete: ${error.message}` })
      setBusy(false)
    }
  }

  return (
    <div className="station-edit-overlay" onClick={onClose}>
      <form
        className="station-edit-modal"
        id="station-edit-form"
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-label={creating ? 'Add a station' : `Edit ${values.name || 'station'}`}
        onClick={(event) => event.stopPropagation()}
        onSubmit={save}
      >
        <div className="station-edit-header">
          <div className="station-edit-heading">
            <div className="station-edit-title">
              {creating ? 'New station' : values.name || '(unnamed station)'}
            </div>
            <div className="station-edit-meta">
              {creating
                ? `new row · id ${values.id || nextId} · line assigned on add`
                : `id ${values.id} · stations.csv line ${line}`}
            </div>
          </div>
          <button type="button" className="epg-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="station-edit-body">
          {sections.map((section) => (
            <fieldset className="station-edit-section" key={section.title}>
              <legend>{section.title}</legend>
              {section.columns.map((column) => {
                const inputId = `station-edit-${column.key}`

                if (column.type === 'checkbox') {
                  return (
                    <div className="station-edit-field" key={column.key}>
                      <label className="station-edit-check" htmlFor={inputId}>
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={String(values[column.key] || '').toLowerCase() === 'true'}
                          onChange={(event) =>
                            setField(column.key, event.target.checked ? 'true' : '')
                          }
                        />
                        <span>{column.label}</span>
                      </label>
                      {column.hint && <p className="station-edit-hint">{column.hint}</p>}
                    </div>
                  )
                }

                return (
                  <div className="station-edit-field" key={column.key}>
                    <label htmlFor={inputId}>{column.label}</label>
                    <input
                      id={inputId}
                      type="text"
                      value={values[column.key] ?? ''}
                      readOnly={column.readonly}
                      spellCheck={false}
                      autoFocus={column.key === 'name'}
                      onChange={(event) => setField(column.key, event.target.value)}
                    />
                    {column.hint && <p className="station-edit-hint">{column.hint}</p>}
                    {column.key === 'icon' && <IconPreview url={values.icon} />}
                  </div>
                )
              })}
            </fieldset>
          ))}
        </div>

        {validation && (
          <div className={`station-edit-validation ${validation.ok ? 'ok' : 'bad'}`}>
            <div className="station-edit-validation-title">
              Catalog check {validation.ok ? 'passed' : 'found errors'}
            </div>
            <pre>{validation.output}</pre>
          </div>
        )}

        <div className="station-edit-footer">
          <button type="submit" className="station-edit-save" disabled={busy}>
            {busy ? 'SAVING…' : creating ? 'ADD STATION' : 'SAVE'}
          </button>
          <button
            type="button"
            className="station-edit-revert"
            onClick={() => setValues({ ...original })}
            disabled={busy || !dirty}
          >
            REVERT
          </button>
          {!creating && (
            <button type="button" className="station-edit-delete" onClick={remove} disabled={busy}>
              DELETE
            </button>
          )}
          {status && <span className={`station-edit-status ${status.tone}`}>{status.text}</span>}
        </div>
      </form>
    </div>
  )
}

export default StationEditModal
