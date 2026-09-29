import * as Cesium from 'cesium';

/**
 * HUD card that shows info about a clicked OSM 3D building.
 * Receives `buildingInfo` object from getBuildingInfo() and
 * `buildingCount` for the total buildings in the selected ROI.
 */
export default function BuildingHUD({ buildingInfo, buildingCount, onClose }) {
  if (!buildingInfo) return null;

  return (
    <aside className="hud" aria-label="Building information">
      <header className="hud-head">
        <div>
          <h2>{buildingInfo.name}</h2>
          <p className="hud-sub">{buildingInfo.type}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close building card">
          Close
        </button>
      </header>

      <dl className="hud-rows">
        {buildingInfo.height && (
          <div>
            <dt>Height</dt>
            <dd>{buildingInfo.height.toFixed(1)} m</dd>
          </div>
        )}
        {buildingInfo.levels && (
          <div>
            <dt>Floors</dt>
            <dd>{buildingInfo.levels}</dd>
          </div>
        )}
        {buildingInfo.address && (
          <div>
            <dt>Address</dt>
            <dd>{buildingInfo.address}</dd>
          </div>
        )}
        <div>
          <dt>Data source</dt>
          <dd>
            <span className="badge-ok">OpenStreetMap</span>
          </dd>
        </div>
      </dl>
    </aside>
  );
}
