import React, { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, Edges, Html } from '@react-three/drei';
import * as THREE from 'three';
import { latLonToMeters } from '../utils/geoMath';
import { useAppStore } from '../store';

// ─── Color palette for building types ───
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
  default: "#f1f5f9",
};

const ANNOTATION_COLORS = {
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  green: "#22c55e",
};

function getBuildingColor(tags) {
  const buildingType = tags.building ?? "default";
  return BUILDING_COLORS[buildingType] ?? BUILDING_COLORS.default;
}

// Generates a mock ULPIN deterministically from lat/lon and floor number
function generateFloorUlpin(lat, lon, floor) {
  const latPart = Math.round((lat + 90) * 100000).toString().padStart(7, "0");
  const lngPart = Math.round((lon + 180) * 100000).toString().padStart(7, "0");
  return `${latPart}${lngPart}-F${floor.toString().padStart(2, "0")}`;
}

function BuildingMesh({ building, originLat, originLon }) {
  const [hovered, setHovered] = useState(false);
  const [hoverPos, setHoverPos] = useState(null);
  
  // State from Zustand
  const isSelected = useAppStore(s => s.selectedBuildingId === building.id);
  const isHidden = useAppStore(s => s.hiddenIds.has(building.id));
  const selectBuilding = useAppStore(s => s.selectBuilding);
  const annotation = useAppStore(s => s.annotations[building.id]);
  const upsertAnnotation = useAppStore(s => s.upsertAnnotation);
  const removeAnnotation = useAppStore(s => s.removeAnnotation);

  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [annotTitle, setAnnotTitle] = useState("");
  const [annotNotes, setAnnotNotes] = useState("");
  const [annotColor, setAnnotColor] = useState("red");

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    building.geometry.forEach((pt, i) => {
      const { x, z } = latLonToMeters(pt.lat, pt.lon, originLat, originLon);
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });

    let height = 10;
    if (building.tags?.height) height = parseFloat(building.tags.height) || 10;
    else if (building.tags?.['building:levels']) height = parseInt(building.tags['building:levels'], 10) * 3 || 10;

    const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geom.rotateX(Math.PI / 2);
    geom.translate(0, height, 0);
    geom.computeBoundingBox();
    
    return { geom, height };
  }, [building, originLat, originLon]);

  if (isHidden) return null;

  const baseColor = getBuildingColor(building.tags);
  const displayColor = isSelected ? "#38b2ac" : hovered ? "#d4c8b8" : baseColor;

  // Center coordinate for ULPIN generator
  const centerLat = building.geometry[0].lat;
  const centerLon = building.geometry[0].lon;
  const floorsCount = building.tags?.['building:levels'] ? parseInt(building.tags['building:levels']) : Math.max(1, Math.floor(geometry.height / 3));

  const openAnnotationEditor = () => {
    setAnnotTitle(annotation?.title ?? "");
    setAnnotNotes(annotation?.notes ?? "");
    setAnnotColor(annotation?.color ?? "red");
    setShowAnnotationForm(true);
  };

  return (
    <group>
      {annotation && (
        <group position={[
          (geometry.geom.boundingBox.min.x + geometry.geom.boundingBox.max.x)/2, 
          geometry.height + 2, 
          (geometry.geom.boundingBox.min.z + geometry.geom.boundingBox.max.z)/2
        ]}>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[1, 1, 8, 12]} />
            <meshBasicMaterial color={ANNOTATION_COLORS[annotation.color]} transparent opacity={0.5} />
          </mesh>
          <Html position={[0, 9, 0]} center zIndexRange={[100, 0]}>
            <div style={{
              padding: "4px 10px", borderRadius: "20px", background: "rgba(255,255,255,0.9)",
              border: `2px solid ${ANNOTATION_COLORS[annotation.color]}`, color: "#111827",
              fontWeight: "bold", fontSize: "12px", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}>
              {annotation.title}
            </div>
          </Html>
        </group>
      )}

      <mesh 
        geometry={geometry.geom} 
        castShadow 
        receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
        onPointerMove={(e) => { e.stopPropagation(); setHoverPos(e.point.clone()); }}
        onClick={(e) => { e.stopPropagation(); selectBuilding(isSelected ? null : building.id); }}
        onContextMenu={(e) => { 
          e.stopPropagation(); 
          selectBuilding(building.id);
          openAnnotationEditor();
        }}
      >
        <meshStandardMaterial color={displayColor} roughness={0.8} metalness={0.1} />
        <Edges color={isSelected ? "#ca8a04" : (hovered ? "#9ca3af" : "#e5e7eb")} />
        
        {/* The Floating UI just like VPMS */}
        {(hovered || isSelected) && hoverPos && (
          <Html position={[hoverPos.x, geometry.height + 2, hoverPos.z]} center zIndexRange={[100, 0]}>
            <div style={{
              background: "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(10px)",
              padding: "16px", borderRadius: "12px", width: "260px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)", fontFamily: "sans-serif", color: "#1f2937"
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '8px' }}>
                <strong style={{ fontSize: '14px' }}>{building.tags?.name || "Building"}</strong>
                <button onClick={(e) => { e.stopPropagation(); selectBuilding(null); setHovered(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>×</button>
              </div>

              {showAnnotationForm ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input value={annotTitle} onChange={e => setAnnotTitle(e.target.value)} placeholder="Annotation Title" style={{ padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                  <textarea value={annotNotes} onChange={e => setAnnotNotes(e.target.value)} placeholder="Notes..." style={{ padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', minHeight: '60px' }} />
                  
                  <div style={{ display: 'flex', gap: '8px', margin: '4px 0' }}>
                    {Object.entries(ANNOTATION_COLORS).map(([name, color]) => (
                      <div key={name} onClick={() => setAnnotColor(name)} style={{ width: '24px', height: '24px', borderRadius: '12px', background: color, border: annotColor === name ? '2px solid black' : 'none', cursor: 'pointer' }} />
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button onClick={() => { removeAnnotation(building.id); setShowAnnotationForm(false); }} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                    <div>
                      <button onClick={() => setShowAnnotationForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '8px' }}>Cancel</button>
                      <button onClick={() => { upsertAnnotation(building.id, { title: annotTitle, notes: annotNotes, color: annotColor }); setShowAnnotationForm(false); }} style={{ background: '#2563eb', color: 'white', padding: '4px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '12px', marginBottom: '8px', color: '#4b5563' }}>
                    <div><strong>Type:</strong> {building.tags?.building || 'yes'}</div>
                    <div><strong>Height:</strong> {geometry.height.toFixed(1)} m</div>
                    <div><strong>Floors:</strong> {floorsCount}</div>
                  </div>

                  <div style={{ fontSize: '11px', background: '#f3f4f6', padding: '8px', borderRadius: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Generated Floor ULPINs</div>
                    {Array.from({ length: floorsCount }).map((_, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #e5e7eb', fontFamily: 'monospace' }}>
                        <span>Floor {i+1}</span>
                        <span style={{ color: '#2563eb' }}>{generateFloorUlpin(centerLat, centerLon, i+1)}</span>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => openAnnotationEditor()} style={{ marginTop: '10px', width: '100%', padding: '6px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    Add Annotation (Right-Click)
                  </button>
                </>
              )}
            </div>
          </Html>
        )}
      </mesh>
    </group>
  );
}

function RoadLines({ roads, originLat, originLon }) {
  const lineSegments = useMemo(() => {
    const points = [];
    roads.forEach(road => {
      for (let i = 0; i < road.geometry.length - 1; i++) {
        const p1 = road.geometry[i];
        const p2 = road.geometry[i+1];
        const m1 = latLonToMeters(p1.lat, p1.lon, originLat, originLon);
        const m2 = latLonToMeters(p2.lat, p2.lon, originLat, originLon);
        points.push(new THREE.Vector3(m1.x, 0.5, m1.z), new THREE.Vector3(m2.x, 0.5, m2.z));
      }
    });
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [roads, originLat, originLon]);

  return (
    <lineSegments geometry={lineSegments}>
      <lineBasicMaterial color="#10b981" opacity={0.7} transparent linewidth={2} />
    </lineSegments>
  );
}

export default function CityDiorama({ buildings, roads, originLat, originLon }) {
  return (
    <Canvas shadows camera={{ position: [250, 250, 250], fov: 40 }} style={{ background: '#e2e8f0' }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[200, 400, 100]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-800, 800, 800, -800]} />
      </directionalLight>

      <group>
        {/* Beautiful Ground Plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.1, 0]}>
          <planeGeometry args={[4000, 4000]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.9} />
        </mesh>

        <RoadLines roads={roads} originLat={originLat} originLon={originLon} />

        {buildings.map(b => (
          <BuildingMesh key={b.id} building={b} originLat={originLat} originLon={originLon} />
        ))}
      </group>

      {/* Realistic soft shadows on the ground */}
      <ContactShadows resolution={1024} scale={2000} blur={2.5} opacity={0.4} far={200} color="#000000" />
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2 - 0.02} maxDistance={2000} />
      <Environment preset="city" />
    </Canvas>
  );
}
