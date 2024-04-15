export const buffer_u8 = 'buffer_u8';
export const buffer_s8 = 'buffer_s8';
export const buffer_u16 = 'buffer_u16';
export const buffer_s16 = 'buffer_s16';
export const buffer_u32 = 'buffer_u32';
export const buffer_s32 = 'buffer_s32';
export const buffer_u64 = 'buffer_u64';
export const buffer_f32 = 'buffer_f32';
export const buffer_f64 = 'buffer_f64';
export const buffer_bool = 'buffer_bool';
export const buffer_string = 'buffer_string';

export type GameMakerBufferType =
  | typeof buffer_u8
  | typeof buffer_s8
  | typeof buffer_u16
  | typeof buffer_s16
  | typeof buffer_f32
  | typeof buffer_bool
  | typeof buffer_u32
  | typeof buffer_s32
  | typeof buffer_u64
  | typeof buffer_f64
  | typeof buffer_string;
