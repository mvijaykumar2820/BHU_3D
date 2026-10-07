import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, Sky, Environment, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useAreaStore, useHiddenStore, useAnnotationStore } from "../store";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// ─── VPMS uses a fixed SCALE constant, NOT the Earth radius ───
const SCALE = 51000;

function createProjection(refLat, refLng) {
  return (lat, lng) => {
    const x = (lng - refLng) * SCALE * Math.cos((refLat * Math.PI) / 180);
    const y = (lat - refLat) * SCALE;
    return new THREE.Vector2(x, y);
  };
}

// ─── Color palette ───
const BUILDING_COLORS = {
  residential: "#b8a99a",
  apartments: "#b0a090",
  commercial: "#a0aab0",
  retail: "#a5b0a8",
  industrial: "#8a9098",
  office: "#9aa5b0",
  church: "#c8b8a0",
  school: "#a0b0a0",
  university: "#98a8a0",
  hospital: "#b0a0a8",
  default: "#9da0a3",
};

const HOVERED_COLOR = "#d4c8b8";
const SELECTED_COLOR = "#38b2ac";

const ANNOTATION_COLORS = {
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  green: "#22c55e",
};

function getBuildingColor(tags) {
  const buildingType = tags?.building ?? "default";
  return BUILDING_COLORS[buildingType] ?? BUILDING_COLORS.default;
}

// ─── ULPIN ───
// ─── 3D-ULPIN Generator (Hackathon Spec) ───
// Format: PNIU14 + Domain (A/S/B/U) + Floor (Base32) + Checksum
const BASE32_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateChecksum(baseStr) {
  // Simple cyclic redundancy checksum mock for the prototype
  let sum = 0;
  for (let i = 0; i < baseStr.length; i++) {
    sum += baseStr.charCodeAt(i);
  }
  return BASE32_CHARS[sum % 32];
}

function generate3DUlpin(lat, lng, domain, floorIndex) {
  // PNIU14 (Base Surface Centroid)
  const latPart = Math.abs(Math.round((lat + 90) * 100000)).toString().padStart(7, "0");
  const lngPart = Math.abs(Math.round((lng + 180) * 100000)).toString().padStart(7, "0");
  const base14 = `${latPart}${lngPart}`;

  // Domain (A=Above, S=Surface, B=Basement, U=Utility)
  const domainChar = domain.charAt(0).toUpperCase();

  // Vertical Elevation Index (Z_encoded - 2 chars Base32)
  const zNorm = floorIndex + 10;
  const zEncoded = zNorm.toString(32).toUpperCase().padStart(2, "0");

  const partialUlpin = `${base14}${domainChar}${zEncoded}`;
  const checksum = generateChecksum(partialUlpin);

  return `${partialUlpin}${checksum}`;
}

