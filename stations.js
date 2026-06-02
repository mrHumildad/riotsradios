import csvRaw from './stations.csv?raw'

function parseCsv(csvString) {
  const lines = csvString.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  
  return lines.slice(1).map(line => {
    const values = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    
    const obj = {}
    headers.forEach((header, idx) => {
      const val = values[idx] || ''
      if (header === 'id') {
        obj[header] = parseInt(val, 10)
      } else if (header) {
        obj[header] = val
      }
    })
    return obj
  })
}

export const stations = parseCsv(csvRaw).filter(s => !s.stream_broken)