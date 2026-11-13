import React from 'react'

/* The four view marks — station rows, guide lanes, the station feed and a
   station's info — drawn once and shared by the mode key in the player's
   control row and the station panel's own feed key. One view therefore always
   carries the same glyph wherever its key is drawn. */
function ViewIcon({ view, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {view === 'epg' ? (
        /* guide lanes: staggered two-hour windows */
        <>
          <rect x="1" y="2.5" width="9.5" height="2.2" rx="0.5"/>
          <rect x="4.5" y="6.9" width="9.5" height="2.2" rx="0.5"/>
          <rect x="2" y="11.3" width="7" height="2.2" rx="0.5"/>
        </>
      ) : view === 'news' ? (
        /* station feed: an open journal, ruled columns */
        <path
          fillRule="evenodd"
          d="M1.4 3.5c2.1-.95 4.3-.95 6.6.15 2.3-1.1 4.5-1.1 6.6-.15v9.1c-2.1-.95-4.3-.95-6.6.15-2.3-1.1-4.5-1.1-6.6-.15zM2.9 5.3h3.6v1.1H2.9zM2.9 7.8h3.6v1.1H2.9zM2.9 10.3h3.6v1.1H2.9zM9.5 5.3h3.6v1.1H9.5zM9.5 7.8h3.6v1.1H9.5zM9.5 10.3h3.6v1.1H9.5z"
        />
      ) : view === 'station' ? (
        /* station info: an index plate, the row's own info mark */
        <path
          fillRule="evenodd"
          d="M2.3 1.6h11.4c.72 0 1.3.58 1.3 1.3v10.2c0 .72-.58 1.3-1.3 1.3H2.3c-.72 0-1.3-.58-1.3-1.3V2.9c0-.72.58-1.3 1.3-1.3zM8 3.9a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM7.05 7.5h1.9v4.7h-1.9z"
        />
      ) : (
        /* station rows: a table radio, antenna up, dial at the right */
        <>
          <path
            fillRule="evenodd"
            d="M2.3 5.7h11.4c.72 0 1.3.58 1.3 1.3v6.1c0 .72-.58 1.3-1.3 1.3H2.3c-.72 0-1.3-.58-1.3-1.3V7c0-.72.58-1.3 1.3-1.3zm1.3 2.2h5.2v1.1H3.6zm0 2.3h5.2v1.1H3.6zm0 2.3h5.2v1.1H3.6zm8.2-4.2a2.05 2.05 0 1 0 0 4.1 2.05 2.05 0 0 0 0-4.1z"
          />
          <path d="M6.5 5.7 9.9 1.2l1 .8-3.4 4.5z"/>
        </>
      )}
    </svg>
  )
}

export default ViewIcon
