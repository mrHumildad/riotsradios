import { useCallback, useEffect, useState } from 'react'
import { FAVORITES_KEY, createFavoritesStore } from '../lib/favoritesStore.js'

/** One favourites store for the whole app.

    The station row's flame is the only favourite toggle, so every row and the
    order it feeds read the same ids. State lives here rather than in a
    component: rows unmount as the list scrolls, favourites must not. */
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
