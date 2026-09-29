import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { latLonToMeters } from '../utils/geoMath';

function BuildingMesh({ building, originLat, originLon, isSelected, onClick }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    building.geometry.forEach((pt, i) => {
      const { x, z } = latLonToMeters(pt.lat, pt.lon, originLat, originLon);
      // Three.js shapes are drawn in X,Y then extruded along Z. 
      // But we want them on the X,Z ground plane, extruded along Y.
      // So we draw the shape on X,Y where Y represents the map's North/South.
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });

    // Parse height
    let height = 10;
    if (building.tags?.height) {
      const parsed = parseFloat(building.tags.height);
      if (!isNaN(parsed)) height = parsed;
    } else if (building.tags?.['building:levels']) {
      const lvl = parseInt(building.tags['building:levels'], 10);
      if (!isNaN(lvl)) height = lvl * 3;
    }

    const extrudeSettings = {
      depth: height,
      bevelEnabled: false,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // The geometry is extruded along +Z. We need it extruded along +Y.
    // Rotate it so the shape plane (X,Y) becomes (X,Z)
    geom.rotateX(Math.PI / 2);
    // Now it extrudes downwards (-Y). Translate it up so base is at 0.
    geom.translate(0, height, 0);

    return geom;
  }, [building, originLat, originLon]);

  return (
    <mesh geometry={geometry} onClick={(e) => { e.stopPropagation(); onClick(building); }} castShadow receiveShadow>
      <meshStandardMaterial 
        color={isSelected ? '#facc15' : '#ffffff'} 
        roughness={0.8}
        metalness={0.1}
      />
      <Edges color={isSelected ? "#ca8a04" : "#e5e7eb"} />
    </mesh>
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
        points.push(
          new THREE.Vector3(m1.x, 0.1, m1.z),
          new THREE.Vector3(m2.x, 0.1, m2.z)
        );
      }
    });
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    return geom;
  }, [roads, originLat, originLon]);

  return (
    <lineSegments geometry={lineSegments}>
      <lineBasicMaterial color="#4ade80" opacity={0.6} transparent />
    </lineSegments>
  );
}

export default function CityDiorama({ buildings, roads, originLat, originLon, selectedBuildingId, onSelectBuilding }) {
  return (
    <Canvas shadows camera={{ position: [200, 200, 200], fov: 45 }} style={{ background: '#eaecef' }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[100, 200, 50]} intensity={1} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-500, 500, 500, -500]} />
      </directionalLight>

      <group>
        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[2000, 2000]} />
          <meshStandardMaterial color="#f3f4f6" roughness={1} />
        </mesh>

        <RoadLines roads={roads} originLat={originLat} originLon={originLon} />

        {buildings.map(b => (
          <BuildingMesh 
            key={b.id} 
            building={b} 
            originLat={originLat} 
            originLon={originLon} 
            isSelected={b.id === selectedBuildingId}
            onClick={onSelectBuilding}
          />
        ))}
      </group>

      <ContactShadows resolution={1024} scale={1000} blur={2} opacity={0.5} far={100} color="#000000" />
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2 - 0.05} />
      <Environment preset="city" />
    </Canvas>
  );
}
