// Simple EPG validator script
// Run: node scripts/validate-epgs.js

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const PUBLIC_DIR = 'public/EPGs'

function parseTime(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function validateProgram(p, shows, idx, showIds) {
  const errors = []
  
  if (!p.start || !/^\d{2}:\d{2}$/.test(p.start)) {
    errors.push(`  [${idx}] Invalid start: ${p.start}`)
  }
  if (!p.end || !/^\d{2}:\d{2}$/.test(p.end)) {
    errors.push(`  [${idx}] Invalid end: ${p.end}`)
  }
  
  if (p.start && p.end) {
    const startMin = parseTime(p.start)
    const endMin = parseTime(p.end)
    if (endMin <= startMin && !p.crosses_midnight) {
      errors.push(`  [${idx}] end must be after start`)
    }
  }
  
  // Check show_id reference
  if (p.show_id && !Object.prototype.hasOwnProperty.call(shows, p.show_id)) {
    errors.push(`  [${idx}] show_id "${p.show_id}" not found in shows`)
  }
  
  // Inline title+category required if no show_id
  if (!p.show_id && (!p.title || !p.category)) {
    errors.push(`  [${idx}] title and category required when no show_id`)
  }
  
  return errors
}

async function validateFile(filePath, filename) {
  console.log(`\nValidating ${filename}...`)
  const content = await readFile(filePath, 'utf8')
  let data
  try {
    data = JSON.parse(content)
  } catch (e) {
    console.error(`  ❌ JSON parse error: ${e.message}`)
    return false
  }
  
  const errors = []
  
  // Version check
  if (data.version !== '2.0') {
    console.log('  ℹ️  Old v1 format or missing version - some checks skipped')
  }
  
  // Show ID collection
  const shows = data.shows || {}
  const showIds = new Set(Object.keys(shows))
  
  // Days validation
  if (!data.days || !Array.isArray(data.days)) {
    console.error('  ❌ No days array')
    return false
  }
  
  for (const [dayIdx, day] of data.days.entries()) {
    const dayLabel = day.label || day.day
    if (!day.programs || !Array.isArray(day.programs)) {
      errors.push(`Day ${dayLabel}: no programs array`)
      continue
    }
    
    // Check for overlaps
    const sorted = [...day.programs].map((p, i) => ({ ...p, idx: i }))
      .sort((a, b) => parseTime(a.start) - parseTime(b.start))
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      const prevEnd = prev.crosses_midnight ? 24 * 60 : parseTime(prev.end || prev.start)
      const currStart = parseTime(curr.start)
      if (currStart < prevEnd) {
        errors.push(`Day ${dayLabel}: overlap between "${prev.title || prev.show_id}" and "${curr.title || curr.show_id}"`)
      }
    }
    
    // Validate each program
    for (const [progIdx, prog] of day.programs.entries()) {
      const progErrors = validateProgram(prog, shows, progIdx, showIds)
      errors.push(...progErrors)
    }
  }
  
  if (errors.length > 0) {
    errors.forEach(e => console.error(e))
    return false
  }
  
  console.log('  ✅ Valid')
  return true
}

async function main() {
  try {
    const files = await readdir(PUBLIC_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('schema'))
    
    let passed = 0
    for (const f of jsonFiles) {
      const fullPath = join(PUBLIC_DIR, f)
      if (await validateFile(fullPath, f)) passed++
    }
    
    console.log(`\n${passed}/${jsonFiles.length} files valid`)
    process.exit(passed !== jsonFiles.length ? 1 : 0)
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  }
}

main()