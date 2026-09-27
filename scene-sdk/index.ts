/**
 * Scene SDK — the stable public surface.
 *
 * The Scene Agent may ONLY compose components exported from this module.
 * Anything not exported here is not part of the contract.
 */

export {
  OfficeBuilding,
  OfficeTower,
  AgentControlCenter,
  DataCenter,
  Warehouse,
  DistributionCenter,
  Factory,
  Workshop,
  Airport,
  ControlTower,
  TargetApplication,
} from './buildings';

export { Person, RequestEntity } from './primitives/people';

export { Car, Truck, RobotWorker, Airplane } from './primitives/vehicles';
export type { VehicleProps } from './primitives/vehicles';

export { Road, Bridge, AirRoute, Pipe, Beam, DataRoute } from './primitives/connections';

export {
  PulseEffect,
  SuccessEffect,
  FailureEffect,
  ParticleEffect,
  Label,
} from './primitives/effects';
export type { EffectProps, LabelProps } from './primitives/effects';

export {
  MoveAlongPath,
  MoveAlongArc,
  Pulse,
  Spawn,
  Enter,
  Exit,
  Orbit,
} from './behaviors';
export type { BehaviorProps } from './behaviors';

export type { SceneEntityProps, SceneConnectionProps, SceneTransform } from './primitives/types';
export { DEFAULT_ACCENT, SUCCESS_ACCENT, FAILURE_ACCENT, HIGHLIGHT_ACCENT } from './primitives/types';