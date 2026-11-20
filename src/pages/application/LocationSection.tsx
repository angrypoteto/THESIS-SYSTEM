import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import type { SectionProps } from './ApplicationPage'
import { SaveBar, useSave } from './SaveBar'

// Leaflet's default icon prefixes an auto-detected image path onto these URLs, which breaks
// bundled assets (the marker 404s). An explicit icon uses the imported URLs as they are.
const pinIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
})

const PARANAQUE: [number, number] = [14.4793, 121.0198]

function ClickToPin({ onPick, disabled }: { onPick: (lat: number, lng: number) => void; disabled: boolean }) {
  useMapEvents({
    click(e) {
      if (!disabled) onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export function LocationSection({ data, readOnly, reload }: SectionProps) {
  const a = data.applicant
  const [pin, setPin] = useState<[number, number] | null>(a.home_lat != null && a.home_lng != null ? [a.home_lat, a.home_lng] : null)
  const save = useSave()

  async function onSave() {
    if (!pin) return save.fail('Tap the map to place the pin on your home.')
    await save.run(async () => {
      const { error } = await supabase
        .from('applicants')
        .update({ home_lat: Number(pin[0].toFixed(6)), home_lng: Number(pin[1].toFixed(6)), pin_source: 'map_pin' })
        .eq('id', a.id)
      if (error) throw error
      await reload()
    })
  }

  function useMyLocation() {
    if (!navigator.geolocation) return save.fail('This browser cannot share your location. Tap the map instead.')
    navigator.geolocation.getCurrentPosition(
      (p) => setPin([p.coords.latitude, p.coords.longitude]),
      () => save.fail('Location permission was denied. Tap the map instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <section className="card">
      <h2>Where is your home?</h2>
      <p className="muted">
        Zoom in and tap the exact spot of your house. The pin is used to check that your home is inside your barangay
        and helps the office find it if a home visit is needed.
      </p>
      {!readOnly && (
        <button className="button ghost small" onClick={useMyLocation}>
          Use my current location
        </button>
      )}
      <div className="map">
        <MapContainer center={pin ?? PARANAQUE} zoom={pin ? 17 : 14} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPin onPick={(lat, lng) => setPin([lat, lng])} disabled={readOnly} />
          {pin && (
            <Marker
              position={pin}
              icon={pinIcon}
              draggable={!readOnly}
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng()
                  setPin([ll.lat, ll.lng])
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="muted small">
        {pin ? `Pinned at ${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}. Drag the pin to adjust.` : 'No pin yet.'}
      </p>
      {!readOnly && <SaveBar state={save} onSave={onSave} label="Save location" />}
    </section>
  )
}
