// What reaches the entity from outside: weather, headlines, messages from strangers.
// Every source is best-effort: a failure returns null/[] and never breaks a tick.

export type Visitor = { id: number; body: string }

export type WorldInputs = {
  weather: string | null
  headlines: string[]
  visitors: Visitor[]
}

const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'rime fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  56: 'freezing drizzle', 57: 'heavy freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  66: 'freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light showers', 81: 'showers', 82: 'violent showers',
  85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(3500), cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

async function fetchWeather(): Promise<string | null> {
  try {
    const lat = process.env.WORLD_LAT ?? '51.48'
    const lon = process.env.WORLD_LON ?? '0'
    const place = process.env.WORLD_PLACE ?? ''
    const j = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,is_day`
    )
    const c = j.current
    if (!c || typeof c.temperature_2m !== 'number') return null
    const sky = WMO[c.weather_code as number] ?? 'unclear conditions'
    return `${sky}, ${c.temperature_2m}°C, wind ${c.wind_speed_10m} km/h, ${c.is_day ? 'daylight' : 'dark'}` +
      (place ? ` — ${place}` : '')
  } catch {
    return null
  }
}

async function fetchHeadlines(count = 3): Promise<string[]> {
  try {
    const ids: number[] = await getJson('https://hacker-news.firebaseio.com/v0/topstories.json')
    const pool = ids.slice(0, 30).sort(() => Math.random() - 0.5).slice(0, count)
    const items = await Promise.all(
      pool.map(id => getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null))
    )
    return items
      .map(i => (i && typeof i.title === 'string' ? i.title.replace(/\s+/g, ' ').trim().slice(0, 140) : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function getWorld(visitors: Visitor[]): Promise<WorldInputs> {
  const [weather, headlines] = await Promise.all([fetchWeather(), fetchHeadlines()])
  return { weather, headlines, visitors }
}
