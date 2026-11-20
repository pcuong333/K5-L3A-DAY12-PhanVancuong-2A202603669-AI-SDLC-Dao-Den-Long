import type { Tuning } from "./types";

export const TICK_RATE = 60;
export const ISLAND_RADIUS = 40;
export const TUNING: Tuning = {
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 10,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2,
  pulse_cost: 3,
  pulse_radius: 5,
  night1_duration_s: 300,
  night2_duration_s: 330,
  night3_duration_s: 360,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 3,
  dash_speed: 14,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  safe_radius: 6,
  shade_speed: 4,
  shade_hit_radius: 1,
  fall_enabled: true,
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 5,
    per_second_left: 2,
    per_flame_left: 50,
  },
};

export const LANTERN_POSITIONS = [
  [0, 0, 25],
  [23.8, 0, 7.7],
  [14.7, 0, -20.2],
  [-14.7, 0, -20.2],
  [-23.8, 0, 7.7],
] as const;

export const NIGHT2_LANTERN_POSITIONS = [
  [0, 0, 20],
  [17, 0, -10],
  [-17, 0, -10],
  [70, 0, 20],
  [87, 0, -10],
  [53, 0, -10],
] as const;

export const NIGHT3_LANTERN_POSITIONS = [
  [0, 6, 6],
  [18, 3, 10],
  [-18, 3, 10],
  [35, 0, -10],
  [-35, 0, -10],
  [20, 0, -35],
  [-20, 0, -35],
] as const;

export const EMPTY_INPUT = (): {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
} => ({
  move: [0, 0],
  cam_yaw_deg: 0,
  jump: false,
  interact: false,
  pulse: false,
  dash: false,
  pause: false,
});