// ─── Building Component with Floor Slicing ───
function Building({ shape, extrudeSettings, tags, buildingId, markerPosition, rawCenter, floorCount }) {
  const [hovered, setHovered] = useState(false);
  const [hoverPos, setHoverPos] = useState(null);
  const [hoveredFloor, setHoveredFloor] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);

  const selectedBuildingId = useHiddenStore((s) => s.selectedBuildingId);
  const selectBuilding = useHiddenStore((s) => s.selectBuilding);
  const toggleHidden = useHiddenStore((s) => s.toggleHidden);
  
  const annotation = useAnnotationStore((s) => s.annotations[buildingId]);
  const upsertAnnotation = useAnnotationStore((s) => s.upsertAnnotation);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);

  const selected = selectedBuildingId === buildingId;

  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [annotTitle, setAnnotTitle] = useState("");
  const [annotNotes, setAnnotNotes] = useState("");
  const [annotColor, setAnnotColor] = useState("red");

  const closePopup = () => {
    setHovered(false);
    setHoveredFloor(null);
    setSelectedFloor(null);
    setShowAnnotationForm(false);
    selectBuilding(null);
  };

  const openAnnotationEditor = () => {
    setAnnotTitle(annotation?.title ?? "");
    setAnnotNotes(annotation?.notes ?? "");
    setAnnotColor(annotation?.color ?? "red");
    setShowAnnotationForm(true);
  };

  const baseColor = getBuildingColor(tags);
  const displayColor = selected ? SELECTED_COLOR : hovered ? HOVERED_COLOR : baseColor;

  const hasAnyData = tags?.name || (tags?.building && tags.building !== "yes") || tags?.height || tags?.["building:levels"] || tags?.amenity;

  // Floor height calculation
  const totalHeight = extrudeSettings.depth;
  const floorHeight = totalHeight / floorCount;

  return (
    <group>
      {/* Annotation marker beacon */}
      {annotation && (
        <group position={markerPosition}>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 8, 12]} />
            <meshBasicMaterial color={ANNOTATION_COLORS[annotation.color]} transparent opacity={0.42} />
          </mesh>
          <pointLight color={ANNOTATION_COLORS[annotation.color]} intensity={0.75} distance={18} />
          <Html position={[0, 8.5, 0]} center>
            <div style={{
              maxWidth: "160px", padding: "4px 8px", borderRadius: "999px",
              backgroundColor: "rgba(255, 255, 255, 0.88)",
              border: `1px solid ${ANNOTATION_COLORS[annotation.color]}44`,
              color: "#111827", boxShadow: "0 8px 20px rgba(15, 23, 42, 0.14)",
              fontSize: "11px", fontWeight: 700, textAlign: "center",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              pointerEvents: "none",
            }}>
              {annotation.title}
            </div>
          </Html>
        </group>
      )}

      {selected ? (
        // SLICED MODE: Render individual floors when selected
        Array.from({ length: floorCount }).map((_, i) => {
          const isHoveredFloor = hoveredFloor === i;
          const floorY = i * floorHeight;
          const gap = 0.15; // Gap between sliced floors
          
          return (
            <mesh
              key={i}
              position={[0, floorY + (i * gap), 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerOver={(e) => { setHoveredFloor(i); e.stopPropagation(); }}
              onPointerOut={(e) => { setHoveredFloor(null); e.stopPropagation(); }}
              onClick={(e) => { 
                if (selectedFloor === i) {
                  setSelectedFloor(null);
                  selectBuilding(null);
                } else {
                  setSelectedFloor(i);
                }
                e.stopPropagation(); 
              }}
            >
              <extrudeGeometry args={[shape, { steps: 1, depth: floorHeight, bevelEnabled: false }]} />
              <meshStandardMaterial 
                color={selectedFloor === i ? "#ef4444" : isHoveredFloor ? "#fbbf24" : SELECTED_COLOR} 
                transparent 
                opacity={(isHoveredFloor || selectedFloor === i) ? 1 : 0.85} 
              />
            </mesh>
          );
        })
      ) : (
        // SOLID MODE: Render normal building block
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerOver={(e) => { setHovered(true); e.stopPropagation(); }}
          onPointerOut={(e) => { setHovered(false); e.stopPropagation(); }}
          onPointerMove={(e) => { setHoverPos(e.point.clone()); e.stopPropagation(); }}
          onClick={(e) => { selectBuilding(buildingId); e.stopPropagation(); }}
          onContextMenu={(e) => {
            e.nativeEvent.preventDefault();
            setHoverPos(e.point.clone());
            selectBuilding(buildingId);
            openAnnotationEditor();
            e.stopPropagation();
          }}
          userData={{ exportToGLB: true }}
        >
          <extrudeGeometry args={[shape, extrudeSettings]} />
          <meshStandardMaterial color={displayColor} />
        </mesh>
      )}

        {/* Fixed Left Panel HUD */}
        {(hovered || selected) && (
          <Html zIndexRange={[100, 0]} style={{ position: "fixed", top: "24px", left: "24px", transform: "none", zIndex: 99999 }}>
            <div
              style={{
                color: "#000000", backgroundColor: "#ffffff96", backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.4)", padding: "16px", borderRadius: "12px",
                fontFamily: "Inter, system-ui, sans-serif", fontSize: "13px",
                width: "280px", boxShadow: "0 12px 32px rgba(0, 0, 0, 0.12)",
              }}
            >
              {/* Title */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: "10px", fontWeight: "600", fontSize: "15px",
                borderBottom: "1px solid rgba(0, 0, 0, 0.08)", paddingBottom: "6px", marginBottom: "8px",
              }}>
                <span>{tags?.name || "Building Information"}</span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); closePopup(); }}
                  style={{
                    width: "24px", height: "24px", display: "inline-flex",
                    alignItems: "center", justifyContent: "center",
                    border: "1px solid rgba(0, 0, 0, 0.08)", borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.72)", color: "#5f6368",
                    cursor: "pointer", fontSize: "16px", padding: "0",
                  }}
                >×</button>
              </div>

              {/* Annotation Form */}
              {showAnnotationForm ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); e.stopPropagation();
                    if (!annotTitle.trim()) return;
                    upsertAnnotation(buildingId, { title: annotTitle.trim(), notes: annotNotes.trim(), color: annotColor });
                    setShowAnnotationForm(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: "grid", gap: "8px", marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid rgba(0, 0, 0, 0.08)" }}
                >
                  <input value={annotTitle} onChange={(e) => setAnnotTitle(e.target.value)} placeholder="Title" maxLength={48}
                    style={{ width: "100%", border: "1px solid rgba(17, 24, 39, 0.12)", borderRadius: "6px", padding: "7px 8px", backgroundColor: "rgba(255, 255, 255, 0.82)", color: "#111827", fontSize: "12px", outline: "none" }} />
                  <textarea value={annotNotes} onChange={(e) => setAnnotNotes(e.target.value)} placeholder="Notes" rows={3} maxLength={220}
                    style={{ width: "100%", resize: "vertical", border: "1px solid rgba(17, 24, 39, 0.12)", borderRadius: "6px", padding: "7px 8px", backgroundColor: "rgba(255, 255, 255, 0.82)", color: "#111827", fontSize: "12px", outline: "none" }} />
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {Object.entries(ANNOTATION_COLORS).map(([key, color]) => (
                      <button key={key} type="button" onClick={() => setAnnotColor(key)}
                        style={{ width: "22px", height: "22px", borderRadius: "999px", border: annotColor === key ? "2px solid #111827" : "1px solid rgba(17, 24, 39, 0.16)", backgroundColor: color, cursor: "pointer", padding: 0 }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                    {annotation && <button type="button" onClick={() => { removeAnnotation(buildingId); setShowAnnotationForm(false); }} style={{ border: "none", backgroundColor: "transparent", color: "#ef4444", cursor: "pointer", fontSize: "12px" }}>Delete</button>}
                    <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
                      <button type="button" onClick={() => setShowAnnotationForm(false)} style={{ border: "1px solid rgba(17, 24, 39, 0.12)", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.72)", color: "#374151", cursor: "pointer", fontSize: "12px", padding: "6px 9px" }}>Cancel</button>
                      <button type="submit" disabled={!annotTitle.trim()} style={{ border: "none", borderRadius: "6px", backgroundColor: annotTitle.trim() ? "#2563eb" : "rgba(148, 163, 184, 0.42)", color: "#ffffff", cursor: annotTitle.trim() ? "pointer" : "not-allowed", fontSize: "12px", fontWeight: 700, padding: "6px 10px" }}>Save</button>
                    </div>
                  </div>
                </form>
              ) : null}

              {/* Core info OR Floor Info */}
              {selectedFloor !== null ? (
                <div style={{ marginTop: "12px", borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#111827", marginBottom: "8px" }}>
                    Unit {selectedFloor + 1}01 Details
                  </div>
                  <InfoRow label="Floor Level" value={selectedFloor + 1} />
                  <InfoRow label="Cadastral ID" value={generate3DUlpin(rawCenter.lat, rawCenter.lng, "A", selectedFloor + 1)} />
                  <InfoRow label="Type" value="Commercial / IT Office" />
                  <InfoRow label="Owner" value={["Ramesh Kumar", "Suresh Reddy", "Priya Sharma", "Abdul Khan", "Neha Gupta", "Vikram Singh", "Anjali Desai"][(buildingId + selectedFloor) % 7]} />
                  <div style={{ marginTop: "8px", fontSize: "12px", color: "#059669", backgroundColor: "#ecfdf5", padding: "6px", borderRadius: "6px", border: "1px solid #a7f3d0" }}>
                    Verified & Registered correctly.
                  </div>
                </div>
              ) : hasAnyData ? (
                <>
                  {tags?.building && tags.building !== "yes" && <InfoRow label="Type" value={tags.building} />}
                  {tags?.height && <InfoRow label="Height" value={`${tags.height} m`} />}
                  {tags?.["building:levels"] && <InfoRow label="Levels" value={tags["building:levels"]} />}
                  {tags?.amenity && <InfoRow label="Facility" value={tags.amenity} />}
                </>
              ) : (
                <div style={{ color: "#8f8f96", fontSize: "12px", textAlign: "center", padding: "6px 0" }}>No data available</div>
              )}

              {/* 3D-ULPIN Cadastral Registry (Hackathon Spec) */}
              <div style={{ margin: "10px 0 8px", borderTop: "1px solid rgba(0, 0, 0, 0.08)", paddingTop: "8px" }}>
                <div style={{ fontWeight: "700", marginBottom: "6px", color: "#374151", fontSize: "12px", display: "flex", justifyContent: "space-between" }}>
                  <span>Volumetric Cadastre</span>
                  <span style={{ color: "#2563eb" }}>{floorCount} Units</span>
                </div>
                <div style={{ maxHeight: "160px", overflowY: "auto", paddingRight: "4px" }}>
                  {Array.from({ length: floorCount }).map((_, i) => {
                    // Generate mock data for the hackathon prototype
                    const isHovered = hoveredFloor === i;
                    const ulpin = generate3DUlpin(rawCenter.lat, rawCenter.lng, "A", i + 1);
                    const mockOwners = ["Ramesh Kumar", "Suresh Reddy", "Priya Sharma", "Abdul Khan", "Neha Gupta", "Vikram Singh", "Anjali Desai"];
                    const owner = mockOwners[(buildingId + i) % mockOwners.length];
                    const unitName = `Unit ${i + 1}01`;

                    return (
                      <div 
                        key={i} 
                        onPointerEnter={() => setHoveredFloor(i)}
                        onPointerLeave={() => setHoveredFloor(null)}
                        style={{ 
                          padding: "6px 8px", 
                          margin: "4px 0", 
                          backgroundColor: isHovered ? "rgba(251, 191, 36, 0.15)" : "rgba(243, 244, 246, 0.6)", 
                          borderLeft: isHovered ? "3px solid #fbbf24" : "3px solid #e5e7eb",
                          borderRadius: "0 4px 4px 0",
                          transition: "all 0.15s ease",
                          cursor: "pointer"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                          <span style={{ fontWeight: "600", fontSize: "11px", color: "#374151" }}>{unitName} (Floor {i + 1})</span>
                          <span style={{ fontSize: "10px", color: "#6b7280" }}>{owner}</span>
                        </div>
                        <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#2563eb", letterSpacing: "0.5px" }}>
                          {ulpin}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cut Building & Annotation */}
              <div style={{ marginTop: "10px", borderTop: "1px solid rgba(0, 0, 0, 0.08)", paddingTop: "8px", display: "flex", gap: "6px" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); closePopup(); toggleHidden(buildingId); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ flex: 1, padding: "6px 10px", backgroundColor: "rgba(239, 68, 68, 0.08)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "6px", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}
                >✂ Cut</button>
                <button
                  onClick={(e) => { e.stopPropagation(); openAnnotationEditor(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ flex: 1, padding: "6px 10px", backgroundColor: "rgba(37, 99, 235, 0.08)", color: "#2563eb", border: "1px solid rgba(37, 99, 235, 0.2)", borderRadius: "6px", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}
                >📌 Annotate</button>
              </div>
            </div>
          </Html>
        )}
    </group>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0" }}>
      <span style={{ fontWeight: "500", color: "#5f6368" }}>{label}:</span>
      <span style={{ textTransform: "capitalize" }}>{value}</span>
    </div>
  );
}

// ─── Roads (pre-cached for HITEC City, API+fallback for custom areas) ───
function Roads() {
  const [roads, setRoads] = useState([]);
  const center = useAreaStore((state) => state.center);

  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;
  const project = createProjection(refLat, refLng);

  // Generate curved synthetic roads as fallback
  const generateSyntheticRoads = (south, west, north, east) => {
    const synth = [];
    // Main arterial roads (3 horizontal, 3 vertical) with curves
    const hLats = [south + (north-south)*0.25, (south+north)/2, south + (north-south)*0.75];
    const vLngs = [west + (east-west)*0.25, (west+east)/2, west + (east-west)*0.75];
    
    hLats.forEach((lat, idx) => {
      const geom = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        geom.push({ lat: lat + Math.sin(t * Math.PI * 3) * 0.0002, lon: west + t * (east - west) });
      }
      synth.push({ id: 7100000 + idx, tags: { highway: "primary" }, geometry: geom });
    });
    
    vLngs.forEach((lng, idx) => {
      const geom = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        geom.push({ lat: south + t * (north - south), lon: lng + Math.sin(t * Math.PI * 2.5) * 0.0002 });
      }
      synth.push({ id: 7100010 + idx, tags: { highway: "primary" }, geometry: geom });
    });
    
    // Secondary / residential roads with organic curves
    for (let i = 0; i < 40; i++) {
      const isH = Math.random() > 0.5;
      const geom = [];
      const steps = 8 + Math.floor(Math.random() * 8);
      if (isH) {
        const lat = south + Math.random() * (north - south);
        const startLng = west + Math.random() * (east - west) * 0.5;
        const span = 0.003 + Math.random() * 0.008;
        for (let j = 0; j <= steps; j++) {
          const t = j / steps;
          geom.push({ lat: lat + Math.sin(t * Math.PI * 2) * 0.00015, lon: startLng + t * span });
        }
      } else {
        const lng = west + Math.random() * (east - west);
        const startLat = south + Math.random() * (north - south) * 0.5;
        const span = 0.002 + Math.random() * 0.006;
        for (let j = 0; j <= steps; j++) {
          const t = j / steps;
          geom.push({ lat: startLat + t * span, lon: lng + Math.sin(t * Math.PI * 1.5) * 0.00012 });
        }
      }
      synth.push({ id: 7101000 + i, tags: { highway: "residential" }, geometry: geom });
    }
    return synth;
  };

  useEffect(() => {
    if (!center || center.length < 2) return;
    const south = Math.min(center[0].lat, center[1].lat);
    const north = Math.max(center[0].lat, center[1].lat);
    const west = Math.min(center[0].lng, center[1].lng);
    const east = Math.max(center[0].lng, center[1].lng);
    
    // Check if this is HITEC City bounds (pre-cached data)
    const isHitecCity = south > 17.43 && south < 17.46 && west > 78.36 && west < 78.40;
    
    if (isHitecCity) {
      import('../data/hitec_city_roads.json')
        .then((mod) => {
          const data = mod.default || mod;
          setRoads(data.roads || []);
        })
        .catch(() => setRoads(generateSyntheticRoads(south, west, north, east)));
      return;
    }
    
    // For custom areas, try Overpass API with fast timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const query = `[out:json][timeout:15];(way["highway"](${south},${west},${north},${east}););out body geom;`;
    
    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    })
      .then((res) => { clearTimeout(timeoutId); return res.json(); })
      .then((data) => {
        if (data.elements && data.elements.length > 0) {
          setRoads(data.elements);
        } else {
          setRoads(generateSyntheticRoads(south, west, north, east));
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setRoads(generateSyntheticRoads(south, west, north, east));
      });
  }, [center]);

  return (
    <>
      {roads.map((road) => {
        if (!road.geometry || road.geometry.length < 2) return null;
        const points = road.geometry.map((pt) => {
          const v = project(pt.lat, pt.lon);
          return new THREE.Vector3(v.x, 0.1, -v.y);
        });
        return (
          <Line key={road.id} points={points} color="#34f516" lineWidth={1} userData={{ exportToGLB: true }} />
        );
      })}
    </>
  );
}

// ─── GLB Export ───
function ExportHandler() {
  useEffect(() => {
    // We'll expose a global function for the App to call
    window.BhuDrishtiExport = () => {
      // Export is triggered from the App component
    };
  }, []);
  return null;
}

// ─── Auto-frame camera to fit all buildings ───
function AutoFrameCamera({ buildingsData }) {
  const { camera } = useThree();
  useEffect(() => {
    if (buildingsData.length === 0) return;

    // Calculate bounding box of all building marker positions
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    buildingsData.forEach((b) => {
      const pos = b.markerPosition;
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.z < minZ) minZ = pos.z;
      if (pos.z > maxZ) maxZ = pos.z;
      if (pos.y > maxY) maxY = pos.y;
    });

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const span = Math.max(spanX, spanZ, 50);

    // Position camera at 45 degrees looking at the center
    camera.position.set(cx + span * 0.6, span * 0.5, cz + span * 0.6);
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }, [buildingsData, camera]);

  return null;
}

// ─── Main Scene (matches VPMS Space component) ───
export default function CityDiorama() {
  const areas = useAreaStore((state) => state.areas);
  const center = useAreaStore((state) => state.center);
  const hiddenIds = useHiddenStore((s) => s.hiddenIds);

  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;
  const project = createProjection(refLat, refLng);

  // Pre-compute ALL building shapes in ONE useMemo (like VPMS)
  const buildingsData = useMemo(() => {
    const result = [];
    areas.forEach((bld) => {
      if (!bld.geometry || bld.geometry.length < 3) return;

      const shapePoints = bld.geometry.map((pt) => project(pt.lat, pt.lng));
      // Close the shape if not already closed
      if (!shapePoints[0].equals(shapePoints[shapePoints.length - 1])) {
        shapePoints.push(shapePoints[0]);
      }
      const shape = new THREE.Shape(shapePoints);

      let heightValue = parseFloat(bld.tags?.height || "");
      const heightLevels = parseFloat(bld.tags?.["building:levels"] || "");
      if (isNaN(heightValue)) heightValue = 10;
      if (!isNaN(heightLevels)) heightValue = heightLevels * 2.2;

      const extrudeSettings = { steps: 1, depth: heightValue, bevelEnabled: false };

      const rawLat = bld.geometry.reduce((sum, p) => sum + p.lat, 0) / bld.geometry.length;
      const rawLng = bld.geometry.reduce((sum, p) => sum + p.lng, 0) / bld.geometry.length;
      const floorCount = !isNaN(heightLevels) ? Math.round(heightLevels) : Math.max(1, Math.round(heightValue / 3));

      result.push({
        shape,
        extrudeSettings,
        tags: bld.tags,
        buildingId: bld.id,
        markerPosition: new THREE.Vector3(
          shapePoints.reduce((sum, point) => sum + point.x, 0) / shapePoints.length,
          heightValue + 0.4,
          -shapePoints.reduce((sum, point) => sum + point.y, 0) / shapePoints.length
        ),
        rawCenter: { lat: rawLat, lng: rawLng },
        floorCount,
      });
    });
    return result;
  }, [areas, refLat, refLng]);

  // Calculate scene bounds for ground plane & lights
  const sceneBounds = useMemo(() => {
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
    buildingsData.forEach((b) => {
      if (b.markerPosition.x < minX) minX = b.markerPosition.x;
      if (b.markerPosition.x > maxX) maxX = b.markerPosition.x;
      if (b.markerPosition.z < minZ) minZ = b.markerPosition.z;
      if (b.markerPosition.z > maxZ) maxZ = b.markerPosition.z;
    });
    const span = Math.max(maxX - minX, maxZ - minZ, 100);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    return { span, cx, cz };
  }, [buildingsData]);

  return (
    <Canvas camera={{ fov: 60, near: 0.1, far: 10000 }} style={{ width: "100%", height: "100%" }}>
      {/* Lighting — sun-like directional from above + ambient fill */}
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[sceneBounds.cx + sceneBounds.span, sceneBounds.span, sceneBounds.cz + sceneBounds.span * 0.5]}
        intensity={1.5}
        castShadow
      />
      <hemisphereLight skyColor="#b1e1ff" groundColor="#b97a20" intensity={0.4} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sceneBounds.cx, -0.05, sceneBounds.cz]} receiveShadow>
        <planeGeometry args={[sceneBounds.span * 3, sceneBounds.span * 3]} />
        <meshStandardMaterial color="#e8e8e0" roughness={0.95} />
      </mesh>

      {/* Buildings */}
      {buildingsData.map((item) =>
        hiddenIds.has(item.buildingId) ? null : (
          <Building
            key={item.buildingId}
            shape={item.shape}
            extrudeSettings={item.extrudeSettings}
            tags={item.tags}
            buildingId={item.buildingId}
            markerPosition={item.markerPosition}
            rawCenter={item.rawCenter}
            floorCount={item.floorCount}
          />
        )
      )}

      {/* Roads */}
      <Roads />

      {/* Auto-frame camera */}
      <AutoFrameCamera buildingsData={buildingsData} />

      {/* Sky & environment */}
      <Sky distance={450000} sunPosition={[5, 1, 2]} inclination={0} azimuth={0.25} />
      <Environment preset="city" />
      <OrbitControls
        makeDefault
        target={[sceneBounds.cx, 0, sceneBounds.cz]}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  );
}
