// Email personalization script
// Generates personalized emails for each station in station-contacts.csv

import fs from 'fs';
import identity from './identity.js';

function parseCsv(csvString) {
  const lines = csvString.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] || '';
    });
    return obj;
  });
}

function generateEmail(station, htmlTemplate, txtTemplate) {
  const variables = {
    station_name: station.name,
    location: station.location,
    webpage: station.webpage,
    url: station.url,
    icon: station.icon,
    epg_maker_url: identity.epgMakerURL,
    contact_email: identity.email
  };
  
  let html = htmlTemplate;
  let txt = txtTemplate;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(placeholder, value);
    txt = txt.replace(placeholder, value);
  }
  
  return { html, txt };
}

function main() {
  const csv = fs.readFileSync('station-contacts.csv', 'utf8');
  const htmlTemplate = fs.readFileSync('email-template.html', 'utf8');
  const txtTemplate = fs.readFileSync('email-template.txt', 'utf8');
  const stations = parseCsv(csv);
  
  console.log(`Generating emails for ${stations.length} stations...\n`);
  
  stations.forEach(station => {
    const { html, txt } = generateEmail(station, htmlTemplate, txtTemplate);
    
    const slug = station.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const htmlPath = `emails/${slug}.html`;
    const txtPath = `emails/${slug}.txt`;
    
    fs.mkdirSync('emails', { recursive: true });
    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(txtPath, txt);
    
    console.log(`[${station.id}] ${station.name} → ${htmlPath}`);
    console.log(`    Contact: ${station.contact_method === 'email' ? station.mailto : 'Website contact form'}\n`);
  });
  
  console.log('Done! Check the /emails folder for personalized emails.');
}

main();