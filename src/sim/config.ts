import type { Tuning } from "./types";

export const TICK_RATE = 60;
export const ISLAND_RADIUS = 30;
export const TUNING: Tuning = {
  player_speed: 5,
  carry_capacity: 5,
  lantern_cost: 5,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2,
  pulse_cost: 1,
  pulse_radius: 5,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 3,
  pulse_cooldown_s: 2,
  safe_radius: 5,
  shade_speed: 2,
  shade_hit_radius: 1,
  fall_enabled: false,
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 25,
    per_second_left: 1,
    per_flame_left: 50,
  },
};

export const LANTERN_POSITIONS = [
  [0, 0, 20],
  [19.02, 0, 6.18],
  [11.76, 0, -16.18],
  [-11.76, 0, -16.18],
  [-19.02, 0, 6.18],
] as const;

export const EMPTY_INPUT = (): {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
} => ({
  move: [0, 0],
  cam_yaw_deg: 0,
  jump: false,
  interact: false,
  pulse: false,
});
