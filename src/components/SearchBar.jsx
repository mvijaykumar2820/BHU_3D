import { useState } from 'react';
import * as Cesium from 'cesium';
import { getFloor } from '../tools/roiSlicer';
import { isValidUlpin, normalizeUlpin } from '../utils/ulpinGenerator';

/** Search by 18-character 3D-ULPIN (hyphens optional). Flies in at 45 degrees. */
export default function SearchBar({ viewer, onSelect }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!viewer) return;

    const id = normalizeUlpin(value);
    if (!isValidUlpin(id)) {
      setError('Enter a valid 18-character 3D-ULPIN.');
      return;
    }
    const data = getFloor(id);
    if (!data) {
      setError('No unit found for this ID. Draw an ROI first.');
      return;
    }

    setError('');
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(data.center, data.radius), {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(20), Cesium.Math.toRadians(-45), data.radius * 3),
      duration: 2,
    });
    onSelect(id);
  };

  return (
    <form className="search" onSubmit={submit} role="search">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search 3D-ULPIN, e.g. 12345678901234-A-G1-1"
        spellCheck={false}
        aria-label="3D-ULPIN"
        aria-invalid={!!error}
      />
      <button type="submit">Find unit</button>
      {error && <p className="search-error" role="alert">{error}</p>}
    </form>
  );
}
