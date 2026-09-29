import { useEffect } from 'react';
import * as Cesium from 'cesium';
import { getFloor, isRoiActive } from '../tools/roiSlicer';
import { formatUlpin, V_TYPES } from '../utils/ulpinGenerator';

const HIGHLIGHT = Cesium.Color.YELLOW.withAlpha(0.85);

/**
 * Click-to-inspect: picks a floor with the GPU picker, reports it via onSelect,
 * paints it yellow while selected, and shows the property card.
 */
export default function PropertyHUD({ viewer, selected, onSelect }) {
  // Left-click picking
  useEffect(() => {
    if (!viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      if (isRoiActive()) return;
      const picked = viewer.scene.pick(click.position);
      const id = Cesium.defined(picked) && picked.id instanceof Cesium.Entity ? picked.id.id : null;
      onSelect(id && getFloor(id) ? id : null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [viewer, onSelect]);

  // Yellow highlight, restored when selection changes
  useEffect(() => {
    if (!viewer || !selected) return;
    const entity = viewer.entities.getById(selected);
    if (!entity?.polygon) return;
    entity.polygon.material = HIGHLIGHT;
    return () => {
      const data = getFloor(selected);
      if (entity.polygon && data) entity.polygon.material = data.baseColor;
    };
  }, [viewer, selected]);

  const data = selected ? getFloor(selected) : null;
  if (!data) return null;

  return (
    <aside className="hud" aria-label="Urban property card">
      <header className="hud-head">
        <div>
          <h2>Urban Property Card</h2>
          <p className="hud-sub">{data.label}</p>
        </div>
        <button className="icon-btn" onClick={() => onSelect(null)} aria-label="Close property card">
          Close
        </button>
      </header>

      <dl className="hud-rows">
        <div>
          <dt>3D-ULPIN</dt>
          <dd className="ulpin">{formatUlpin(data.ulpin)}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{data.owner}</dd>
        </div>
        <div>
          <dt>Floor and domain</dt>
          <dd>
            {data.label}, {V_TYPES[data.vType]}
          </dd>
        </div>
        <div>
          <dt>Built-up area</dt>
          <dd>{data.area} sq.m</dd>
        </div>
        <div>
          <dt>Encumbrance</dt>
          <dd>
            <span className="badge-ok">{data.encumbrance}</span>
          </dd>
        </div>
      </dl>
    </aside>
  );
}
