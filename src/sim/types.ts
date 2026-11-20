export type Vec3 = [number, number, number];
export type Night = 1 | 2 | 3;
export type GameStatus = "playing" | "paused" | "won" | "lost";
export type ShadeStatus = "spawning" | "wander" | "chase" | "recoil" | "stunned" | "drain";
export type DrifterStatus = "idle" | "chase" | "flee" | "removed";

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_relight: number;
  per_stun: number;
  per_stun_draining: number;
  per_dawn_lantern: number;
  per_flame_left: number;
}

export interface Tuning {
  player_speed: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
  night2_duration_s: number;
  night3_duration_s: number;
  fuel_max: number;
  fuel_decay_per_s: number;
  fuel_per_mote: number;
  relight_cost: number;
  win_ratio: number;
  drain_per_s: number;
  low_fuel_threshold: number;
  capacity_max: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  score: ScoreTuning;
}

export interface Lantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
  fuelUnits: number;
  everLit: boolean;
  relitCount: number;
}

export interface Mote {
  id: string;
  pos: Vec3;
  kind: "random" | "dropped";
  ttlTicksLeft?: number;
  availableFromTick: number;
}

export interface Shade {
  id: string;
  pos: Vec3;
  state: ShadeStatus;
  stateTicksLeft: number;
  recoilDirection: [number, number];
  pulsePushDirection: [number, number];
  pulsePushTicksLeft: number;
  pulsePushRemaining: number;
  safePushTarget?: Vec3;
  safePushTicksLeft: number;
  targetLanternId?: string;
  drainTicks: number;
}

export interface Drifter {
  id: string;
  pos: Vec3;
  state: DrifterStatus;
  stolen: number;
  stateTicksLeft: number;
  direction: [number, number];
}

export interface Charm {
  id: string;
  pos: Vec3;
  available: boolean;
  respawnTicksLeft: number;
}

export interface Wind {
  active: boolean;
  dirDeg: number;
  activeTicksLeft: number;
  nextGustTick: number;
}

export interface SpawnPad {
  pos: Vec3;
  velocityY: number;
  velocityXZ: [number, number];
}

export interface Player {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
  facingYaw: number;
  flames: number;
  carried: number;
  successfulLights: number;
  invulnTicks: number;
  dashCooldownTicks: number;
  dashTicksLeft: number;
  dashDirection: [number, number];
  pulseCooldownTicks: number;
  charmTicksLeft: number;
  respawnTicksLeft: number;
  springCooldownTicks: number;
  springFlightTicksLeft: number;
  springVelocity: [number, number];
}

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export interface InputFrame extends Partial<InputState> {
  tick: number;
}

export interface Scenario {
  player?: {
    pos?: Vec3;
    vel?: Vec3;
    carried?: number;
    flames?: number;
    invuln_ticks?: number;
    dash_cd_ticks?: number;
    pulse_cd_ticks?: number;
    charm_ticks?: number;
    successful_lights?: number;
  };
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: Array<Vec3 | {
    id?: string;
    pos: Vec3;
    kind?: "random" | "dropped";
    ttl_ticks?: number;
  }>;
  shades?: Array<{
    id?: string;
    pos: Vec3;
    state?: ShadeStatus;
    state_ticks_left?: number;
    target_lantern_id?: string;
  }>;
  drifters?: Array<{
    id?: string;
    pos: Vec3;
    state?: DrifterStatus;
    stolen?: number;
    state_ticks_left?: number;
  }>;
  charms?: Array<{
    id?: string;
    pos: Vec3;
    available?: boolean;
    respawn_ticks?: number;
  }>;
  lanterns?: Array<{
    id: string;
    pos?: Vec3;
    deposited?: number;
    lit?: boolean;
    fuel?: number;
    ever_lit?: boolean;
    relit_count?: number;
  }>;
  time_left_s?: number;
}

export interface GameEvent {
  type: "event";
  tick: number;
  name: string;
  data: Record<string, unknown>;
}

export interface GameState {
  tick: number;
  simTick: number;
  night: Night;
  status: GameStatus;
  reason?: "dawn_survived" | "dawn" | "no_flames";
  timeLeftTicks: number;
  score: number;
  player: Player;
  lanterns: Lantern[];
  motes: Mote[];
  shades: Shade[];
  drifters: Drifter[];
  charms: Charm[];
  wind: Wind;
  spawnPos: Vec3;
  moteSpawnPoints: Vec3[];
  shadeSpawnPoints: Vec3[];
  nextMoteSpawnTick: number;
  nextShadeSpawnTick: number;
  nextDrifterSpawnTick: number;
  randomMotes: boolean;
  randomShades: boolean;
  randomDrifters: boolean;
  windEnabled: boolean;
  rngState: number;
  nextMoteId: number;
  nextShadeId: number;
  nextDrifterId: number;
  pendingEvents: GameEvent[];
  previousInput: InputState;
}
