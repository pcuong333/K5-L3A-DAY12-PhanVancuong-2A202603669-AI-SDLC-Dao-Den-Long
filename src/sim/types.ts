export type Vec3 = [number, number, number];
export type GameStatus = "playing" | "won" | "lost";
export type ShadeStatus = "chase" | "stunned";

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
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
}

export interface Mote {
  id: string;
  pos: Vec3;
}

export interface Shade {
  id: string;
  pos: Vec3;
  state: ShadeStatus;
  stunTicksLeft: number;
}

export interface Player {
  pos: Vec3;
  flames: number;
  carried: number;
  invulnTicks: number;
  jumpVelocity: number;
}

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
}

export interface InputFrame extends Partial<InputState> {
  tick: number;
}

export interface Scenario {
  player?: {
    pos?: Vec3;
    carried?: number;
    flames?: number;
  };
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: Array<Vec3 | { id?: string; pos: Vec3 }>;
  shades?: Array<{ id?: string; pos: Vec3 }>;
  lanterns?: Array<{
    id: string;
    pos?: Vec3;
    deposited?: number;
    lit?: boolean;
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
  status: GameStatus;
  reason?: "all_lit" | "dawn" | "no_flames";
  timeLeftTicks: number;
  score: number;
  player: Player;
  lanterns: Lantern[];
  motes: Mote[];
  shades: Shade[];
  randomMotes: boolean;
  randomShades: boolean;
  rngState: number;
  nextMoteId: number;
  nextShadeId: number;
  nextShadeSpawnTick: number;
  pulseCooldownTicks: number;
  previousInput: InputState;
}
