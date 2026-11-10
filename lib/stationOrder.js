/** Sort the catalog for the channel list: favourites first, the most recently
    favourited on top, then everything else in catalog order.

    Each entry keeps the station's *catalog index*, because selection, the
    `#station-<index>` DOM id and every player callback address stations by
    that index — reordering the view must never renumber the catalog. Ids that
    are no longer in the catalog are simply ignored. */
export function orderStations(stations, favoriteIds = []) {
  const recency = new Map()
  favoriteIds.forEach((id, position) => {
    /* The store appends, so a higher position means a newer favourite. */
    recency.set(id, position + 1)
  })

  return stations
    .map((station, index) => ({ station, index, rank: recency.get(station.id) || 0 }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : b.rank - a.rank))
}
