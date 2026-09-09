import { useState, useEffect, } from "react";
import { Autocomplete, TextField, Slider, Typography, Box } from "@mui/material";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

// Override the default icon configuration
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Leaflet requires a fixed height to render
const MAP_STYLE = { 
  height: "300px", 
  width: "100%", 
  borderRadius: "8px", 
  marginTop: "16px",
  zIndex: 0 // Prevents the map from overlapping MUI dropdowns
};
const DEFAULT_CENTER: [number, number] = [20.2961, 85.8245]; 

interface LocationPickerProps {
  lat?: number;
  lng?: number;
  radius: number;
  onChange: (lat: number, lng: number, radius: number) => void;
}

// Utility component to handle map clicks and marker dragging
const MapController = ({ position, setPosition, radius, onChange }: any) => {
  const map = useMap();

  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      onChange(e.latlng.lat, e.latlng.lng, radius);
    },
  });

  useEffect(() => {
    if (position) map.flyTo(position, map.getZoom());
  }, [position, map]);

  return position ? (
    <>
      <Marker 
        position={position} 
        draggable 
        eventHandlers={{
          dragend: (e) => {
            const marker = e.target;
            const pos = marker.getLatLng();
            setPosition([pos.lat, pos.lng]);
            onChange(pos.lat, pos.lng, radius);
          }
        }} 
      />
      <Circle center={position} radius={radius} pathOptions={{ color: 'primary.main', fillColor: 'primary.light' }} />
    </>
  ) : null;
};

export default function LocationPicker({ lat, lng, radius, onChange }: LocationPickerProps) {
  const [position, setPosition] = useState<[number, number] | null>(
    lat && lng ? [lat, lng] : DEFAULT_CENTER
  );
  
  const [options, setOptions] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState("");

  // Debounced Nominatim Search
  useEffect(() => {
    if (inputValue.length < 3) return;
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${inputValue}`);
        const data = await res.json();
        setOptions(data);
      } catch (error) {
        console.error("Search failed", error);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [inputValue]);

  return (
    <Box>
      <Autocomplete
        options={options}
        getOptionLabel={(option) => option.display_name || ""}
        onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
        onChange={(_, newValue) => {
          if (newValue) {
            const newLat = parseFloat(newValue.lat);
            const newLng = parseFloat(newValue.lon);
            setPosition([newLat, newLng]);
            onChange(newLat, newLng, radius);
          }
        }}
        renderInput={(params) => <TextField {...params} label="Search Location" variant="outlined" fullWidth />}
      />

      <MapContainer center={position || DEFAULT_CENTER} zoom={13} style={MAP_STYLE}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapController position={position} setPosition={setPosition} radius={radius} onChange={onChange} />
      </MapContainer>

      <Box mt={2} px={1}>
        <Typography gutterBottom>Verification Radius: {radius} meters</Typography>
        <Slider
          value={radius}
          min={50}
          max={1000}
          step={50}
          onChange={(_, newValue) => onChange(position?.[0] || 0, position?.[1] || 0, newValue as number)}
          valueLabelDisplay="auto"
        />
      </Box>
    </Box>
  );
}