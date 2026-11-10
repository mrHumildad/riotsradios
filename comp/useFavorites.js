import { useCallback, useEffect, useState } from 'react'
import { FAVORITES_KEY, createFavoritesStore } from '../lib/favoritesStore.js'

/** One favourites store for the whole app.

    The station row's flame and the station modal's toggle both read these ids,
    so the two indicators can never disagree. State lives here rather than in a
    component: the modal unmounts on close, favourites must not. */
export function useFavorites() {
  const [store] = useState(() => createFavoritesStore())
  const [ids, setIds] = useState(() => store.read())

  /* Another tab or window writing the same key refreshes this one. `key` is
     null when storage was cleared wholesale, which also means "read again". */
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== null && event.key !== FAVORITES_KEY) return
      setIds(store.read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store])

  const toggleFavorite = useCallback((id) => {
    setIds(current => store.toggle(id, current))
  }, [store])

  const isFavorite = useCallback((id) => ids.includes(id), [ids])

  return { ids, isFavorite, toggleFavorite }
}
